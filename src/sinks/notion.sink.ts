import { TTL } from '../core/cache/cache';
import { PromptService, SuggestionItem } from '../core/prompts';
import type { TimeSink, FieldSpec, TimeSinkConfig } from '../core/sink';
import { BaseSink } from '../core/sink';
import type { Session, Result } from '../core/types';

/**
 * NotionSink
 * - Setup:
 *    - notion.apiToken: Notion internal integration token (secret)
 *    - notion.destination: Pick a Database or Page (stored as "database:<id>" or "page:<id>")
 * - Export:
 *    - Database: create a page with properties (Title, Duration, Started, Repo, Branch, IssueKey, Workspace)
 *    - Page: append a rich paragraph block summarizing the session
 * - Prompts:
 *    - destination is chosen via the cached, paginated QuickPick (POST /v1/search)
 */
export class NotionSink extends BaseSink implements TimeSink {
  readonly kind = 'notion';

  constructor(
    cfg: TimeSinkConfig,
    private fetchFn: (input: string | URL, init?: RequestInit) => Promise<Response> = (globalThis as any).fetch
  ) { super(cfg); }

  requirements(): FieldSpec[] {
    return [
      {
        key: 'notion.apiToken',
        label: 'Notion API Token',
        type: 'secret',
        scope: 'setup',
        required: true,
        description: 'Create a Notion internal integration and paste the token (starts with "ntn_")',
        secretKey: 'clockit.notion.apiToken',
      },
      {
        key: 'notion.destination',
        label: 'Notion Destination (Database or Page)',
        ui: 'select',
        type: 'string',
        scope: 'setup',
        required: true,
        placeholder: 'Search your Notion workspace…',
        // cache suggestion pages for a while to avoid re-fetch during a session
        cacheTtlMs: TTL.hour,
        select: {
          allowArbitrary: false, // we want a valid pick
          fetchPage: (query, cursor, signal) => searchNotionObjects({
            query,
            cursor,
            token: this.apiToken(),
            fetchFn: this.fetchFn,
            signal,
          }),
        },
        validate: (v) => {
          const s = String(v ?? '');
          if (!/^((database|page):)?[0-9a-fA-F-]{32,36}$/.test(s)) {return 'Pick a Notion database or page';}
          return undefined;
        },
      },
    ];
  }

  validate(): Result { return { ok: true }; }

  private apiToken(): string {
    return String(this.options['notion.apiToken'] || '').trim();
  }

  private authHeaders(): Record<string, string> {
    return {
      'Authorization': `Bearer ${this.apiToken()}`,
      'Notion-Version': '2022-06-28',
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    };
  }

  private parseDestination(): { type: 'database' | 'page'; id: string } | undefined {
    const raw = String(this.options['notion.destination'] || '').trim();
    if (!raw) {return undefined;}

    const withType = raw.match(/^(database|page):(.+)$/i);
    if (withType) {
      const [, t, id] = withType;
      return { type: t.toLowerCase() as 'database' | 'page', id };
    }

    // If user previously stored bare ID, we’ll treat it as a database by default (common case),
    // but export() will preflight and produce a retryable error if wrong.
    // You can change this default if you prefer "page".
    if (/^[0-9a-fA-F-]{32,36}$/.test(raw)) {
      return { type: 'database', id: raw };
    }
    return undefined;
  }

  // ─────────────────────────── Export ───────────────────────────

  async export(s: Session): Promise<Result> {
    // Setup checks
    const token = this.apiToken();
    if (!token) {
      return { ok: false, message: 'Missing Notion API token', code: 'missing_field', field: 'notion.apiToken', retryable: true };
    }

    const dest = this.parseDestination();
    if (!dest) {
      return { ok: false, message: 'Missing Notion destination', code: 'missing_field', field: 'notion.destination', retryable: true };
    }

    // Route based on destination type
    if (dest.type === 'database') {
      return await this.exportToDatabase(dest.id, s);
    } else {
      return await this.appendToPage(dest.id, s);
    }
  }

