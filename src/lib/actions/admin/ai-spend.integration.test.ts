// ============================================================================
// INTEGRATION TEST — getAiSpend() against real Postgres
// ============================================================================
//
// Unit tests cover the pricing math; this covers the SQL. It exists because
// the first version of the query passed every unit test and still failed in
// Postgres: the long-context threshold was a bound parameter, so SELECT and
// GROUP BY got $1 and $2 and Postgres rejected the grouping.
//
// getAiSpend() is instance-wide, so the test measures the DELTA its own rows
// add — it passes whether or not the database already has ai_usage rows.
// ============================================================================

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { aiUsage, users } from "@/db/schema";

vi.mock("@/lib/auth/admin", () => ({
  requireAdmin: vi.fn().mockResolvedValue({ id: "admin", email: "admin@example.com" }),
}));

import { getAiSpend } from "@/lib/actions/admin/ai-spend";

let userId: string | undefined;

beforeAll(async () => {
  const [u] = await db
    .insert(users)
    .values({ email: `ai-spend-${Date.now()}@example.com`, passwordHash: "x" })
    .returning({ id: users.id });
  userId = u.id;
});

afterAll(async () => {
  if (!userId) return;
  await db.delete(aiUsage).where(eq(aiUsage.userId, userId));
  await db.delete(users).where(eq(users.id, userId));
});

describe("getAiSpend", () => {
  it("groups by feature/model/long-context bucket and prices each bucket", async () => {
    const before = await getAiSpend("all");

    await db.insert(aiUsage).values([
      // Haiku 5.5, short prompts: $0.10 / $0.50 per Mtok
      { userId: userId!, feature: "tagging", provider: "claude", model: "claude-haiku-5-5", inputTokens: 50_000, outputTokens: 1_000 },
      { userId: userId!, feature: "tagging", provider: "claude", model: "claude-haiku-5-5", inputTokens: 50_000, outputTokens: 1_000 },
      // Haiku 5.5, one prompt over 100K: whole request at $0.50 / $2.50
      { userId: userId!, feature: "tagging", provider: "claude", model: "claude-haiku-5-5", inputTokens: 150_000, outputTokens: 1_000 },
      // Sonnet 5.5: $2 / $10
      { userId: userId!, feature: "chat", provider: "claude", model: "claude-sonnet-5-5", inputTokens: 1_000_000, outputTokens: 100_000 },
    ]);

    const after = await getAiSpend("all");

    // short bucket: 100K in, 2K out → 0.01 + 0.001; long: 0.075 + 0.0025
    const taggingUsd = 0.011 + 0.0775;
    const chatUsd = 2 + 1;

    expect(after.total.calls - before.total.calls).toBe(4);
    expect(after.total.usd - before.total.usd).toBeCloseTo(taggingUsd + chatUsd, 6);

    const tagBefore = before.byFeature.find((l) => l.key === "tagging")?.usd ?? 0;
    const tagAfter = after.byFeature.find((l) => l.key === "tagging")!.usd;
    expect(tagAfter - tagBefore).toBeCloseTo(taggingUsd, 6);
  });

  it("re-validates the window and defaults bad input to 30d", async () => {
    expect((await getAiSpend("<script>")).window).toBe("30d");
    expect((await getAiSpend(42)).window).toBe("30d");
    expect((await getAiSpend("7d")).window).toBe("7d");
  });
});
