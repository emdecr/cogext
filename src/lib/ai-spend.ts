// ============================================================================
// AI SPEND — pure aggregation for the admin AI spend tab
// ============================================================================
//
// Folds grouped ai_usage rows (feature × model × long-context bucket) into
// per-feature and per-model totals with estimated cost. Pure: no db/config,
// unit-testable without mocks. The query lives in
// src/lib/actions/admin/ai-spend.ts.
// ============================================================================

import { estimateBucketCost } from "@/lib/ai/pricing";

export type UsageBucket = {
  feature: string;
  model: string;
  overLongContext: boolean;
  calls: number;
  inputTokens: number;
  outputTokens: number;
};

export type SpendLine = {
  key: string; // feature or model
  calls: number;
  inputTokens: number;
  outputTokens: number;
  usd: number; // priced portion only
  unpricedCalls: number; // calls on a model with no price → excluded from usd
};

export type SpendSummary = {
  byFeature: SpendLine[]; // sorted by usd desc, then calls
  byModel: SpendLine[];
  total: SpendLine;
};

const emptyLine = (key: string): SpendLine => ({
  key,
  calls: 0,
  inputTokens: 0,
  outputTokens: 0,
  usd: 0,
  unpricedCalls: 0,
});

function add(line: SpendLine, b: UsageBucket, usd: number | null) {
  line.calls += b.calls;
  line.inputTokens += b.inputTokens;
  line.outputTokens += b.outputTokens;
  if (usd === null) line.unpricedCalls += b.calls;
  else line.usd += usd;
}

const byCost = (a: SpendLine, b: SpendLine) => b.usd - a.usd || b.calls - a.calls;

export function summarizeSpend(buckets: UsageBucket[]): SpendSummary {
  const features = new Map<string, SpendLine>();
  const models = new Map<string, SpendLine>();
  const total = emptyLine("total");

  for (const b of buckets) {
    const usd = estimateBucketCost(b.model, b.inputTokens, b.outputTokens, b.overLongContext);
    if (!features.has(b.feature)) features.set(b.feature, emptyLine(b.feature));
    if (!models.has(b.model)) models.set(b.model, emptyLine(b.model));
    add(features.get(b.feature)!, b, usd);
    add(models.get(b.model)!, b, usd);
    add(total, b, usd);
  }

  return {
    byFeature: [...features.values()].sort(byCost),
    byModel: [...models.values()].sort(byCost),
    total,
  };
}

// ---------------------------------------------------------------------------
// Window (?window=7d|30d|all) — untrusted URL input
// ---------------------------------------------------------------------------

export const SPEND_WINDOWS = ["7d", "30d", "all"] as const;
export type SpendWindow = (typeof SPEND_WINDOWS)[number];
export const DEFAULT_SPEND_WINDOW: SpendWindow = "30d";

export function parseSpendWindow(raw: string | string[] | undefined): SpendWindow {
  const v = Array.isArray(raw) ? raw[0] : raw;
  return SPEND_WINDOWS.find((w) => w === v) ?? DEFAULT_SPEND_WINDOW;
}

/** Start of the window, or null for "all". */
export function windowStart(window: SpendWindow, now: Date): Date | null {
  const days = window === "7d" ? 7 : window === "30d" ? 30 : null;
  return days === null ? null : new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}

export const WINDOW_LABELS: Record<SpendWindow, string> = {
  "7d": "Last 7 days",
  "30d": "Last 30 days",
  all: "All time",
};

/** Share of the largest value, 0–100, for bar length. */
export function barPercent(value: number, max: number): number {
  if (max <= 0 || value <= 0) return 0;
  return Math.max(1, Math.round((value / max) * 100));
}

/** "1.2M", "45.3K", "980" tokens. */
export function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}
