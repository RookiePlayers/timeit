// src/sinks/jira.sink.ts
import { TTL } from '../core/cache/cache';
import { PromptService, SuggestionItem } from '../core/prompts';
import type { TimeSink, FieldSpec, TimeSinkConfig } from '../core/sink';
import { BaseSink } from '../core/sink';
import type { Session, Result } from '../core/types';

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
  ) { super(cfg); }

  /**
   * Field specifications for prompting/persistence.
   * Note: we use `remember: false` (runtime) and explicit `settingKey/secretKey` (setup)
   */
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
        settingKey: 'timeit_logger.jira.domain',
      },
      {
        key: 'jira.email',
        label: 'Jira Email',
        type: 'string',
        scope: 'setup',
        required: true,
        validate: v => /.+@.+/.test(String(v ?? '').trim()) ? undefined : 'Invalid email',
        settingKey: 'timeit_logger.jira.email',
      },
      {
        key: 'jira.apiToken',
        label: 'Jira API Token',
        type: 'secret',
        scope: 'setup',
        required: true,
        description: 'Create at https://id.atlassian.com/manage/api-tokens',
        secretKey: 'timeit_logger.jira.apiToken',
      },
      // Required at runtime so the orchestrator will prompt when Jira is selected.
      {
        key: 'issueKey',
        label: 'Jira Issue Key',
        ui: 'select',
        type: 'string',
        scope: 'runtime',
        remember: false,
        required: true,
        placeholder: 'Search issues by key or summary. e.g. TP-123',
        cacheTtlMs: TTL.fiveMinutes, // 1 minute
        // do not persist the runtime issue key
        persist: 'memory',
        select: {
          allowArbitrary: true,
          fetchPage: (query, cursor, signal) => searchForIssue({
            query,
            cursor,
            options: this.options,
            fetchFn: this.fetchFn,
            authHeader: () => this.authHeader(),
            signal,
          })
        },
        validate: v =>
          /^[A-Z][A-Z0-9]+-\d+$/i.test(String(v ?? '').trim()) ? undefined : 'Format like PROJ-123',
      },
    ];
  }

  /**
   * Construction-time validation is no-op; hydration happens in the orchestrator.
   */
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

  private firstMissing(): { field?: string; message?: string } {
    const domain = (this.options['jira.domain'] || '').toString().trim();
    const email  = (this.options['jira.email']  || '').toString().trim();
    const token  = (this.options['jira.apiToken'] || '').toString().trim();

    if (!domain) {return { field: 'jira.domain', message: 'Missing Jira domain' };}
    if (!email)  {return { field: 'jira.email',  message: 'Missing Jira email' };}
    if (!token)  {return { field: 'jira.apiToken', message: 'Missing Jira API token' };}
    return {};
  }

  async suggestIssueKey(ps: PromptService): Promise<string | undefined> {
    const picked = await ps.pickSuggestion<{ key: string; summary: string }>({
      cacheKey: 'jira.issues',
      title: 'Pick a Jira Issue',
      placeholder: 'Search issues…',
      loader: async (query: string, cursor?: string) => {
        const url = new URL(`${this.baseUrl()}/rest/api/3/search`);
        const jql = query ? `text ~ "${query.replace(/"/g, '\\"')}" order by updated DESC` : 'order by updated DESC';
        url.searchParams.set('jql', jql);
        url.searchParams.set('maxResults', '25');
        if (cursor) {url.searchParams.set('startAt', cursor);}

        const res = await this.fetchFn(url.toString(), {
          headers: { 'Authorization': this.authHeader(), 'Accept': 'application/json' },
        });
        if (!res.ok) {return { items: [], nextCursor: undefined };}
        const data = await res.json() as {
          startAt: number; maxResults: number; total: number;
          issues: Array<{ id: string; key: string; fields: { summary: string } }>;
        };
        const issues = (data.issues || []) as Array<{ id: string; key: string; fields: { summary: string } }>;
        const next = (data.startAt + data.maxResults) < data.total ? String(data.startAt + data.maxResults) : undefined;
        const items: SuggestionItem[] = issues.map(x => ({ id: x.key, title: x.key, description: x.fields?.summary, raw: { key: x.key, summary: x.fields?.summary } }));
        return { items, nextCursor: next };
      },
    });

    return picked?.id;
  }

  async export(s: Session): Promise<Result> {
    // Ensure required setup fields are present; if not, ask orchestrator to re-prompt
    const missing = this.firstMissing();
    if (missing.field) {
      return {
        ok: false,
        message: missing.message,
        code: 'missing_field',
        field: missing.field,
        retryable: true,
      };
    }

    // Prefer an injected runtime value from orchestrator; else branch/comment hints
    const fromSession = s.issueKey || extractIssueKeyFrom(s.comment);
    const injected = (this.options['issueKey'] || '').toString().trim();
    const issue = (fromSession || injected || '').trim();

    if (!issue) {
      return { ok: true, message: 'Skipped (no issueKey)' };
    }

    // Preflight to catch invalid/hidden issues and trigger re-prompt for issueKey
    const preUrl = `${this.baseUrl()}/rest/api/3/issue/${encodeURIComponent(issue)}?fields=id,key`;
    try {
      const pre = await this.fetchFn(preUrl, {
        method: 'GET',
        headers: { Authorization: this.authHeader(), Accept: 'application/json' },
      });

      if (pre.status === 404) {
        const t = await safeText(pre);
        return {
          ok: false,
          message: `Issue not found or not visible: ${issue}`,
          code: 'invalid_field',
          field: 'issueKey',
          retryable: true,
          error: new Error(t),
          hint: 'Try another key (e.g. TP-123)',
        };
      }

      if (pre.status === 401 || pre.status === 403) {
        const t = await safeText(pre);
        return {
          ok: false,
          message: `Jira auth failed (${pre.status})`,
          code: 'auth_error',
          field: 'jira.apiToken',
          retryable: true,
          error: new Error(t),
          hint: 'Paste a fresh API token',
        };
      }

      if (!pre.ok) {
        const t = await safeText(pre);
        return { ok: false, message: `Jira ${pre.status} (preflight)`, error: new Error(t) };
      }
    } catch (e: any) {
      return { ok: false, message: 'Network error calling Jira (preflight)', code: 'network_error', error: e };
    }

    // Build worklog payload
    const body = {
      timeSpentSeconds: s.durationSeconds,
      started: this.toJiraTimestamp(s.startedIso),
      comment: {
        version: 1,
        type: 'doc',
        content: [
          { type: 'paragraph', content: [{ type: 'text', text: s.comment?.trim() || 'Logged by TimeIt' }] },
        ],
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

      if (res.status === 401 || res.status === 403) {
        const t = await safeText(res);
        return {
          ok: false,
          message: `Jira auth failed (${res.status})`,
          code: 'auth_error',
          field: 'jira.apiToken',
          retryable: true,
          error: new Error(t),
          hint: 'Paste a fresh API token',
        };
      }

      if (res.status === 404) {
        const t = await safeText(res);
        return {
          ok: false,
          message: `Issue not found: ${issue}`,
          code: 'invalid_field',
          field: 'issueKey',
          retryable: true,
          error: new Error(t),
          hint: 'Try another key (e.g. TP-123)',
        };
      }

      if (!res.ok) {
        const t = await safeText(res);
        return { ok: false, message: `Jira ${res.status}`, error: new Error(t || 'Jira worklog failed') };
      }

      return { ok: true, message: `Jira → ${issue}` };
    } catch (e: any) {
      return { ok: false, message: 'Network error calling Jira', code: 'network_error', error: e };
    }
  }
}

