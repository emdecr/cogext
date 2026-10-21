// ============================================================================
// UNIT TESTS — admin System tab helpers
// ============================================================================

import {
  commitUrl,
  compareLastUsed,
  formatUptime,
  shortSha,
} from "@/lib/system-info";

const SHA = "9553bc2a1f0e4d5c6b7a8f9e0d1c2b3a4f5e6d7c";

describe("formatUptime", () => {
  it("shows the two largest non-zero units", () => {
    expect(formatUptime(0)).toBe("0s");
    expect(formatUptime(45)).toBe("45s");
    expect(formatUptime(250)).toBe("4m 10s");
    expect(formatUptime(7500)).toBe("2h 5m");
    expect(formatUptime(3 * 86400 + 4 * 3600 + 59)).toBe("3d 4h");
  });

  it("skips a zero second unit instead of printing it", () => {
    expect(formatUptime(86400 + 30)).toBe("1d");
    expect(formatUptime(3600)).toBe("1h");
  });
});

describe("shortSha / commitUrl", () => {
  it("shortens real SHAs, leaves 'dev' alone", () => {
    expect(shortSha(SHA)).toBe("9553bc2");
    expect(shortSha("dev")).toBe("dev");
  });

  it("links only a real SHA with a valid owner/repo", () => {
    expect(commitUrl("emdecr/cogext", SHA)).toBe(
      `https://github.com/emdecr/cogext/commit/${SHA}`
    );
    expect(commitUrl("", SHA)).toBeNull();
    expect(commitUrl("emdecr/cogext", "dev")).toBeNull();
    expect(commitUrl("not a repo", SHA)).toBeNull();
    expect(commitUrl("evil.com/x/y", SHA)).toBeNull();
  });
});

describe("compareLastUsed", () => {
  it("flags a model that differs from the configured one", () => {
    expect(compareLastUsed("claude-haiku-5-5", "claude-haiku-5-5")).toBe("match");
    expect(compareLastUsed("claude-haiku-5-5", "claude-haiku-4-5-20251001")).toBe("mismatch");
    expect(compareLastUsed("claude-haiku-5-5", null)).toBe("none");
  });
});
