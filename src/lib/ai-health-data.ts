// ============================================================================
// AI CALL HEALTH — data
// ============================================================================
//
// Reads ai_usage for the health card and the alert check. NO auth here on
// purpose: callers gate it — the System tab via requireAdmin(), the Phase 5
// alert endpoint via the CRON_SECRET bearer token. Never call it from an
// unauthenticated path.
//
// One grouped query (feature × status × error_kind) with three windowed
// counts, plus the latest few errors. Both scan at most max(7 days, alert
// window) of rows via ai_usage_created_at_idx. Instance-wide (all users).
// ============================================================================

import { and, desc, eq, gte, sql } from "drizzle-orm";
import { db } from "@/db";
import { aiUsage } from "@/db/schema";
import type { HealthCountRow } from "@/lib/ai-health";

const HOUR_MS = 60 * 60 * 1000;
const RECENT_ERROR_LIMIT = 5;

export type RecentAiError = {
  feature: string;
  provider: string;
  model: string;
  errorKind: string | null;
  errorMessage: string | null;
  at: string;
};

export type AiHealthData = {
  rows: HealthCountRow[];
  recentErrors: RecentAiError[];
  windowHours: number;
  windowStart: string;
};

export async function getAiHealthData(options: {
  now: Date;
  windowHours: number;
}): Promise<AiHealthData> {
  const { now, windowHours } = options;
  const windowStart = new Date(now.getTime() - windowHours * HOUR_MS);
  const dayStart = new Date(now.getTime() - 24 * HOUR_MS);
  const weekStart = new Date(now.getTime() - 7 * 24 * HOUR_MS);
  const earliest = windowStart < weekStart ? windowStart : weekStart;

  // Each count is a FILTERed aggregate, so the window bounds are ordinary
  // parameters (they never appear in GROUP BY — unlike the AI spend query's
  // threshold, which had to be inlined for that reason).
  const countSince = (since: Date) =>
    sql<number>`count(*) filter (where ${aiUsage.createdAt} >= ${since.toISOString()})`.mapWith(Number);

  const [rows, recent] = await Promise.all([
    db
      .select({
        feature: aiUsage.feature,
        status: aiUsage.status,
        errorKind: aiUsage.errorKind,
        inAlertWindow: countSince(windowStart),
        last24h: countSince(dayStart),
        last7d: countSince(weekStart),
      })
      .from(aiUsage)
      .where(gte(aiUsage.createdAt, earliest))
      .groupBy(aiUsage.feature, aiUsage.status, aiUsage.errorKind),
    db
      .select({
        feature: aiUsage.feature,
        provider: aiUsage.provider,
        model: aiUsage.model,
        errorKind: aiUsage.errorKind,
        errorMessage: aiUsage.errorMessage,
        createdAt: aiUsage.createdAt,
      })
      .from(aiUsage)
      .where(and(eq(aiUsage.status, "error"), gte(aiUsage.createdAt, weekStart)))
      .orderBy(desc(aiUsage.createdAt))
      .limit(RECENT_ERROR_LIMIT),
  ]);

  return {
    rows,
    recentErrors: recent.map(({ createdAt, ...r }) => ({ ...r, at: createdAt.toISOString() })),
    windowHours,
    windowStart: windowStart.toISOString(),
  };
}
