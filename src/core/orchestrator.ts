// src/core/orchestrator.ts
import type { Session, Result } from './types';
import type { TimeSink, FieldSpec } from './sink';
import type { OAuthManager } from './oauth';
import type { PromptService } from './prompts';

const MAX_EXPORT_RETRIES = 3;

export class ExportOrchestrator {
  constructor(
    private readonly sinks: TimeSink[],
    private readonly prompts: PromptService,
    private readonly oauth?: OAuthManager
  ) {}

  async hydrateAndExport(session: Session): Promise<Array<{ kind: string } & Result>> {
    const results: Array<{ kind: string } & Result> = [];

    for (const sink of this.sinks) {
      const kind = sink.kind;
      try {
        const reqs: FieldSpec[] =
          typeof sink.requirements === 'function' ? (sink.requirements() || []) : [];

        // 1) Resolve + inject
        await this.resolveAndInjectRequirements(sink, reqs, session);

        // 2) Guard: if any required fields are still missing → skip this sink
        const missingAfterHydrate = this.requiredMissing(reqs, sink, session);
        if (missingAfterHydrate.length > 0) {
          const msg = `Skipped: missing required fields (${missingAfterHydrate.join(', ')})`;
          results.push({ kind, ok: true, message: msg });
          continue;
        }

        // 3) Validate if sink exposes validate()
        if (typeof sink.validate === 'function') {
          const v = sink.validate();
          if (!v?.ok) {
            const missing = (v?.missing || []).join(', ');
            const msg = missing
              ? `Skipped: invalid config (${missing})`
              : 'Skipped: invalid config';
            results.push({ kind, ok: true, message: msg });
            continue;
          }
        }

        // 4) Export with retry-on-server-rejection
        const usesOAuth = (sink as any).export.length >= 2;
        const res = await this.attemptWithReentryOnServerRejection(
          sink,
          session,
          reqs,
          usesOAuth ? this.oauth : undefined
        );

        results.push({ kind, ...res });
      } catch (e: any) {
        const msg = e?.message || String(e);
        console.warn(`TimeIt: sink "${kind}" failed:`, msg);
        results.push({ kind, ok: false, message: msg, error: e });
      }
    }

    return results;
  }

  private async resolveAndInjectRequirements(
    sink: TimeSink,
    specs: FieldSpec[],
    session: Session
  ): Promise<void> {
    if (!specs?.length) {return;}

    const opts = ((sink as any).options = (sink as any).options ?? {});

// src/core/orchestrator.ts  (inside resolveAndInjectRequirements loop)

    for (const spec of specs) {
      const currentFromSession = this.valueFromSession(session, spec.key);
      const current = this.pickExistingValue((opts as any)[spec.key], currentFromSession);

      //NEW: if we have a value but it fails the sink's validate(), force a prompt
      const currentInvalid =
        spec.required &&
        !this.isEmpty(current) &&
        typeof spec.validate === 'function' &&
        !!spec.validate(current);

      const needsValue = spec.required && (this.isEmpty(current) || currentInvalid);

      const resolved = needsValue
        ? await this.prompts.resolveField(spec, this.isEmpty(current) ? undefined : current)
        : (current ?? undefined);

      if (spec.required && this.isEmpty(resolved)) {
        // don’t throw; allow validate() or retryable flow to decide; leave missing
        continue;
      }

      if (!this.isEmpty(resolved)) {
        (opts as any)[spec.key] = resolved;
      } else if (!this.isEmpty(current)) {
        (opts as any)[spec.key] = current;
      }
    }
  }

  /**
   * Retry loop that handles sinks returning { ok:false, retryable:true, field:'...', hint?:string }.
   * Works for both OAuth and non-OAuth sinks.
   */
  private async attemptWithReentryOnServerRejection(
    sink: TimeSink,
    session: Session,
    reqs: FieldSpec[],
    oauth?: OAuthManager
  ): Promise<Result> {
    let attempts = 0;

    const callExport = () =>
      oauth && (sink as any).export.length >= 2
        ? (sink as any).export(session, oauth) as Promise<Result>
        : sink.export(session);

    let res = await callExport();

    while (
      attempts < MAX_EXPORT_RETRIES &&
      !res.ok &&
      (res as any).retryable &&
      (res as any).field
    ) {
      const fieldKey = String((res as any).field);
      const spec = reqs.find(s => s.key === fieldKey);
      if (!spec) {break;}

      // Force re-prompt with the sink/session’s current value as "current"
      const currentVal = this._readCurrent(spec, sink, session);
      const newVal = await this.prompts.resolveField(
        { ...spec, required: true, placeholder: spec.placeholder || (res as any).hint },
        currentVal
      );
      if (this.isEmpty(newVal)) {
        res = { ok: false, message: `Failed to re-prompt for field ${spec.key}`, code: 'missing_field' };
        break;
      }

      this._inject(spec, newVal, sink, session);
      res = await callExport();
      attempts++;
    }

    return res;
  }

  private _readCurrent(spec: FieldSpec, sink: TimeSink, session: Session): unknown {
    const opts = (sink as any).options as Record<string, unknown> | undefined;
    if (opts && spec.key in opts) {return opts[spec.key];}
    if (spec.scope === 'runtime' && (spec.key in (session as any))) {return (session as any)[spec.key];}
    if ((session.meta as any)?.fields && spec.key in (session.meta as any).fields) {
      return (session.meta as any).fields[spec.key];
    }
    return undefined;
  }

  private _inject(spec: FieldSpec, val: unknown, sink: TimeSink, session: Session) {
    if (val === undefined) {return;}
    const opts = (sink as any).options as Record<string, unknown> | undefined;

    if (spec.scope === 'setup') {
      if (opts) {opts[spec.key] = val;}
      return;
    }
    // runtime field
    if (spec.key in (session as any)) {
      (session as any)[spec.key] = val;
    } else {
      session.meta = session.meta || {};
      (session.meta as any).fields = (session.meta as any).fields || {};
      (session.meta as any).fields[spec.key] = val;
    }
  }

  /** Collect required fields that are still empty after prompting/injection. */
  private requiredMissing(specs: FieldSpec[], sink: TimeSink, session: Session): string[] {
    const opts = (sink as any).options as Record<string, unknown> | undefined;
    const missing: string[] = [];
    for (const s of specs) {
      if (!s.required) {continue;}

      const fromOpts = opts ? opts[s.key] : undefined;
      const fromSession = this.valueFromSession(session, s.key);
      const val = this.pickExistingValue(fromOpts, fromSession);

      if (this.isEmpty(val)) {missing.push(s.key);}
    }
    return missing;
  }

  private pickExistingValue(optionValue: unknown, sessionValue: unknown): unknown {
    return !this.isEmpty(optionValue) ? optionValue : sessionValue;
  }

  private valueFromSession(session: Session, key: string): unknown {
    switch (key) {
      case 'issueKey':  return session.issueKey ?? undefined;
      case 'comment':   return session.comment ?? undefined;
      case 'branch':    return session.branch ?? undefined;
      case 'repoPath':  return session.repoPath ?? undefined;
      case 'workspace': return session.workspace ?? undefined;
      default:          return undefined;
    }
  }

  private isEmpty(v: unknown): boolean {
    return v === undefined || v === null || (typeof v === 'string' && v.trim() === '');
  }
}