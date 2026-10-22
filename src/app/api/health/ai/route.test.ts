// ============================================================================
// UNIT TESTS — GET /api/health/ai
// ============================================================================
//
// The route is the gate for the alert script, so: no secret → 401 and no
// data read; a working check → 200 with the shared rule's verdict; a failed
// check → 500 (the script turns that into a /fail ping). Data is mocked;
// the real query has its own integration test.
// ============================================================================

const { mockGetAiHealthData } = vi.hoisted(() => ({ mockGetAiHealthData: vi.fn() }));

vi.mock("@/lib/ai-health-data", () => ({ getAiHealthData: mockGetAiHealthData }));
vi.mock("@/lib/config", () => ({
  config: {
    app: { cronSecret: "test-cron-secret-that-is-long-enough-0123" },
    aiAlerts: { minErrors: 1, windowHours: 6 },
  },
}));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn() } }));

import { NextRequest } from "next/server";
import { GET } from "@/app/api/health/ai/route";

const SECRET = "test-cron-secret-that-is-long-enough-0123";
const req = (auth?: string) =>
  new NextRequest("http://localhost/api/health/ai", {
    headers: auth ? { authorization: auth } : {},
  });

const windowStart = "2026-10-22T06:00:00.000Z";
const data = (rows: unknown[], recentErrors: unknown[] = []) => ({
  rows,
  recentErrors,
  windowHours: 6,
  windowStart,
});

beforeEach(() => vi.clearAllMocks());

describe("GET /api/health/ai", () => {
  it.each([undefined, "Bearer wrong", SECRET, `Basic ${SECRET}`])(
    "401 without the right bearer secret (%s) — and reads nothing",
    async (auth) => {
      const res = await GET(req(auth));
      expect(res.status).toBe(401);
      expect(mockGetAiHealthData).not.toHaveBeenCalled();
    }
  );

  it("200 ok when the window has no alerting errors", async () => {
    mockGetAiHealthData.mockResolvedValue(
      data([{ feature: "chat", status: "ok", errorKind: null, inAlertWindow: 5, last24h: 5, last7d: 9 }])
    );
    const res = await GET(req(`Bearer ${SECRET}`));
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toMatchObject({ status: "ok", errorCount: 0, reasons: [], windowHours: 6 });
  });

  it("200 alert with reasons and only the window's alerting errors", async () => {
    mockGetAiHealthData.mockResolvedValue(
      data(
        [
          { feature: "embedding", status: "error", errorKind: "network", inAlertWindow: 1, last24h: 1, last7d: 1 },
          { feature: "chat", status: "error", errorKind: "aborted", inAlertWindow: 2, last24h: 2, last7d: 2 },
        ],
        [
          { feature: "embedding", provider: "voyage", model: "voyage-4-lite", errorKind: "network", errorMessage: "fetch failed", at: "2026-10-22T10:00:00.000Z" },
          { feature: "chat", provider: "claude", model: "claude-sonnet-5-5", errorKind: "aborted", errorMessage: "closed", at: "2026-10-22T09:00:00.000Z" },
          { feature: "tagging", provider: "claude", model: "claude-haiku-5-5", errorKind: "auth", errorMessage: "401", at: "2026-10-21T20:00:00.000Z" },
        ]
      )
    );
    const body = await (await GET(req(`Bearer ${SECRET}`))).json();
    expect(body).toMatchObject({ status: "alert", errorCount: 1, reasons: ["embedding: 1 × network"] });
    // aborted (not alerting) and the pre-window auth error are left out
    expect(body.latestErrors).toEqual([
      { at: "2026-10-22T10:00:00.000Z", feature: "embedding", kind: "network", model: "voyage-4-lite", message: "fetch failed" },
    ]);
  });

  it("500 when the check itself fails", async () => {
    mockGetAiHealthData.mockRejectedValue(new Error("db down"));
    const res = await GET(req(`Bearer ${SECRET}`));
    expect(res.status).toBe(500);
    expect(await res.json()).toMatchObject({ status: "error" });
  });
});
