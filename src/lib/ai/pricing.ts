// ============================================================================
// MODEL PRICING — tokens → dollars, computed at read time
// ============================================================================
//
// ai_usage stores token counts (the durable fact), never dollars. Cost is
// derived here from the stored `model` string, so old rows stay correct when
// prices or models change: update this table, every past row re-prices.
//
// Rates are Anthropic first-party list prices (USD per million tokens) as of
// PRICES_AS_OF, from the claude-api reference. Unknown model → null
// ("unpriced"), never silently $0.
//
// What this does NOT include (not recorded in ai_usage):
//   - prompt-cache read/write discounts — all input billed at the base rate
//   - server-tool fees, e.g. web search on recommendations ($ per 1K searches)
//   - embeddings (Voyage) — no ai_usage rows yet; see the AI failure-alerts plan
// So the total is an "LLM token spend" estimate, labeled as such in the UI.
// ============================================================================

export const PRICES_AS_OF = "2026-10-06";

type Rate = { inputPerMtok: number; outputPerMtok: number };

type ModelPrice = Rate & {
  // Some models bill the WHOLE request at a higher rate when the prompt is
  // over a threshold (Claude Haiku 5.5: >100K input tokens).
  longContext?: { overInputTokens: number } & Rate;
};

// The one long-context threshold any priced model uses today. The query
// buckets on it; if a model with a different threshold appears, add a bucket.
export const LONG_CONTEXT_INPUT_TOKENS = 100_000;

// Keyed by base model id (no date suffix — see normalizeModelId).
export const MODEL_PRICES: Record<string, ModelPrice> = {
  "claude-fable-5-1": { inputPerMtok: 10, outputPerMtok: 50 },
  "claude-fable-5": { inputPerMtok: 10, outputPerMtok: 50 },
  "claude-opus-5-5": { inputPerMtok: 4, outputPerMtok: 20 },
  "claude-opus-5": { inputPerMtok: 5, outputPerMtok: 25 },
  "claude-opus-4-8": { inputPerMtok: 5, outputPerMtok: 25 },
  "claude-opus-4-7": { inputPerMtok: 5, outputPerMtok: 25 },
  "claude-opus-4-6": { inputPerMtok: 5, outputPerMtok: 25 },
  "claude-sonnet-5-5": { inputPerMtok: 2, outputPerMtok: 10 },
  "claude-sonnet-5": { inputPerMtok: 2, outputPerMtok: 10 },
  "claude-sonnet-4-6": { inputPerMtok: 3, outputPerMtok: 15 },
  "claude-haiku-5-5": {
    inputPerMtok: 0.1,
    outputPerMtok: 0.5,
    longContext: {
      overInputTokens: LONG_CONTEXT_INPUT_TOKENS,
      inputPerMtok: 0.5,
      outputPerMtok: 2.5,
    },
  },
  "claude-haiku-4-5": { inputPerMtok: 1, outputPerMtok: 5 },
};

/**
 * Strip a trailing date snapshot so "claude-haiku-4-5-20251001" prices as
 * "claude-haiku-4-5". Also tolerates Bedrock/Vertex-style prefixes/suffixes
 * ("anthropic.", "@20251001") in case a row ever records one.
 */
export function normalizeModelId(model: string): string {
  return model
    .trim()
    .toLowerCase()
    .replace(/^anthropic\./, "")
    .replace(/[@-]\d{8}$/, "");
}

export function priceFor(model: string): ModelPrice | null {
  return MODEL_PRICES[normalizeModelId(model)] ?? null;
}

/**
 * Estimated USD for one request. `null` = unpriced model. Use this per row
 * (or per long-context bucket) — the long-context rate depends on each
 * request's own input size, so it can't be applied to a summed total.
 */
export function estimateCost(
  model: string,
  inputTokens: number,
  outputTokens: number
): number | null {
  const price = priceFor(model);
  if (!price) return null;
  const isLong = !!price.longContext && inputTokens > price.longContext.overInputTokens;
  return costAtRate(isLong && price.longContext ? price.longContext : price, inputTokens, outputTokens);
}

/**
 * USD for a SUM of requests that are all on the same side of the
 * long-context threshold (the aggregation query buckets rows that way).
 */
export function estimateBucketCost(
  model: string,
  inputTokens: number,
  outputTokens: number,
  overLongContextThreshold: boolean
): number | null {
  const price = priceFor(model);
  if (!price) return null;
  const rate = overLongContextThreshold && price.longContext ? price.longContext : price;
  return costAtRate(rate, inputTokens, outputTokens);
}

function costAtRate(rate: Rate, inputTokens: number, outputTokens: number): number {
  return (inputTokens * rate.inputPerMtok + outputTokens * rate.outputPerMtok) / 1_000_000;
}

/** "$1.23", "$0.004", "<$0.001" — enough precision for small personal spend. */
export function formatUsd(usd: number | null): string {
  if (usd === null) return "unpriced";
  if (usd === 0) return "$0.00";
  if (usd < 0.001) return "<$0.001";
  if (usd < 1) return `$${usd.toFixed(3)}`;
  return `$${usd.toFixed(2)}`;
}
