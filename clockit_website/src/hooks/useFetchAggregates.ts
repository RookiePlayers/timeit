"use client";

import { useCallback, useEffect, useState } from "react";
import { statsApi } from "@/lib/api-client";
import { Aggregates, getAggregatesForRange, MetricValue, Range } from "@/types";

type HookState = {
    aggregates: Aggregates | null;
    isLoading: boolean;
    error: Error | null;
    message: string | null;
    lastRefresh: number | null;
};

export function useFetchAggregates(userId: string | null | undefined) {
    const [{ aggregates, isLoading, error, lastRefresh }, setState] = useState<HookState>({
        aggregates: null,
        isLoading: true,
        error: null,
        message: null,
        lastRefresh: null,
    });

    const loadAggregates = useCallback(async () => {
        if (!userId) {
            setState({ aggregates: null, isLoading: false, error: null, message: null, lastRefresh: null });
            return;
        }
        setState((prev) => ({ ...prev, isLoading: true, error: null, message: null }));
        try {
            const data = await statsApi.get() as { aggregates?: Aggregates; lastRefreshRequested?: number };

            if (!data) {
                setState({ aggregates: null, isLoading: false, error: null, message:  "No aggregated stats found yet.", lastRefresh: null });
                return;
            }

            const ts = data.lastRefreshRequested;
            setState({
                aggregates: data.aggregates || null,
                isLoading: false,
                error: null,
                message: null,
                lastRefresh: typeof ts === "number" && Number.isFinite(ts) ? ts : null,
            });
        } catch (err) {
            const msg = err instanceof Error ? err.message : "Failed to load stats";
            const error = err instanceof Error ? err : new Error("Failed to load stats");
            setState((prev) => ({ ...prev, isLoading: false, error, message: null }));
        }
    }, [userId]);

    useEffect(() => {
        const timeout = setTimeout(() => {
            void loadAggregates();
        }, 0);
        return () => clearTimeout(timeout);
    }, [loadAggregates]);

    const setLastRefresh = (value: number | null) =>
        setState((prev) => ({
            ...prev,
            lastRefresh: value,
        }));

    return {
        aggregates,
        isLoading,
        error,
        lastRefresh,
        refetch: loadAggregates,
        setLastRefresh,
    };
}

export function metricAverage(value: MetricValue | undefined | null) {
    if (typeof value === "number") {
        return Number.isFinite(value) ? value : 0;
    }
    if (value && typeof value.avg === "number" && Number.isFinite(value.avg)) {
        return value.avg;
    }
    return 0;
}
export function metricSum(value: MetricValue | undefined | null) {
    if (typeof value === "number") {
        return Number.isFinite(value) ? value : 0;
    }
    if (value && typeof value.sum === "number" && Number.isFinite(value.sum)) {
        return value.sum;
    }
    return 0;
}

export function toHours(value: MetricValue | undefined | null) {
    const seconds = metricAverage(value);
    return Number((seconds / 3600).toFixed(2));
}

export function languageTotalsForRange(aggregates: Aggregates | null, range: Range) {
    const totals: Record<string, number> = {};
    const entries = getAggregatesForRange(aggregates, range);
    for (const entry of entries) {
        const langSeconds = entry.languageSeconds || {};
        for (const [lang, seconds] of Object.entries(langSeconds)) {
            totals[lang] = (totals[lang] || 0) + metricAverage(seconds);
        }
    }
    return totals;
}

export function workspaceTotalsForRange(aggregates: Aggregates | null, range: Range) {
    const totals: Record<string, number> = {};
    const entries = getAggregatesForRange(aggregates, range);
    for (const entry of entries) {
        const wsSeconds = entry.workspaceSeconds || {};
        const hasWorkspaceSeconds = Object.keys(wsSeconds).length > 0;
        for (const [ws, seconds] of Object.entries(wsSeconds)) {
            totals[ws] = (totals[ws] || 0) + metricAverage(seconds);
        }
        if (!hasWorkspaceSeconds && entry.topWorkspaces) {
            for (const tw of entry.topWorkspaces) {
                totals[tw.workspace] = (totals[tw.workspace] || 0) + metricAverage(tw.seconds);
            }
        }
    }
    return totals;
}

export function computeRangeTotals(aggregates: Aggregates | null, range: Range) {
    const entries = getAggregatesForRange(aggregates, range);
    if (!entries.length) { return null; }
    return entries.reduce(
        (acc, entry) => ({
            totalSeconds: acc.totalSeconds + metricAverage(entry.totalSeconds),
            workingSeconds: acc.workingSeconds + metricAverage(entry.workingSeconds),
            idleSeconds: acc.idleSeconds + metricAverage(entry.idleSeconds),
            sessions: acc.sessions + (entry.sessionCount ? metricAverage(entry.sessionCount) : 0),
        }),
        { totalSeconds: 0, workingSeconds: 0, idleSeconds: 0, sessions: 0 }
    );
}
