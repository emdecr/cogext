// ============================================================================
// UNIT TESTS — admin Auth log helpers
// ============================================================================
//
// The URL params and the stored emails / user agents are all untrusted input.
// These pin the "malformed → safe default" behavior and the display capping.
// ============================================================================

import {
  authLogHref,
  clip,
  describeUserAgent,
  normalizeAuthLogParams,
  parseAuthLogParams,
} from "@/lib/auth-log-view";

describe("parseAuthLogParams", () => {
  it("defaults to page 1, no filter", () => {
    expect(parseAuthLogParams({})).toEqual({ page: 1, type: null });
  });

  it("accepts a valid page and event type", () => {
    expect(parseAuthLogParams({ page: "3", type: "login_failure" })).toEqual({
      page: 3,
      type: "login_failure",
    });
  });

  it("falls back on malformed values instead of erroring", () => {
    expect(parseAuthLogParams({ page: "-2", type: "drop table" })).toEqual({
      page: 1,
      type: null,
    });
    expect(parseAuthLogParams({ page: "1e9" }).page).toBe(1);
    expect(parseAuthLogParams({ page: "0" }).page).toBe(1);
    expect(parseAuthLogParams({ page: "abc" }).page).toBe(1);
  });

  it("caps very large pages", () => {
    expect(parseAuthLogParams({ page: "9999" }).page).toBe(1000);
    expect(parseAuthLogParams({ page: "123456" }).page).toBe(1);
  });

  it("uses the first value when a param repeats", () => {
    expect(parseAuthLogParams({ page: ["2", "5"], type: ["logout", "x"] })).toEqual({
      page: 2,
      type: "logout",
    });
  });
});

describe("normalizeAuthLogParams (server action input)", () => {
  it("re-validates whatever reaches the action", () => {
    expect(normalizeAuthLogParams({ page: 4, type: "register" })).toEqual({
      page: 4,
      type: "register",
    });
    expect(normalizeAuthLogParams({ page: -1, type: 42 })).toEqual({ page: 1, type: null });
    expect(normalizeAuthLogParams(null)).toEqual({ page: 1, type: null });
    expect(normalizeAuthLogParams("junk")).toEqual({ page: 1, type: null });
  });
});

describe("authLogHref", () => {
  it("omits defaults and encodes the rest", () => {
    expect(authLogHref({ page: 1, type: null })).toBe("/admin/auth");
    expect(authLogHref({ page: 2, type: null })).toBe("/admin/auth?page=2");
    expect(authLogHref({ page: 3, type: "login_failure" })).toBe(
      "/admin/auth?type=login_failure&page=3"
    );
  });
});

describe("clip", () => {
  it("caps long untrusted strings and handles null", () => {
    expect(clip(null)).toBe("—");
    expect(clip("me@example.com")).toBe("me@example.com");
    const long = "a".repeat(500) + "@x.com";
    expect(clip(long, 20)).toHaveLength(20);
    expect(clip(long, 20).endsWith("…")).toBe(true);
  });
});

describe("describeUserAgent", () => {
  it("names common browsers and OSes", () => {
    expect(
      describeUserAgent(
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36"
      )
    ).toBe("Chrome · macOS");
    expect(
      describeUserAgent(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1"
      )
    ).toBe("Safari · iOS");
    expect(
      describeUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:131.0) Gecko/20100101 Firefox/131.0")
    ).toBe("Firefox · Windows");
  });

  it("flags scripts and scanners", () => {
    expect(describeUserAgent("curl/8.7.1")).toBe("curl");
    expect(describeUserAgent("python-requests/2.32.3")).toBe("python-requests");
    expect(describeUserAgent("Mozilla/5.0 (compatible; Googlebot/2.1)")).toBe("bot");
  });

  it("handles missing and unknown agents", () => {
    expect(describeUserAgent(null)).toBe("—");
    expect(describeUserAgent("SomethingWeird/1.0")).toBe("SomethingWeird/1.0");
  });
});
