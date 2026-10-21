// ============================================================================
// UNIT TESTS — model pricing
// ============================================================================

import {
  estimateBucketCost,
  estimateCost,
  formatUsd,
  normalizeModelId,
  priceFor,
} from "@/lib/ai/pricing";

describe("normalizeModelId", () => {
  it("strips date snapshots and platform prefixes", () => {
    expect(normalizeModelId("claude-haiku-4-5-20251001")).toBe("claude-haiku-4-5");
    expect(normalizeModelId("claude-opus-4-5@20251101")).toBe("claude-opus-4-5");
    expect(normalizeModelId("anthropic.claude-sonnet-5-5")).toBe("claude-sonnet-5-5");
    expect(normalizeModelId("claude-sonnet-5-5")).toBe("claude-sonnet-5-5");
  });
});

describe("estimateCost", () => {
  it("prices known models per million tokens", () => {
    // Sonnet 4.6: $3 in / $15 out
    expect(estimateCost("claude-sonnet-4-6", 1_000_000, 1_000_000)).toBeCloseTo(18);
    // Sonnet 5.5: $2 / $10
    expect(estimateCost("claude-sonnet-5-5", 500_000, 100_000)).toBeCloseTo(2);
    // Date-suffixed Haiku 4.5 row from real data: $1 / $5
    expect(estimateCost("claude-haiku-4-5-20251001", 23_390, 2_208)).toBeCloseTo(0.03443);
  });

  it("returns null for an unpriced model (never a silent $0)", () => {
    expect(estimateCost("llama3.2:1b", 1000, 1000)).toBeNull();
    expect(priceFor("voyage-4-lite")).toBeNull();
  });

  it("is zero for zero tokens", () => {
    expect(estimateCost("claude-sonnet-5-5", 0, 0)).toBe(0);
  });

  it("applies Haiku 5.5's long-context rate only ABOVE 100K input tokens", () => {
    // ≤100K: $0.10 / $0.50
    expect(estimateCost("claude-haiku-5-5", 100_000, 1_000)).toBeCloseTo(0.0105);
    // >100K: the whole request at $0.50 / $2.50
    expect(estimateCost("claude-haiku-5-5", 100_001, 1_000)).toBeCloseTo(0.0525005);
  });
});

describe("estimateBucketCost", () => {
  it("prices a summed bucket at the rate its side of the threshold implies", () => {
    expect(estimateBucketCost("claude-haiku-5-5", 300_000, 3_000, false)).toBeCloseTo(0.0315);
    expect(estimateBucketCost("claude-haiku-5-5", 300_000, 3_000, true)).toBeCloseTo(0.1575);
    // Models without a long-context tier ignore the flag.
    expect(estimateBucketCost("claude-sonnet-5-5", 1_000_000, 0, true)).toBeCloseTo(2);
    expect(estimateBucketCost("mystery-model", 1, 1, false)).toBeNull();
  });
});

describe("formatUsd", () => {
  it("keeps enough precision for small personal spend", () => {
    expect(formatUsd(null)).toBe("unpriced");
    expect(formatUsd(0)).toBe("$0.00");
    expect(formatUsd(0.0004)).toBe("<$0.001");
    expect(formatUsd(0.0776)).toBe("$0.078");
    expect(formatUsd(12.345)).toBe("$12.35");
  });
});
