// ============================================================================
// UNIT TESTS — AI spend aggregation
// ============================================================================
//
// The fixture mirrors real grouped ai_usage rows (feature × model ×
// long-context bucket), so the totals here are what the tab should show.
// ============================================================================

import {
  barPercent,
  formatTokens,
  parseSpendWindow,
  summarizeSpend,
  windowStart,
  type UsageBucket,
} from "@/lib/ai-spend";

const bucket = (b: Partial<UsageBucket>): UsageBucket => ({
  feature: "chat",
  model: "claude-sonnet-5-5",
  overLongContext: false,
  calls: 1,
  inputTokens: 0,
  outputTokens: 0,
  ...b,
});

describe("summarizeSpend", () => {
  // Local dev ai_usage as of 2026-10-21.
  const real: UsageBucket[] = [
    bucket({ feature: "reflection", model: "claude-sonnet-4-6", calls: 7, inputTokens: 7_509, outputTokens: 3_672 }),
    bucket({ feature: "recommendation", model: "claude-haiku-4-5-20251001", calls: 6, inputTokens: 225_893, outputTokens: 4_238 }),
    bucket({ feature: "recommendation", model: "claude-sonnet-4-6", calls: 1, inputTokens: 90_051, outputTokens: 741 }),
    bucket({ feature: "image_analysis", model: "claude-haiku-4-5-20251001", calls: 20, inputTokens: 23_390, outputTokens: 2_208 }),
  ];

  it("totals cost across mixed models within a feature", () => {
    const s = summarizeSpend(real);
    const rec = s.byFeature.find((l) => l.key === "recommendation")!;
    expect(rec.calls).toBe(7);
    expect(rec.usd).toBeCloseTo(0.247083 + 0.281268, 6);
    expect(s.total.usd).toBeCloseTo(0.640388, 6);
    expect(s.total.calls).toBe(34);
  });

  it("ranks features and models by cost", () => {
    const s = summarizeSpend(real);
    expect(s.byFeature.map((l) => l.key)).toEqual(["recommendation", "reflection", "image_analysis"]);
    expect(s.byModel.map((l) => l.key)).toEqual(["claude-sonnet-4-6", "claude-haiku-4-5-20251001"]);
  });

  it("prices the long-context bucket at the higher rate", () => {
    const s = summarizeSpend([
      bucket({ model: "claude-haiku-5-5", inputTokens: 50_000, outputTokens: 1_000 }),
      bucket({ model: "claude-haiku-5-5", overLongContext: true, inputTokens: 150_000, outputTokens: 1_000 }),
    ]);
    // 0.005 + 0.0005  +  0.075 + 0.0025
    expect(s.total.usd).toBeCloseTo(0.083, 6);
  });

  it("counts unpriced calls separately instead of pricing them at $0", () => {
    const s = summarizeSpend([
      bucket({ model: "llama3.2:1b", calls: 3, inputTokens: 900, outputTokens: 90 }),
      bucket({ model: "claude-sonnet-5-5", calls: 1, inputTokens: 1_000_000, outputTokens: 0 }),
    ]);
    expect(s.total.usd).toBeCloseTo(2);
    expect(s.total.unpricedCalls).toBe(3);
    expect(s.total.calls).toBe(4);
  });

  it("handles no rows", () => {
    const s = summarizeSpend([]);
    expect(s.byFeature).toEqual([]);
    expect(s.total).toMatchObject({ calls: 0, usd: 0 });
  });
});

describe("window parsing", () => {
  it("accepts 7d / 30d / all and defaults to 30d on anything else", () => {
    expect(parseSpendWindow("7d")).toBe("7d");
    expect(parseSpendWindow(["all", "7d"])).toBe("all");
    expect(parseSpendWindow(undefined)).toBe("30d");
    expect(parseSpendWindow("<script>")).toBe("30d");
  });

  it("computes the window start", () => {
    const now = new Date("2026-10-21T12:00:00Z");
    expect(windowStart("7d", now)?.toISOString()).toBe("2026-10-14T12:00:00.000Z");
    expect(windowStart("all", now)).toBeNull();
  });
});

describe("formatting", () => {
  it("barPercent scales to the max and keeps tiny non-zero bars visible", () => {
    expect(barPercent(5, 10)).toBe(50);
    expect(barPercent(0.0001, 10)).toBe(1);
    expect(barPercent(0, 10)).toBe(0);
    expect(barPercent(3, 0)).toBe(0);
  });

  it("formatTokens abbreviates", () => {
    expect(formatTokens(980)).toBe("980");
    expect(formatTokens(45_300)).toBe("45.3K");
    expect(formatTokens(1_234_567)).toBe("1.2M");
  });
});
