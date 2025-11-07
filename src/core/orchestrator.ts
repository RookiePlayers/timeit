// src/core/orchestrator.ts
import type { Session, Result } from './types';
import type { TimeSink, FieldSpec } from './sink';
import type { OAuthManager } from './oauth';
import type { PromptService } from './prompts';

/**
 * ExportOrchestrator
 * - Collects each sink's FieldSpec requirements()
 * - Resolves required fields via PromptService (with persistence handled by PromptService)
 * - Injects resolved values into sink.options (if present)
 * - Validates each sink; skips gracefully if still invalid
 * - Exports the session to each sink (passing OAuthManager when supported)
 */
export class ExportOrchestrator {
  constructor(
    private readonly sinks: TimeSink[],
    private readonly prompts: PromptService,
    private readonly oauth?: OAuthManager
  ) {}

  /**
   * Hydrates sinks (prompts for missing required fields) and exports the given session.
   * Returns per-sink results (kind + Result).
   */
  async hydrateAndExport(session: Session): Promise<Array<{ kind: string } & Result>> {
    const results: Array<{ kind: string } & Result> = [];

    for (const sink of this.sinks) {
      const kind = sink.kind;

      try {
        // 1) Gather requirement specs from sink (if any)
        const reqs: FieldSpec[] = (typeof sink.requirements === 'function')
          ? (sink.requirements() || [])
          : [];

        // 2) Resolve required fields via PromptService
        //    We only prompt for fields that are missing/empty on the sink.options.
        //    PromptService handles persistence (SecretStorage / settings) based on FieldSpec.
        await this.resolveAndInjectRequirements(sink, reqs, session);

        // 3) Validate post-hydration (if sink exposes validate)
        if (typeof sink.validate === 'function') {
          const v = sink.validate();
          if (!v?.ok) {
            const missing = (v?.missing || []).join(', ');
            console.warn(`TimeIt: ${kind} invalid after hydrate; missing: ${missing}`);
            results.push({ kind, ok: true, message: `Skipped: invalid config (${missing})` });
            continue;
          }
        }

        // 4) Export — pass OAuthManager when supported (arity >= 2)
        //    (session, oauth) signature is used by BaseOAuthSink; legacy sinks use (session)
        const usesOAuth = (sink as any).export.length >= 2;
        const res: Result = usesOAuth && this.oauth
          ? await (sink as any).export(session, this.oauth)
          : await sink.export(session);

        results.push({ kind, ...res });
      } catch (e: any) {
        const msg = e?.message || String(e);
        console.warn(`TimeIt: sink "${kind}" failed:`, msg);
        results.push({ kind, ok: false, message: msg, error: e });
      }
    }

    return results;
  }

  /**
   * Resolve required fields using PromptService and inject them into sink.options.
   * - setup-scoped fields (e.g., API keys, domains, emails) are prompted once and persisted.
   * - runtime-scoped fields (e.g., issueKey, comment) may be prompted every run unless FieldSpec.persist says otherwise.
   */
  private async resolveAndInjectRequirements(
    sink: TimeSink,
    specs: FieldSpec[],
    session: Session
  ): Promise<void> {
    if (!specs?.length) {return;}

    // Ensure we have a mutable options bag we can hydrate
    const opts = ((sink as any).options = (sink as any).options ?? {});

    for (const spec of specs) {
      // For runtime fields, we might have value already on session — let that count as "current"
      const currentFromSession = this.valueFromSession(session, spec.key);
      const current = this.pickExistingValue(opts[spec.key], currentFromSession);

      // If required & missing/empty → prompt via PromptService
      const needsValue = spec.required && this.isEmpty(current);
      const resolved = needsValue
        ? await this.prompts.resolveField(spec, current)
        : (current ?? undefined);

      // If user canceled a required prompt → skip sink gracefully later (leave it missing)
      if (spec.required && this.isEmpty(resolved)) {
        // Do not throw; let validate() handle skip messaging
        continue;
      }

      // Inject into sink.options only if something is resolved or pre-existing value was present
      if (!this.isEmpty(resolved)) {
        opts[spec.key] = resolved;
      } else if (!this.isEmpty(current)) {
        opts[spec.key] = current;
      }
    }
  }

  /**
   * Helper: prefer explicit options value; otherwise session-derived value.
   */
  private pickExistingValue(optionValue: unknown, sessionValue: unknown): unknown {
    return !this.isEmpty(optionValue) ? optionValue : sessionValue;
  }

  /**
   * Returns values from session for common runtime keys (issueKey, comment, branch, etc.)
   */
  private valueFromSession(session: Session, key: string): unknown {
    switch (key) {
      case 'issueKey': return session.issueKey ?? undefined;
      case 'comment':  return session.comment ?? undefined;
      case 'branch':   return session.branch ?? undefined;
      case 'repoPath': return session.repoPath ?? undefined;
      case 'workspace':return session.workspace ?? undefined;
      default:         return undefined;
    }
  }

  /**
   * "Empty" = undefined, null, empty string, or string of whitespace.
   */
  private isEmpty(v: unknown): boolean {
    return v === undefined || v === null || (typeof v === 'string' && v.trim() === '');
  }
}