  // Create a page in a database with structured properties
  private async exportToDatabase(databaseId: string, s: Session): Promise<Result> {
    // Preflight: get DB schema to find the title property name
    const titleProp = await this.getDatabaseTitleProp(databaseId);
    if (titleProp === 'AUTH_ERROR') {
      return { ok: false, message: 'Notion auth failed', code: 'auth_error', field: 'notion.apiToken', retryable: true };
    }
    if (titleProp === 'MISSING') {
      return { ok: false, message: 'Database not found or inaccessible', code: 'invalid_field', field: 'notion.destination', retryable: true };
    }

    const titleName = titleProp || 'Name'; // fallback; Notion enforces at least one title

    const titleText = s.comment?.trim()
      || s.issueKey
      || `${new Date(s.startedIso).toLocaleString()} (${Math.round(s.durationSeconds / 60)}m)`;

    const props: Record<string, any> = {
      [titleName]: { title: [{ type: 'text', text: { content: titleText } }] },
      Duration: { number: s.durationSeconds ?? 0 },
      Started:  { date: { start: s.startedIso } },
      Ended:    s.endedIso ? { date: { start: s.endedIso } } : undefined,
      Workspace:{ rich_text: s.workspace ? [{ type: 'text', text: { content: s.workspace } }] : [] },
      Repo:     { rich_text: s.repoPath ? [{ type: 'text', text: { content: s.repoPath } }] : [] },
      Branch:   { rich_text: s.branch ? [{ type: 'text', text: { content: s.branch } }] : [] },
      IssueKey: { rich_text: s.issueKey ? [{ type: 'text', text: { content: String(s.issueKey) } }] : [] },
    };

    // strip undefined properties (Ended)
    Object.keys(props).forEach(k => props[k] === undefined && delete props[k]);

    const body = {
      parent: { database_id: databaseId },
      properties: props,
      children: s.comment?.trim()
        ? [{
            object: 'block',
            type: 'paragraph',
            paragraph: { rich_text: [{ type: 'text', text: { content: s.comment.trim() } }] },
          }]
        : undefined,
    };

    try {
      const res = await this.fetchFn('https://api.notion.com/v1/pages', {
        method: 'POST',
        headers: this.authHeaders(),
        body: JSON.stringify(body),
      });

      if (res.status === 401 || res.status === 403) {
        return { ok: false, message: `Notion auth failed (${res.status})`, code: 'auth_error', field: 'notion.apiToken', retryable: true, error: new Error(await safeText(res)) };
      }
      if (res.status === 404) {
        return { ok: false, message: 'Database not found', code: 'invalid_field', field: 'notion.destination', retryable: true, error: new Error(await safeText(res)) };
      }
      if (!res.ok) {
        return { ok: false, message: `Notion ${res.status}`, error: new Error(await safeText(res)) };
      }

      return { ok: true, message: 'Notion → page created' };
    } catch (e: any) {
      return { ok: false, message: 'Network error calling Notion', code: 'network_error', error: e };
    }
  }

  // Append a summary of the work as blocks under an existing page
  private async appendToPage(pageId: string, s: Session): Promise<Result> {
    // Preflight: ensure page exists / visible
    try {
      const pre = await this.fetchFn(`https://api.notion.com/v1/pages/${encodeURIComponent(pageId)}`, {
        method: 'GET',
        headers: this.authHeaders(),
      });
      if (pre.status === 401 || pre.status === 403) {
        return { ok: false, message: `Notion auth failed (${pre.status})`, code: 'auth_error', field: 'notion.apiToken', retryable: true, error: new Error(await safeText(pre)) };
      }
      if (pre.status === 404) {
        return { ok: false, message: 'Page not found', code: 'invalid_field', field: 'notion.destination', retryable: true, error: new Error(await safeText(pre)) };
      }
      if (!pre.ok) {
        return { ok: false, message: `Notion ${pre.status} (preflight)`, error: new Error(await safeText(pre)) };
      }
    } catch (e: any) {
      return { ok: false, message: 'Network error calling Notion (preflight)', code: 'network_error', error: e };
    }

    const parts = [
      s.issueKey ? `[${s.issueKey}] ` : '',
      s.comment?.trim() || 'Logged by TimeIt',
      ` • ${Math.round((s.durationSeconds ?? 0) / 60)}m`,
      s.branch ? ` • ${s.branch}` : '',
    ].filter(Boolean).join('');

    const children = [
      {
        object: 'block',
        type: 'paragraph',
        paragraph: {
          rich_text: [{ type: 'text', text: { content: parts } }],
        },
      },
    ];

    try {
      const res = await this.fetchFn(`https://api.notion.com/v1/blocks/${encodeURIComponent(pageId)}/children`, {
        method: 'PATCH',
        headers: this.authHeaders(),
        body: JSON.stringify({ children }),
      });

      if (res.status === 401 || res.status === 403) {
        return { ok: false, message: `Notion auth failed (${res.status})`, code: 'auth_error', field: 'notion.apiToken', retryable: true, error: new Error(await safeText(res)) };
      }
      if (res.status === 404) {
        return { ok: false, message: 'Page not found', code: 'invalid_field', field: 'notion.destination', retryable: true, error: new Error(await safeText(res)) };
      }
      if (!res.ok) {
        return { ok: false, message: `Notion ${res.status}`, error: new Error(await safeText(res)) };
      }

      return { ok: true, message: 'Notion → appended to page' };
    } catch (e: any) {
      return { ok: false, message: 'Network error calling Notion', code: 'network_error', error: e };
    }
  }

