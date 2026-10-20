// ============================================================================
// UNIT TESTS — requireAdmin / getAdminUser
// ============================================================================
//
// admin.ts imports @/db, @/lib/config and the session module at load time, so
// all three are mocked. notFound() is mocked to throw a recognizable error —
// the real one throws a Next-internal error that only the framework catches.
//
// React's cache() is a no-op outside a server render, so each call here does
// a fresh lookup — which is what we want for isolated tests.
// ============================================================================

const { findFirst, getSession, adminConfig } = vi.hoisted(() => ({
  findFirst: vi.fn(),
  getSession: vi.fn(),
  adminConfig: { emails: [] as string[] },
}));

vi.mock("@/db", () => ({
  db: { query: { users: { findFirst } } },
}));
vi.mock("@/db/schema", () => ({ users: { id: "id" } }));
vi.mock("@/lib/config", () => ({ config: { admin: adminConfig } }));
vi.mock("@/lib/auth/session", () => ({ getSession }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
}));

import { getAdminUser, requireAdmin } from "@/lib/auth/admin";

describe("admin gate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    adminConfig.emails = ["me@example.com"];
    getSession.mockResolvedValue({ userId: "user-1" });
    findFirst.mockResolvedValue({ id: "user-1", email: "Me@Example.com" });
  });

  it("returns the user when their email is on the allowlist", async () => {
    await expect(requireAdmin()).resolves.toEqual({
      id: "user-1",
      email: "Me@Example.com",
    });
  });

  it("404s a logged-in user who isn't on the allowlist", async () => {
    findFirst.mockResolvedValue({ id: "user-1", email: "you@example.com" });
    await expect(requireAdmin()).rejects.toThrow("NOT_FOUND");
  });

  it("404s when there's no session", async () => {
    getSession.mockResolvedValue(null);
    await expect(requireAdmin()).rejects.toThrow("NOT_FOUND");
    expect(findFirst).not.toHaveBeenCalled();
  });

  it("404s when the session's user no longer exists", async () => {
    findFirst.mockResolvedValue(undefined);
    await expect(requireAdmin()).rejects.toThrow("NOT_FOUND");
  });

  it("is fail-closed with an empty allowlist, without a DB lookup", async () => {
    adminConfig.emails = [];
    await expect(getAdminUser()).resolves.toBeNull();
    expect(findFirst).not.toHaveBeenCalled();
  });

  // Regression: reading the session (cookies) is what makes /admin render
  // per-request. When the empty-allowlist check ran first, `next build` (no
  // ADMIN_EMAILS) prerendered every admin page as a static 404, which prod then
  // served even with ADMIN_EMAILS set.
  it("reads the session even when the allowlist is empty", async () => {
    adminConfig.emails = [];
    await getAdminUser();
    expect(getSession).toHaveBeenCalled();
  });
});
