// ============================================================================
// UNIT TESTS — AI call health rules
// ============================================================================
//
// evaluateAiHealth() decides both the System tab banner and (Phase 5) the
// alert email, so its edges are pinned here: any real error alerts; refusals
// and our own "aborted" cancellations never do.
// ============================================================================

import {
  evaluateAiHealth,
  summarizeByFeature,
  type HealthCountRow,
} from "@/lib/ai-health";

const row = (r: Partial<HealthCountRow>): HealthCountRow => ({
  feature: "chat",
  status: "ok",
  errorKind: null,
  inAlertWindow: 0,
  last24h: 0,
  last7d: 0,
  ...r,
});

describe("evaluateAiHealth", () => {
  it("ok when there are only successes and refusals", () => {
    const v = evaluateAiHealth(
      [
        row({ status: "ok", inAlertWindow: 40 }),
        row({ status: "refusal", inAlertWindow: 3 }),
      ],
      { minErrors: 1 }
    );
    expect(v).toEqual({ status: "ok", errorCount: 0, reasons: [] });
  });

  it("any real error in the window alerts (default threshold 1)", () => {
    const v = evaluateAiHealth(
      [row({ feature: "tagging", status: "error", errorKind: "rate_limit", inAlertWindow: 1 })],
      { minErrors: 1 }
    );
    expect(v).toEqual({ status: "alert", errorCount: 1, reasons: ["tagging: 1 × rate_limit"] });
  });

  it("our own aborted cancellations never alert", () => {
    const v = evaluateAiHealth(
      [row({ status: "error", errorKind: "aborted", inAlertWindow: 9 })],
      { minErrors: 1 }
    );
    expect(v.status).toBe("ok");
    expect(v.errorCount).toBe(0);
  });

  it("only counts errors inside the alert window", () => {
    const v = evaluateAiHealth(
      [row({ status: "error", errorKind: "network", inAlertWindow: 0, last24h: 4, last7d: 9 })],
      { minErrors: 1 }
    );
    expect(v.status).toBe("ok");
  });

  it("groups reasons by feature and kind, biggest first", () => {
    const v = evaluateAiHealth(
      [
        row({ feature: "tagging", status: "error", errorKind: "rate_limit", inAlertWindow: 1 }),
        row({ feature: "embedding", status: "error", errorKind: "network", inAlertWindow: 2 }),
        row({ feature: "chat", status: "error", errorKind: null, inAlertWindow: 1 }),
      ],
      { minErrors: 1 }
    );
    expect(v.reasons).toEqual([
      "embedding: 2 × network",
      "chat: 1 × unknown",
      "tagging: 1 × rate_limit",
    ]);
    expect(v.errorCount).toBe(4);
  });

  it("respects a higher AI_ALERT_MIN_ERRORS", () => {
    const rows = [row({ status: "error", errorKind: "timeout", inAlertWindow: 2 })];
    expect(evaluateAiHealth(rows, { minErrors: 3 }).status).toBe("ok");
    expect(evaluateAiHealth(rows, { minErrors: 2 }).status).toBe("alert");
  });
});

describe("summarizeByFeature", () => {
  it("splits aborted out of errors and orders by 7-day volume", () => {
    const out = summarizeByFeature([
      row({ feature: "chat", status: "ok", last24h: 2, last7d: 5 }),
      row({ feature: "chat", status: "error", errorKind: "aborted", last24h: 1, last7d: 1 }),
      row({ feature: "embedding", status: "ok", last24h: 10, last7d: 30 }),
      row({ feature: "embedding", status: "error", errorKind: "network", last24h: 0, last7d: 2 }),
      row({ feature: "profile", status: "refusal", last24h: 0, last7d: 1 }),
    ]);
    expect(out.map((f) => f.feature)).toEqual(["embedding", "chat", "profile"]);
    expect(out[1].last24h).toEqual({ ok: 2, error: 0, refusal: 0, aborted: 1 });
    expect(out[0].last7d).toEqual({ ok: 30, error: 2, refusal: 0, aborted: 0 });
  });

  it("drops features with no calls in 7 days", () => {
    expect(summarizeByFeature([row({ feature: "chat", last7d: 0 })])).toEqual([]);
  });
});
