// ============================================================================
// AI CALL HEALTH — pure rules (shared by the admin card and the alert check)
// ============================================================================
//
// One source of truth for "is AI broken right now?": the System tab's banner
// and the healthchecks.io alert (plans/2026-10-21-ai-failure-alerts.md,
// Phase 5) both call evaluateAiHealth(), so the page and the email agree.
//
// The rule (decided 2026-10-21): any real error in the alert window trips it.
// Not counted:
//   - refusals — the model declined; nothing is broken
//   - "aborted" — WE cancelled (e.g. the browser left mid-stream)
// Both are still shown on the card.
//
// Pure: no db/config imports. Data comes from src/lib/ai-health-data.ts.
// ============================================================================

export type AiCallStatus = "ok" | "error" | "refusal";

/** ai_usage grouped by feature × status × error_kind, counted per window. */
export type HealthCountRow = {
  feature: string;
  status: AiCallStatus;
  errorKind: string | null;
  inAlertWindow: number;
  last24h: number;
  last7d: number;
};

export type StatusCounts = { ok: number; error: number; refusal: number; aborted: number };

export type FeatureHealth = {
  feature: string;
  last24h: StatusCounts;
  last7d: StatusCounts;
};

export type AiHealthVerdict = {
  status: "ok" | "alert";
  errorCount: number; // alert-counting errors in the window
  // "embedding: 2 × network" — biggest first. What the email and banner say.
  reasons: string[];
};

export const NON_ALERTING_ERROR_KINDS = new Set(["aborted"]);

const isAlertingError = (r: HealthCountRow) =>
  r.status === "error" && !NON_ALERTING_ERROR_KINDS.has(r.errorKind ?? "");

/**
 * Evaluate the alert rule over the window counts. `minErrors` is
 * AI_ALERT_MIN_ERRORS (default 1 = any error alerts).
 */
export function evaluateAiHealth(
  rows: HealthCountRow[],
  options: { minErrors: number }
): AiHealthVerdict {
  const byReason = new Map<string, number>();
  for (const r of rows) {
    if (!isAlertingError(r) || r.inAlertWindow <= 0) continue;
    const key = `${r.feature}: ${r.errorKind ?? "unknown"}`;
    byReason.set(key, (byReason.get(key) ?? 0) + r.inAlertWindow);
  }

  const reasons = [...byReason.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([key, n]) => {
      const [feature, kind] = key.split(": ");
      return `${feature}: ${n} × ${kind}`;
    });
  const errorCount = [...byReason.values()].reduce((sum, n) => sum + n, 0);

  return {
    status: errorCount >= options.minErrors ? "alert" : "ok",
    errorCount,
    reasons,
  };
}

const empty = (): StatusCounts => ({ ok: 0, error: 0, refusal: 0, aborted: 0 });

function add(counts: StatusCounts, r: HealthCountRow, n: number) {
  if (r.status === "error" && r.errorKind === "aborted") counts.aborted += n;
  else counts[r.status] += n;
}

/** Per-feature 24h / 7d counts for the card, busiest feature first. */
export function summarizeByFeature(rows: HealthCountRow[]): FeatureHealth[] {
  const features = new Map<string, FeatureHealth>();
  for (const r of rows) {
    if (!features.has(r.feature)) {
      features.set(r.feature, { feature: r.feature, last24h: empty(), last7d: empty() });
    }
    const f = features.get(r.feature)!;
    add(f.last24h, r, r.last24h);
    add(f.last7d, r, r.last7d);
  }
  const total = (c: StatusCounts) => c.ok + c.error + c.refusal + c.aborted;
  return [...features.values()]
    .filter((f) => total(f.last7d) > 0)
    .sort((a, b) => total(b.last7d) - total(a.last7d) || a.feature.localeCompare(b.feature));
}
