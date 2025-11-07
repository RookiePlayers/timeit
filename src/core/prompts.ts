// src/core/prompts.ts
import * as vscode from 'vscode';
import { FieldSpec } from './sink';
import { Cache, TTL } from './cache/cache';
import { CachedFetcher } from './cache/cache.fetcher';

type SelectPage = {
  items: Array<{ label: string; description?: string; value: string }>;
  nextCursor?: string | undefined;
};
type CachedPage = SelectPage & { ts: number };
// src/core/prompts.ts

export type SuggestionItem<T = any> = {
  id: string;
  title: string;
  description?: string;
  raw: T;
};

export type SuggestionSource = {
  items: SuggestionItem[];
  nextCursor?: string;
}

export class PromptService {
  private suggestFetcher?: CachedFetcher<SuggestionItem>;

  constructor(
    private secrets: { get(k: string): Promise<string | undefined>; set(k: string, v: string): Promise<void>; delete?(k: string): Promise<void> },
    private cache?: Cache // ⟵ optional cache (memory/global/redis via adapter)
  ) {
    if (cache) {
      // single shared namespace for suggestions; sinks can further namespace via keys
      this.suggestFetcher = new CachedFetcher(cache, 'suggest', TTL.day);
    }
  }

  // ───────────────────────────── Value Resolution ─────────────────────────────
  async resolveField(spec: FieldSpec, current?: unknown): Promise<unknown> {
    if (exists(current)) {return current;}

    const existing = await this.readExisting(spec);
    if (exists(existing)) {return existing;}

    if (!spec.required) {return undefined;}

    const value = await this.promptWithValidation(spec);
    if (!exists(value)) {return undefined;} // canceled

    if (spec.remember === false) {return value;} // runtime-only

    await this.persist(spec, value);
    return value;
  }

  private async readExisting(spec: FieldSpec): Promise<unknown> {
    if (spec.type === 'secret') {
      const key = spec.secretKey || `clockit.${spec.key}`;
      const v = await this.secrets.get(key);
      if (exists(v)) {return v;}
    }
    if (spec.settingKey) {
      const v = vscode.workspace.getConfiguration().get(spec.settingKey);
      if (exists(v)) {return v;}
    }
    if (spec.implicitSetting) {
      const v = vscode.workspace.getConfiguration().get(spec.key);
      if (exists(v)) {return v;}
    }
    return undefined;
  }

  private async persist(spec: FieldSpec, value: unknown) {
    if (spec.remember === false) {return;}

    if (spec.type === 'secret') {
      const key = spec.secretKey || `clockit.${spec.key}`;
      await this.secrets.set(key, String(value ?? ''));
      return;
    }
    if (spec.settingKey) {
      await vscode.workspace.getConfiguration().update(spec.settingKey, value, vscode.ConfigurationTarget.Workspace);
      return;
    }
    if (spec.implicitSetting) {
      await vscode.workspace.getConfiguration().update(spec.key, value, vscode.ConfigurationTarget.Workspace);
      return;
    }
    // else: memory only
  }

  private async promptWithValidation(spec: FieldSpec): Promise<unknown> {
    let attempts = 0;
    while (attempts < 3) {
      const input = await this.promptOnce(spec);
      if (!exists(input)) {return undefined;}

      const err = spec.validate?.(input);
      if (!err) {return input;}

      attempts++;
      await vscode.window.showErrorMessage(`${spec.label}: ${err}`);
    }
    return undefined;
  }

