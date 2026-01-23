import z from "zod";

export type Range = "week" | "month" | "year" | "all";

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

export function getAggregatesForRange(
  aggregates: Aggregates | null | undefined,
  range: Range
): AggregateEntry[] {
  if (!aggregates) {return [];}
  switch (range) {
    case "week":
      return aggregates.week || [];
    case "month":
      return aggregates.month || [];
    case "year":
      return aggregates.year || [];
    case "all":
    default:
      return aggregates.all_month?.length ? aggregates.all_month : aggregates.all || [];
  }
}

export type Grade = { letter: string; description: string };

export const rangeLabels: Record<Range, string> = {
  week: "Weekly",
  month: "Monthly",
  year: "Yearly",
  all: "All time",
};

export type ChartView = "stackedArea" | "stackedBar" | "line";

export const chartViews: Array<{ key: ChartView; label: string }> = [
  { key: "stackedArea", label: "Stacked area" },
  { key: "stackedBar", label: "Stacked bars" },
  { key: "line", label: "Lines" },
];

export type Goal = {
  id: string;
  title: string;
  createdAt: string;
  completed: boolean;
  completedAt?: string;
  groupId: string;
  groupName: string;
  createdBy?: string;
  locked?: boolean;
  estimatedGoalTime?: number;
  order?: number;
  note?: string;
};

export type GoalGroup = {
  id: string;
  name: string;
  kind: "day" | "custom";
  createdAt?: string;
  description?: string;
};

export type ClockitSession = {
  id: string;
  label: string;
  startedAt: number;
  endedAt?: number;
  running: boolean;
  accumulatedMs?: number;
  pausedAt?: number;
  goals: Goal[];
  groupId?: string;
  groupName?: string;
  comment?: string;
  perLanguageSeconds?: Record<string, number>;
  perFileSeconds?: Record<string, number>;
  idleSeconds?: number;
  linesAdded?: number;
  linesDeleted?: number;
};

export type ClockitSessionUpload = Omit<ClockitSession, "groupId" | "groupName" | "comment" | "pausedAt"> & {
  userName?: string;
  userEmail?: string;
  csv?: string | null;
  csvHeader?: string;
  groupId: string | null;
  groupName: string | null;
  comment: string | null;
  pausedAt: number | null;
  sessionId: string;
  createdAt: string;
  lastUpdatedAt?: string;
}

export type UploadRow = {
  id: string;
  filename: string;
  uploadedAt?: Date | null;
  source: "manual" | "auto";
  count: number;
  ideName?: string;
};

export type SessionUpload = {
  startedIso?: string;
  endedIso?: string;
  durationSeconds?: number;
  title?: string;
  idleSeconds?: number;
  linesAdded?: number;
  linesDeleted?: number;
  perFileSeconds?: Record<string, number>;
  perLanguageSeconds?: Record<string, number>;
  authorName?: string;
  authorEmail?: string;
  machine?: string;
  ideName?: string;
  workspace?: string;
  repoPath?: string;
  branch?: string | null;
  issueKey?: string | null;
  comment?: string;
  meta?: Record<string, unknown>;
  goals?: Goal[];
}
export const sessionUploadSchema = z.object({
  startedIso: z.string().optional(),
  endedIso: z.string().optional(),
  durationSeconds: z.coerce.number().optional(),
  title: z.string().optional(),
  idleSeconds: z.coerce.number().optional(),
  linesAdded: z.coerce.number().optional(),
  linesDeleted: z.coerce.number().optional(),
  perFileSeconds: z.record(z.string(), z.coerce.number()).optional(),
  perLanguageSeconds: z.record(z.string(), z.coerce.number()).optional(),
  authorName: z.string().optional(),
  authorEmail: z.string().optional(),
  machine: z.string().optional(),
  ideName: z.string().optional(),
  workspace: z.string().optional(),
  repoPath: z.string().optional(),
  branch: z.string().nullable().optional(),
  issueKey: z.string().nullable().optional(),
  comment: z.string().optional(),
  meta: z.record(z.string(), z.unknown()).optional(),
  goals: z.array(z.any()).optional(),
});
