"use server";

// ============================================================================
// ADMIN — AI SPEND (read-only)
// ============================================================================
//
// Estimated LLM token spend by feature and by model over a time window.
// Instance-wide (all users), like the other admin tabs. Admin-only:
// requireAdmin() 404s anyone else.
//
// One GROUP BY over ai_usage: feature × model × "prompt over the long-context
// threshold". Cost can't be computed from summed tokens when a model bills
// long prompts at a higher rate (Claude Haiku 5.5), so that bucket is kept
// separate and priced in TS (src/lib/ai-spend.ts, src/lib/ai/pricing.ts).
// ============================================================================

import { count, gte, sql, sum } from "drizzle-orm";
import { db } from "@/db";
import { aiUsage } from "@/db/schema";
import { requireAdmin } from "@/lib/auth/admin";
import { LONG_CONTEXT_INPUT_TOKENS, PRICES_AS_OF } from "@/lib/ai/pricing";
import {
  parseSpendWindow,
  summarizeSpend,
  windowStart,
  type SpendSummary,
  type SpendWindow,
} from "@/lib/ai-spend";

export type AiSpendOverview = SpendSummary & {
  window: SpendWindow;
  since: string | null;
  firstRecordedAt: string | null; // oldest ai_usage row, so "all time" has a start date
  pricesAsOf: string;
  generatedAt: string;
};

export async function getAiSpend(rawWindow: unknown): Promise<AiSpendOverview> {
  await requireAdmin();
  // Actions are callable directly — re-validate rather than trust the page.
  const window = parseSpendWindow(typeof rawWindow === "string" ? rawWindow : undefined);

  const now = new Date();
  const since = windowStart(window, now);
  // The threshold is inlined as a SQL literal, not a bound parameter: with
  // parameters, SELECT and GROUP BY get $1 and $2, Postgres can't tell they're
  // the same expression, and rejects the query. Safe — it's a code constant,
  // never user input (and asserted to be an integer).
  if (!Number.isInteger(LONG_CONTEXT_INPUT_TOKENS)) {
    throw new Error("LONG_CONTEXT_INPUT_TOKENS must be an integer");
  }
  const overLong = sql<boolean>`${aiUsage.inputTokens} > ${sql.raw(String(LONG_CONTEXT_INPUT_TOKENS))}`;

  const [rows, [first]] = await Promise.all([
    db
      .select({
        feature: aiUsage.feature,
        model: aiUsage.model,
        overLongContext: overLong,
        calls: count(),
        inputTokens: sum(aiUsage.inputTokens).mapWith(Number),
        outputTokens: sum(aiUsage.outputTokens).mapWith(Number),
      })
      .from(aiUsage)
      .where(since ? gte(aiUsage.createdAt, since) : undefined)
      .groupBy(aiUsage.feature, aiUsage.model, overLong),
    db.select({ at: sql<Date | null>`min(${aiUsage.createdAt})` }).from(aiUsage),
  ]);

  const firstAt = first?.at ? new Date(first.at) : null;

  return {
    ...summarizeSpend(rows),
    window,
    since: since?.toISOString() ?? null,
    firstRecordedAt: firstAt?.toISOString() ?? null,
    pricesAsOf: PRICES_AS_OF,
    generatedAt: now.toISOString(),
  };
}
