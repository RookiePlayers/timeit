export type MetricStats = {
  sum: number;
  avg: number;
  min: number;
  max: number;
};

export type MetricValue = number | MetricStats;

export type AggregateEntry = {
  periodStart: string;
  totalSeconds: MetricValue;
  workingSeconds: MetricValue;
  idleSeconds: MetricValue;
  sessionCount?: MetricValue;
  productivityScore?: number;
  productivityPercent: number;
  languageSeconds?: Record<string, MetricValue>;
  topLanguage?: { language: string; seconds: MetricValue } | null;
  workspaceSeconds?: Record<string, MetricValue>;
  topWorkspaces?: { workspace: string; seconds: MetricValue }[];
};

export type Aggregates = {
  week: AggregateEntry[];
  month: AggregateEntry[];
  year: AggregateEntry[];
  all_month: AggregateEntry[];
  all: AggregateEntry[];
  thisWeek: AggregateEntry | null;
  thisMonth: AggregateEntry | null;
  thisYear: AggregateEntry | null;
};

export interface MaterializedStats {
  aggregates?: Aggregates;
  lastRefreshRequested?: string;
  lastAggregatedAt?: string;
  updatedAt?: string;
  [key: string]: unknown;
}

export interface Achievement {
  id: string;
  type: string;
  earnedAt: string;
  [key: string]: unknown;
}

export interface RefreshStatsRequest {
  lastRefreshRequested: string;
}
