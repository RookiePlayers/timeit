import { ExportOrchestrator } from '../src/core/orchestrator';
import type { TimeSink, FieldSpec } from '../src/core/sink';

//
// ────────────────────────────────────────────────────────────────────────────────
//   Fake Prompt Service (simulates secret/settings persistence and user input)
// ────────────────────────────────────────────────────────────────────────────────
//
class FakePromptService {
  // Simulate a tiny KV for secrets/settings
  store: Record<string, unknown> = {};
  constructor(private scripted: Record<string, unknown> = {}) {}

  private has(key: string) {
    return Object.prototype.hasOwnProperty.call(this.store, key);
  }

  private exists(x: unknown): boolean {
    return x !== null && x !== undefined && (typeof x !== 'string' || x.trim() !== '');
  }

  async resolveField(spec: FieldSpec): Promise<unknown> {
    // 1) Try existing persisted value first
    if (spec.type === 'secret') {
      const k = spec.secretKey || `clockit.${spec.key}`;
      if (this.has(k) && this.exists(this.store[k])) return this.store[k];
    } else if (spec.settingKey) {
      const k = spec.settingKey;
      if (this.has(k) && this.exists(this.store[k])) return this.store[k];
    }

    // 2) Otherwise, simulate a prompt with scripted inputs
    const v = this.scripted[spec.key];
    if (!this.exists(v)) {
      // Simulate user cancel or missing input
      return undefined;
    }

    // 3) "Persist" where spec says to store
    if (spec.type === 'secret') {
      const k = spec.secretKey || `clockit.${spec.key}`;
      this.store[k] = v;
    } else if (spec.settingKey) {
      this.store[spec.settingKey] = v;
    }

    return v;
  }
}

//
// ────────────────────────────────────────────────────────────────────────────────
//   Helpers for creating fake sinks
// ────────────────────────────────────────────────────────────────────────────────
//
function makeSink(kind = 'demo', reqs: FieldSpec[] = []): TimeSink {
  const options: any = {};
  return {
    kind,
    // expose a mutable options bag so orchestrator can inject values
    // @ts-ignore
    options,
    requirements: () => reqs,
    validate: () => {
      const missing: string[] = [];
      reqs.filter(r => r.required).forEach(r => {
        const val = options[r.key];
        if (val === null || val === undefined || (typeof val === 'string' && !val.trim())) {
          missing.push(r.key);
        }
      });
      return { ok: missing.length === 0, missing };
    },
    async export(session: any) {
      return { ok: true, message: `exported with ${JSON.stringify(options)}` };
    },
  };
}

//
// ────────────────────────────────────────────────────────────────────────────────
//   TESTS
// ────────────────────────────────────────────────────────────────────────────────
//
describe('ExportOrchestrator', () => {
  test('prompts for missing required fields, persists, injects, then exports', async () => {
    const reqs: FieldSpec[] = [
      {
        key: 'svc.domain',
        label: 'Domain',
        type: 'string',
        scope: 'setup',
        required: true,
        settingKey: 'clockit.svc.domain',
      },
      {
        key: 'svc.token',
        label: 'Token',
        type: 'secret',
        scope: 'setup',
        required: true,
        secretKey: 'clockit.svc.token',
      },
      {
        key: 'issueKey',
        label: 'Issue',
        type: 'string',
        scope: 'runtime',
        required: false,
      },
    ];
    const sink = makeSink('svc', reqs);
    const prompts = new FakePromptService({
      'svc.domain': 'team.example.com',
      'svc.token': 'SECRET123',
      // no issueKey scripted → optional
    });

    const orch = new ExportOrchestrator([sink], prompts as any);
    const results = await orch.hydrateAndExport({
      comment: 'Hello',
      startedIso: '',
      endedIso: '',
      durationSeconds: 0
    });

    expect(results[0].ok).toBe(true);

    // persisted
    expect(prompts.store['clockit.svc.domain']).toBe('team.example.com');
    expect(prompts.store['clockit.svc.token']).toBe('SECRET123');

    // injected into sink.options
    // @ts-ignore
    expect(sink.options['svc.domain']).toBe('team.example.com');
    // @ts-ignore
    expect(sink.options['svc.token']).toBe('SECRET123');
  });

  test('skips sink gracefully if user cancels a required prompt', async () => {
    const reqs: FieldSpec[] = [
      {
        key: 'need.this',
        label: 'Need',
        type: 'string',
        scope: 'setup',
        required: true,
        settingKey: 'clockit.need.this',
      },
    ];
    const sink = makeSink('needs', reqs);
    const prompts = new FakePromptService({
      // no 'need.this' provided → simulate cancel (undefined)
    });

    const orch = new ExportOrchestrator([sink], prompts as any);
    const results = await orch.hydrateAndExport({
      startedIso: '',
      endedIso: '',
      durationSeconds: 0
    });

    // Graceful "skip" result recorded by orchestrator
    expect(results.find(r => (r as any).kind === 'needs')?.ok).toBe(true);
    expect(String(results.find(r => (r as any).kind === 'needs')?.message)).toMatch(/Skipped/i);
  });

  test('exports other sinks even if one is invalid', async () => {
    const badReqs: FieldSpec[] = [
      {
        key: 'must.have',
        label: 'Must',
        type: 'string',
        scope: 'setup',
        required: true,
        settingKey: 'clockit.must.have',
      },
    ];
    const badSink = makeSink('bad', badReqs);
    const goodSink = makeSink('good', []);
    const prompts = new FakePromptService({
      /* no input -> bad stays invalid */
    });

    const orch = new ExportOrchestrator([badSink, goodSink], prompts as any);
    const results = await orch.hydrateAndExport({
      startedIso: '',
      endedIso: '',
      durationSeconds: 0
    });

    const good = results.find(r => (r as any).kind === 'good');
    expect(good?.ok).toBe(true);

    const bad = results.find(r => (r as any).kind === 'bad');
    expect(String(bad?.message)).toMatch(/Skipped/i);
  });
});