  private async promptOnce(spec: FieldSpec): Promise<unknown> {
    const base = {
      title: spec.label,
      prompt: spec.description || spec.label,
      placeHolder: spec.placeholder,
      ignoreFocusOut: true,
      value: spec.defaultValue as string | undefined,
    } as const;
  // NEW: handle select UI
  if (spec.ui === 'select' && spec.select?.fetchPage) {
    const picked = await this.pickSuggestion({
      cacheKey: spec.key,                 // namespaced cache per-field
      title: spec.label,
      placeholder: spec.placeholder ?? 'Search…',
      loader: (q, c) => {
        if (spec.select && typeof spec.select.fetchPage === 'function') {
          return spec.select.fetchPage(q, c).then(({ items, nextCursor }) => ({
            items: items.map(it => ({
              id: it.id,
              title: it.title,
              description: it.description,
              raw: it,
            })),
            nextCursor,
          }));
        }
        return Promise.resolve({ items: [], nextCursor: undefined });
      },
    });

    if (picked?.id) {
      return picked.id;
    }

    // If user didn’t pick but arbitrary input is allowed,
    // return the raw text they typed in the QuickPick.
    if (spec.select.allowArbitrary) {
      // QuickPick holds last typed value; expose via helper:
      const manual = await this.promptFreeTextInQuickPick(spec);
      return manual?.trim() || undefined;
    }

    return undefined; // cancel
  }
    switch (spec.type) {
      case 'secret':
        return vscode.window.showInputBox({ ...base, password: true });
      case 'string':
        return vscode.window.showInputBox(base);
      case 'number':
        {
          const raw = await vscode.window.showInputBox({
            ...base,
            validateInput: (s) => (s.trim() === '' || isNaN(Number(s)) ? 'Enter a number' : undefined),
          });
          return exists(raw) ? Number(raw) : undefined;
        }
      case 'boolean':
        {
          const pick = await vscode.window.showQuickPick(['Yes', 'No'], {
            title: spec.label,
            placeHolder: spec.placeholder,
            ignoreFocusOut: true,
          });
          return pick ? pick === 'Yes' : undefined;
        }
      default:
        return vscode.window.showInputBox(base);
    }
  }
/** Helper: lightweight “type anything” fallback using QuickPick’s input line */
private async promptFreeTextInQuickPick(spec: FieldSpec): Promise<string | undefined> {
  const qp = vscode.window.createQuickPick<vscode.QuickPickItem>();
  qp.title = spec.label;
  qp.placeholder = spec.placeholder ?? 'Type a value…';
  qp.ignoreFocusOut = true;
  qp.items = []; // No static items

  return new Promise<string | undefined>((resolve) => {
    let last = '';
    const onChange = qp.onDidChangeValue(v => { last = v; });
    const onAccept = qp.onDidAccept(() => { resolve(last); qp.hide(); });
    const onHide = qp.onDidHide(() => { resolve(undefined); cleanup(); });

    const cleanup = () => {
      onChange.dispose(); onAccept.dispose(); onHide.dispose(); qp.dispose();
    };

    qp.show();
  });
}
  // ───────────────────────────── Suggestions API ─────────────────────────────
  /**
   * Show a paginated, searchable QuickPick backed by cache + remote fetcher.
   * Each sink supplies its loader + namespace key.
   */
  async pickSuggestion<T>(args: {
    cacheKey: string; // e.g., 'jira.issues' | 'notion.pages'
    title: string;
    placeholder?: string;
    initialQuery?: string;
    // loader returns raw items + optional next cursor based on query + cursor
    loader: (query: string, cursor?: string, signal?: AbortSignal) => Promise<{ items: SuggestionItem<T>[]; nextCursor?: string; }>;
    refresh?: boolean; // bypass cache on first load
  }): Promise<SuggestionItem<T> | undefined> {
    const qp = vscode.window.createQuickPick<vscode.QuickPickItem & { _raw?: SuggestionItem<T>; _cursor?: string }>();
    qp.title = args.title;
    qp.placeholder = args.placeholder ?? 'Search…';
    qp.ignoreFocusOut = true;
    qp.matchOnDescription = true;
    qp.matchOnDetail = true;

    let currentQuery = args.initialQuery ?? '';
    let nextCursor: string | undefined = undefined;

    const toQpItems = (list: SuggestionItem<T>[], includeMore: boolean) => {
      const items = list.map((it) => ({
        label: it.title,
        description: it.description,
        _raw: it,
      } as vscode.QuickPickItem & { _raw: SuggestionItem<T> }));
      if (includeMore) {
        items.push({ label: '$(sync) Load more…', alwaysShow: true, _cursor: nextCursor } as any);
      }
      return items;
    };

    const fetcher = this.suggestFetcher;
let gen = 0;          
let inFlight: AbortController | undefined;       
 const loadPage = async (q: string, cursor?: string, refresh = false) => {
  const myGen = ++gen;
  // abort any in-flight request
  if (inFlight) {inFlight.abort();}
  inFlight = typeof AbortController !== 'undefined' ? new AbortController() : undefined;

  const fetcher = this.suggestFetcher;
  const run = () => args.loader(q, cursor, inFlight?.signal);

  const page = fetcher
    ? await fetcher.search(args.cacheKey + ':' + q, ({ query, cursor }) => args.loader(query, cursor, inFlight?.signal), { cursor, refresh })
    : await run();

  // Ignore stale responses
  if (myGen !== gen) {return null;}
  return page;
};

const loadFirst = async () => {
  qp.busy = true;
  try {
    const page = await loadPage(currentQuery, undefined, !!args.refresh);
    if (!page) {return;} // stale
    nextCursor = page.nextCursor;
    qp.items = toQpItems(page.items, !!nextCursor);
  } finally {
    qp.busy = false;
  }
};

const loadMore = async () => {
  if (!nextCursor) {return;}
  qp.busy = true;
  try {
    const page = await loadPage(currentQuery, nextCursor);
    if (!page) {return;} // stale
    nextCursor = page.nextCursor;
    qp.items = [...qp.items.filter((i: any) => !i._cursor), ...toQpItems(page.items, !!nextCursor)];
  } finally {
    qp.busy = false;
  }
};

// when the query changes, switch to key-ish routing immediately and clear old items
const debounced = debounce(async (val: string) => {
  currentQuery = val;
  nextCursor = undefined;
  qp.items = [];         // <— clear immediately so you don’t see old fuzzy results
  await loadFirst();
}, 250);

    qp.onDidChangeValue(debounced);
    qp.onDidAccept(() => qp.hide());
    qp.onDidTriggerItemButton(() => {/* noop for now */});
    qp.onDidChangeSelection(async (sel) => {
      const first: any = sel[0];
      if (first && first._cursor) {
        await loadMore();
      }
    });

    await loadFirst();
    const picked = await new Promise<SuggestionItem<T> | undefined>((resolve) => {
      qp.onDidHide(() => {
        const sel: any = qp.selectedItems?.[0];
        resolve(sel?._raw);
        qp.dispose();
      });
      qp.show();
    });

    return picked;
  }
}

function exists<T>(v: T | null | undefined): v is T {
  return v !== null && v !== undefined && (typeof v !== 'string' || v.trim() !== '');
}

function debounce<T extends (...args: any[]) => any>(fn: T, ms = 300) {
  let t: NodeJS.Timeout | undefined;
  return (...args: Parameters<T>) => {
    if (t) {clearTimeout(t);}
    t = setTimeout(() => fn(...args), ms);
  };
}