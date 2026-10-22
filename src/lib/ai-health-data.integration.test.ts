// ============================================================================
// INTEGRATION TEST — getAiHealthData() against real Postgres
// ============================================================================
//
// Pins the windowed counts (alert window / 24h / 7d) and the latest-errors
// list, then runs the real rule over them. Uses a fixed `now` in 2020 and
// seeds rows at known ages around it, so no other ai_usage row can fall into
// the windows — the test passes on a shared database too.
// ============================================================================

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { aiUsage, users } from "@/db/schema";
import { getAiHealthData } from "@/lib/ai-health-data";
import { evaluateAiHealth, summarizeByFeature } from "@/lib/ai-health";

const NOW = new Date("2020-06-15T12:00:00Z");
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 60 * 60 * 1000);

let userId: string | undefined;

beforeAll(async () => {
  const [u] = await db
    .insert(users)
    .values({ email: `ai-health-${Date.now()}@example.com`, passwordHash: "x" })
    .returning({ id: users.id });
  userId = u.id;

  const base = { userId: u.id, provider: "claude" as const, model: "claude-haiku-5-5", inputTokens: 1, outputTokens: 1 };
  await db.insert(aiUsage).values([
    // Inside the 6h alert window
    { ...base, feature: "tagging", createdAt: hoursAgo(1) },
    { ...base, feature: "tagging", status: "error", errorKind: "rate_limit", errorMessage: "429 slow down", inputTokens: 0, outputTokens: 0, createdAt: hoursAgo(2) },
    { ...base, feature: "chat", status: "error", errorKind: "aborted", errorMessage: "closed early", createdAt: hoursAgo(3) },
    { ...base, feature: "chat", status: "refusal", createdAt: hoursAgo(4) },
    // 24h but outside the alert window
    { ...base, feature: "embedding", provider: "voyage", model: "voyage-4-lite", status: "error", errorKind: "network", errorMessage: "fetch failed", inputTokens: 0, outputTokens: 0, createdAt: hoursAgo(20) },
    // 7d only
    { ...base, feature: "embedding", provider: "voyage", model: "voyage-4-lite", createdAt: hoursAgo(72) },
    // Older than 7 days: excluded everywhere
    { ...base, feature: "profile", status: "error", errorKind: "auth", createdAt: hoursAgo(24 * 10) },
  ]);
});

afterAll(async () => {
  if (!userId) return;
  await db.delete(aiUsage).where(eq(aiUsage.userId, userId));
  await db.delete(users).where(eq(users.id, userId));
});

describe("getAiHealthData", () => {
  it("counts each window correctly and excludes rows older than 7 days", async () => {
    const data = await getAiHealthData({ now: NOW, windowHours: 6 });
    const byKey = Object.fromEntries(
      data.rows.map((r) => [`${r.feature}/${r.status}/${r.errorKind ?? "-"}`, r])
    );

    expect(byKey["tagging/error/rate_limit"]).toMatchObject({ inAlertWindow: 1, last24h: 1, last7d: 1 });
    expect(byKey["embedding/error/network"]).toMatchObject({ inAlertWindow: 0, last24h: 1, last7d: 1 });
    expect(byKey["embedding/ok/-"]).toMatchObject({ inAlertWindow: 0, last24h: 0, last7d: 1 });
    expect(byKey["profile/error/auth"]).toBeUndefined();
  });

  it("the real rule alerts on the tagging error only (aborted and refusal don't count)", async () => {
    const data = await getAiHealthData({ now: NOW, windowHours: 6 });
    expect(evaluateAiHealth(data.rows, { minErrors: 1 })).toEqual({
      status: "alert",
      errorCount: 1,
      reasons: ["tagging: 1 × rate_limit"],
    });

    // A wider window picks up the 20h-old embedding error too.
    const wide = await getAiHealthData({ now: NOW, windowHours: 24 });
    expect(evaluateAiHealth(wide.rows, { minErrors: 1 }).reasons).toEqual([
      "embedding: 1 × network",
      "tagging: 1 × rate_limit",
    ]);
  });

  it("summarizes per feature with aborted split out", async () => {
    const data = await getAiHealthData({ now: NOW, windowHours: 6 });
    const chat = summarizeByFeature(data.rows).find((f) => f.feature === "chat")!;
    expect(chat.last24h).toEqual({ ok: 0, error: 0, refusal: 1, aborted: 1 });
  });

  it("lists the latest errors within 7 days, newest first", async () => {
    const data = await getAiHealthData({ now: NOW, windowHours: 6 });
    expect(data.recentErrors.map((e) => [e.feature, e.errorKind])).toEqual([
      ["tagging", "rate_limit"],
      ["chat", "aborted"],
      ["embedding", "network"],
    ]);
    expect(data.recentErrors[0].errorMessage).toBe("429 slow down");
  });
});
