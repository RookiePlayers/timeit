// src/sinks/jira.sink.ts
import type { TimeSink, FieldSpec, TimeSinkConfig } from '../core/sink';
import { BaseSink } from '../core/sink';
import type { Session, Result } from '../core/types';

type JiraOptions = {
  'jira.domain'?: string;
  'jira.email'?: string;
  'jira.apiToken'?: string;
  'issueKey'?: string;
};

function extractIssueKeyFrom(text?: string | null): string | null {
  if (!text) {return null;}
  const m = String(text).match(/[A-Z][A-Z0-9]+-\d+/i);
  return m ? m[0].toUpperCase() : null;
}

export class JiraSink extends BaseSink implements TimeSink {
  readonly kind = 'jira';

  constructor(
    cfg: TimeSinkConfig,
    private fetchFn: (input: string | URL, init?: RequestInit) => Promise<Response> = (globalThis as any).fetch
  ) {
    super(cfg);
  }

  requirements(): FieldSpec[] {
    return [
      {
        key: 'jira.domain',
        label: 'Jira Domain',
        type: 'string',
        scope: 'setup',
        required: true,
        placeholder: 'your-team.atlassian.net',
        description: 'Your Jira Cloud hostname (no protocol).',
        validate: v => /atlassian\.net$/i.test(String(v ?? '').trim()) ? undefined : 'Must end with atlassian.net',
        settingKey: 'timeit.jira.domain',
      },
      {
        key: 'jira.email',
        label: 'Jira Email',
        type: 'string',
        scope: 'setup',
        required: true,
        validate: v => /.+@.+/.test(String(v ?? '').trim()) ? undefined : 'Invalid email',
        settingKey: 'timeit.jira.email',
      },
      {
        key: 'jira.apiToken',
        label: 'Jira API Token',
        type: 'secret',
        scope: 'setup',
        required: true,
        description: 'Create at https://id.atlassian.com/manage/api-tokens',
        secretKey: 'timeit.jira.apiToken',
      },
      // Make this required at runtime so orchestrator will prompt when Jira is selected.
      {
        key: 'issueKey',
        label: 'Jira Issue Key',
        type: 'string',
        scope: 'runtime',
        required: true,
        placeholder: 'TP-123',
        validate: v =>
          /^[A-Z][A-Z0-9]+-\d+$/i.test(String(v ?? '').trim()) ? undefined : 'Format like PROJ-123',
      },
    ];
  }

  // Let the orchestrator handle prompting; don't block construction here.
  validate(): Result { return { ok: true }; }

  private baseUrl(): string {
    const raw = (this.options['jira.domain'] || '').toString().trim();
    const host = raw.replace(/^https?:\/\//i, '').replace(/\/+$/, '');
    return `https://${host}`;
  }

  private authHeader(): string {
    const email = (this.options['jira.email'] || '').toString();
    const token = (this.options['jira.apiToken'] || '').toString();
    const enc = typeof Buffer !== 'undefined'
      ? Buffer.from(`${email}:${token}`).toString('base64')
      : (globalThis as any).btoa?.(`${email}:${token}`);
    return `Basic ${enc}`;
  }

  private toJiraTimestamp(iso: string): string {
    // Jira's /rest/api/3 expects local-time + offset or Z; we’ll use UTC +0000
    const d = new Date(iso);
    const pad = (n: number, w = 2) => String(n).padStart(w, '0');
    const yyyy = d.getUTCFullYear();
    const MM = pad(d.getUTCMonth() + 1);
    const dd = pad(d.getUTCDate());
    const hh = pad(d.getUTCHours());
    const mm = pad(d.getUTCMinutes());
    const ss = pad(d.getUTCSeconds());
    const ms = String(d.getUTCMilliseconds()).padStart(3, '0');
    return `${yyyy}-${MM}-${dd}T${hh}:${mm}:${ss}.${ms}+0000`;
  }

  async export(s: Session): Promise<Result> {
    // Prefer an injected runtime value from orchestrator; else branch/comment hints
    const fromSession = s.issueKey || extractIssueKeyFrom(s.comment);
    const injected = (this.options['issueKey'] || '').toString().trim();
    const issue = (injected || fromSession || '').trim();

    if (!issue) {
      // With required:true, orchestrator should have prompted already,
      // but keep a guard for safety.
      return { ok: true, message: 'Skipped (no issueKey)' };
    }

    // Build worklog payload
    const body = {
      timeSpentSeconds: s.durationSeconds,
      started: this.toJiraTimestamp(s.startedIso),
      comment: {
        version: 1,
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: s.comment?.trim() || 'Logged by TimeIt' }]}],
      },
    };

    const url = `${this.baseUrl()}/rest/api/3/issue/${encodeURIComponent(issue)}/worklog`;

    try {
      const res = await this.fetchFn(url, {
        method: 'POST',
        headers: {
          Authorization: this.authHeader(),
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const text = await safeText(res);
        return { ok: false, message: `Jira ${res.status}`, error: new Error(text || 'Jira worklog failed') };
      }
      return { ok: true, message: `Jira → ${issue}` };
    } catch (e: any) {
      return { ok: false, message: 'Network error calling Jira', error: e };
    }
  }
}

async function safeText(res: Response): Promise<string> {
  try { return await res.text(); } catch { return ''; }
}