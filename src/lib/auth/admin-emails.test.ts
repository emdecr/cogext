// ============================================================================
// UNIT TESTS — Admin email allowlist
// ============================================================================
//
// Pure functions, no mocks. The important property is fail-closed: an empty
// or missing ADMIN_EMAILS must never make anyone an admin.
// ============================================================================

import { parseEmailList, isAdminEmail } from "@/lib/auth/admin-emails";

describe("parseEmailList", () => {
  it("returns [] for undefined or empty input", () => {
    expect(parseEmailList(undefined)).toEqual([]);
    expect(parseEmailList("")).toEqual([]);
    expect(parseEmailList(" , ,")).toEqual([]);
  });

  it("trims, lowercases, and drops empty entries", () => {
    expect(parseEmailList(" Me@Example.com, ,you@example.COM ")).toEqual([
      "me@example.com",
      "you@example.com",
    ]);
  });
});

describe("isAdminEmail", () => {
  const allowlist = ["me@example.com"];

  it("matches case- and whitespace-insensitively", () => {
    expect(isAdminEmail("ME@example.com", allowlist)).toBe(true);
    expect(isAdminEmail("  me@example.com ", allowlist)).toBe(true);
  });

  it("rejects emails not on the list", () => {
    expect(isAdminEmail("you@example.com", allowlist)).toBe(false);
    // No substring / prefix matching
    expect(isAdminEmail("me@example.com.evil", allowlist)).toBe(false);
  });

  it("is fail-closed: empty allowlist or missing email → false", () => {
    expect(isAdminEmail("me@example.com", [])).toBe(false);
    expect(isAdminEmail("", allowlist)).toBe(false);
    expect(isAdminEmail(null, allowlist)).toBe(false);
    expect(isAdminEmail(undefined, allowlist)).toBe(false);
  });
});
