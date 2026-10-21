// ============================================================================
// UNIT TESTS — readiness overall status
// ============================================================================
//
// deriveOverallStatus() decides /api/health/ready's HTTP code (error → 503),
// which the deploy smoke check and auto-rollback depend on. health.ts imports
// db/config/logger at load, so those are mocked; only the pure rule is tested.
// ============================================================================

vi.mock("@/db", () => ({ db: { execute: vi.fn() } }));
vi.mock("@/lib/config", () => ({ config: { storage: { provider: "local" } } }));
vi.mock("@/lib/logger", () => ({ logger: { warn: vi.fn(), error: vi.fn() } }));

import { deriveOverallStatus } from "@/lib/health";

describe("deriveOverallStatus", () => {
  it("ok when everything is ok", () => {
    expect(
      deriveOverallStatus({ database: { status: "ok" }, storage: { status: "ok" } })
    ).toBe("ok");
  });

  it("degraded when only storage is down — still serves (200)", () => {
    expect(
      deriveOverallStatus({ database: { status: "ok" }, storage: { status: "degraded" } })
    ).toBe("degraded");
    expect(
      deriveOverallStatus({ database: { status: "ok" }, storage: { status: "error" } })
    ).toBe("degraded");
  });

  it("error whenever the database is down, regardless of storage", () => {
    expect(
      deriveOverallStatus({ database: { status: "error" }, storage: { status: "ok" } })
    ).toBe("error");
  });
});