  // Fetch database schema and return its title property name
  private async getDatabaseTitleProp(databaseId: string): Promise<string | 'AUTH_ERROR' | 'MISSING'> {
    try {
      const res = await this.fetchFn(`https://api.notion.com/v1/databases/${encodeURIComponent(databaseId)}`, {
        method: 'GET',
        headers: this.authHeaders(),
      });
      if (res.status === 401 || res.status === 403) {return 'AUTH_ERROR';}
      if (res.status === 404) {return 'MISSING';}
      if (!res.ok) {return 'MISSING';}

      const data = await res.json() as {
        properties?: Record<string, { type: string }>;
      };
      const props = data.properties || {};
      const titleEntry = Object.entries(props).find(([, v]) => v?.type === 'title');
      return titleEntry?.[0] || 'Name';
    } catch {
      return 'MISSING';
    }
  }
}

// ─────────────────────────── Helpers ───────────────────────────

async function safeText(res: Response): Promise<string> {
  try { return await res.text(); } catch { return ''; }
}

// Build QuickPick items from Notion search results, with pagination
async function searchNotionObjects({
  query, cursor, token, fetchFn, signal,
}: {
  query: string;
  cursor?: string;
  token: string;
  fetchFn: (input: string | URL, init?: RequestInit) => Promise<Response>;
  signal?: AbortSignal;
}): Promise<{ items: SuggestionItem[]; nextCursor?: string }> {
  const body: any = {
    query: (query || '').trim() || undefined,
    page_size: 25,
    start_cursor: cursor,
    // We search both pages and databases to let the user pick either.
    // (If you want to limit, add: filter: { property: "object", value: "database"|"page" })
  };

  const res = await fetchFn('https://api.notion.com/v1/search', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Notion-Version': '2022-06-28',
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify(body),
    signal,
  });

  if (!res.ok) {
    return { items: [], nextCursor: undefined };
  }
  const data = await res.json() as {
    results?: Array<any>;
    has_more?: boolean;
    next_cursor?: string | null;
  };

  const items: SuggestionItem[] = (data.results || []).map((r: any) => {
    const obj = r.object; // 'page' | 'database'
    const id = r.id;
    let title = '';
    if (obj === 'database') {
      title = extractDatabaseTitle(r) || 'Untitled Database';
    } else if (obj === 'page') {
      title = extractPageTitle(r) || 'Untitled';
    }
    return {
      id: `${obj}:${id}`,
      title,
      description: obj === 'database' ? 'Database' : 'Page',
      raw: r,
    };
  });

  return { items, nextCursor: data.next_cursor ?? undefined };
}

function extractDatabaseTitle(db: any): string | undefined {
  // database.title is an array of rich_text
  const rt = db?.title || [];
  const first = rt[0]?.plain_text || rt[0]?.text?.content;
  return first || undefined;
}

function extractPageTitle(page: any): string | undefined {
  // page.properties contains one (or more) title properties; find one and read its title array
  const props = page?.properties || {};
  const entry = Object.entries(props).find(([, v]: any) => v?.type === 'title');
  const title = ((entry?.[1] as any)?.title || [])[0]?.plain_text || ((entry?.[1] as any)?.title || [])[0]?.text?.content;
  return title || undefined;
}