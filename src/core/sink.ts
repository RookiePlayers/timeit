// src/core/sink.ts
import { SuggestionItem } from './prompts';
import { Result, Session } from './types';

export type RequirementScope = 'setup' | 'runtime';
export type RequirementType  = 'string' | 'number' | 'secret' | 'boolean';

/**
 * Describes a value a sink needs. The orchestrator + PromptService
 * use this to read existing values, prompt when missing, validate,
 * and persist appropriately.
 */
export interface FieldSpec {
  /** Logical key a sink wants (e.g. 'jira.domain', 'jira.apiToken', 'issueKey') */
  key: string;
  label: string;
  type: RequirementType;
  scope: RequirementScope;
  required?: boolean;
  placeholder?: string;
  description?: string;
  defaultValue?: string | number | boolean;

  /**
   * Return a message string to show if the value is invalid,
   * or undefined if the value is valid.
   */
  validate?: (value: unknown) => string | undefined;

  /** Where to store/read non-secret values in VS Code settings (optional but recommended), e.g. 'clockit.jira.domain' */
  settingKey?: string;

  /**
   * Where to store/read secret values in SecretStorage.
   * Default: 'clockit.<key>' (e.g. 'clockit.jira.apiToken')
   */
  secretKey?: string;

  /**
   * Persistence behavior:
   * - 'settings' (default for non-secrets): save to workspace settings via `settingKey` or `key`
   * - 'secret'   (default for secrets): save to SecretStorage via `secretKey` or 'clockit.<key>'
   * - 'memory'   : do not persist; only use for this run
   */
  persist?: 'settings' | 'secret' | 'memory';
  remember?: boolean;        // default true. If false -> never persist.
  implicitSetting?: boolean; // default false. If true, allow using `spec.key` for settings when no `settingKey`
   // NEW: selection UI
  ui?: 'input' | 'select'; // default 'input'
  select?: {
    // Optional static items (no search)
    staticOptions?: Array<{ label: string; description?: string; value: string }>;

    // Remote/search options (sink-provided)
    // Return a page of choices, given the current query + cursor
    fetchPage?: (query: string, cursor?: string, signal?: AbortSignal) => Promise<{
      items: SuggestionItem[];
      nextCursor?: string | undefined;
    }>;

    // If true, allow free text even if not in list
    allowArbitrary?: boolean;
    // page size hint (just for load-more label, your fetch decides)
    pageSizeHint?: number;
  };
  cacheTtlMs?: number, // 1 minute for this field
}

export interface TimeSinkConfig {
  /** unique key, e.g. "csv", "jira", "notion" */
  kind: string;
  /** user-facing name */
  label?: string;
  /** on/off flag from settings */
  enabled: boolean;
  /** arbitrary config bag from settings.json */
  options: Record<string, unknown>;
}

/**
 * A sink consumes a Session (after pipeline/rounding) and exports it somewhere
 * (CSV/Jira/Notion/etc.). The orchestrator may inject hydrated values into
 * `options` before calling `export`.
 */
export interface TimeSink {
  /** immutable id for diagnostics */
  readonly kind: string;

  /** mutable options bag that the orchestrator can hydrate */
  options?: Record<string, unknown>;

  /** validate options; return ok=false (optionally with missing keys) to skip gracefully */
  validate(): Result | { ok: boolean; missing?: string[] };

  /**
   * Push one session; idempotency is the sink’s job.
   * Some sinks (OAuth) accept a second parameter (manager). Keep it optional.
   */
  export(session: Session, oauthManager?: unknown): Promise<Result>;

  /** optional shutdown */
  dispose?(): void | Promise<void>;

  /** optional requirements to drive prompting/persistence */
  requirements?(): FieldSpec[];
}

/** Optional helper for common patterns */
export abstract class BaseSink implements TimeSink {
  public readonly kind: string;
  /** mutable so the orchestrator can inject resolved values */
  public options: Record<string, unknown>;

  constructor(cfg: TimeSinkConfig) {
    this.kind = cfg.kind;
    this.options = { ...(cfg.options || {}) };
  }

  validate(): Result { return { ok: true }; }

  abstract export(session: Session, oauthManager?: unknown): Promise<Result>;

  dispose?(): void | Promise<void>;

  requirements?(): FieldSpec[];
}