async function safeText(res: Response): Promise<string> {
  try { return await res.text(); } catch { return ''; }
}
type FetchLike = (input: string | URL, init?: RequestInit) => Promise<Response>;

// utils/jql.ts
export function buildJqlFromQuery(q: string): string {
  // strip common prefixes like "issueKey:" etc.
  let s = (q || '').trim().replace(/^(issue(key|type|id|number)?\s*:)\s*/i, '');
  if (!s) {return 'ORDER BY updated DESC';}

  const up = s.toUpperCase();

  // Exact key: ABC-123
  const mExact = up.match(/^([A-Z][A-Z0-9]+)-(\d+)$/);
  if (mExact) {
    return `issueKey = ${mExact[1]}-${mExact[2]} ORDER BY updated DESC`;
  }

  // Key prefix (project + digits being typed): ABC-12 → range
  const mPrefixNum = up.match(/^([A-Z][A-Z0-9]+)-(\d*)$/);
  if (mPrefixNum) {
    const proj = mPrefixNum[1];
    const digits = mPrefixNum[2];
    // If only "ABC-" (no digits yet), show recent from that project
    if (digits === '') {return `project = ${proj} ORDER BY updated DESC`;}
    const n = Number(digits);
    const next = (n + 1).toString();
    return `issueKey >= ${proj}-${n} AND issueKey < ${proj}-${next} ORDER BY issueKey ASC`;
  }

  // Project token only
  const mProjOnly = up.match(/^([A-Z][A-Z0-9]+)$/);
  if (mProjOnly) {return `project = ${mProjOnly[1]} ORDER BY updated DESC`;}

  // Fallback: fuzzy
  return `text ~ "${up.replace(/"/g, '\\"')}" ORDER BY updated DESC`;
}

const searchForIssue = async ({
  query, cursor, options, fetchFn, authHeader, signal,
}: {
  query: string;
  cursor?: string;
  options: Record<string, unknown>;
  fetchFn: (input: string | URL, init?: RequestInit) => Promise<Response>;
  authHeader: () => string;
  signal?: AbortSignal;
}): Promise<{ items: SuggestionItem[]; nextCursor?: string }> => {
  const raw = (options['jira.domain'] || '').toString().trim();
  const host = raw.replace(/^https?:\/\//i, '').replace(/\/+$/, '');
  const url = `https://${host}/rest/api/3/search/jql`;

  const jql = buildJqlFromQuery(query);
  const body: any = {
    jql,
    fields: ['key', 'summary', 'issuetype', 'project'],
  };
  if (cursor) {body.cursor = cursor;}  // <— new pagination model

  const res = await fetchFn(url, {
    method: 'POST',
    headers: {
      Authorization: authHeader(),
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    signal,                           // <— allow aborts
  });

  if (!res.ok) {return { items: [], nextCursor: undefined };}

  const data = await res.json() as {
    issues?: Array<{ key: string; fields: { summary?: string } }>;
    nextPage?: string;                // Atlassian returns a cursor token
    isLast?: boolean;
  };

  const items: SuggestionItem[] = (data.issues || []).map(iss => ({
    id: iss.key,
    title: iss.key,
    description: iss.fields?.summary ?? '(no summary)',
    raw: iss,
  }));

  return { items, nextCursor: data.nextPage };
};