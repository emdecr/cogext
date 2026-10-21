// ============================================================================
// INTEGRATION TEST — ai_usage outcome logging against real Postgres
// ============================================================================
//
// Covers what unit tests can't: the migration's enum values and column
// defaults actually accept these rows. One row per call outcome:
//   ok       — logAiUsage() default
//   refusal  — logAiUsage({ status: "refusal" }) keeps its billed tokens
//   error    — logAiFailure(): 0 tokens + classified kind + truncated message
// Also uses the new "embedding" feature and "voyage" provider enum values.
// ============================================================================

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import Anthropic from "@anthropic-ai/sdk";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { aiUsage, users } from "@/db/schema";
import { AiHttpError, AiInvalidResponseError, MAX_ERROR_MESSAGE_LENGTH } from "@/lib/ai/errors";
import { logAiFailure, logAiOutcome, logAiUsage } from "@/lib/ai/usage";

let userId: string | undefined;

beforeAll(async () => {
  const [u] = await db
    .insert(users)
    .values({ email: `ai-usage-${Date.now()}@example.com`, passwordHash: "x" })
    .returning({ id: users.id });
  userId = u.id;
});

afterAll(async () => {
  if (!userId) return;
  await db.delete(aiUsage).where(eq(aiUsage.userId, userId));
  await db.delete(users).where(eq(users.id, userId));
});

const rowsFor = () =>
  db
    .select()
    .from(aiUsage)
    .where(eq(aiUsage.userId, userId!))
    .orderBy(asc(aiUsage.createdAt));

describe("ai_usage outcome logging", () => {
  it("writes ok, refusal, and error rows with the right shape", async () => {
    await logAiUsage({
      userId: userId!,
      feature: "chat",
      provider: "claude",
      model: "claude-sonnet-5-5",
      usage: { inputTokens: 1200, outputTokens: 300 },
    });
    await logAiUsage({
      userId: userId!,
      feature: "recommendation",
      provider: "claude",
      model: "claude-haiku-5-5",
      usage: { inputTokens: 900, outputTokens: 12 },
      status: "refusal",
    });
    await logAiFailure({
      userId: userId!,
      feature: "embedding",
      provider: "voyage",
      model: "voyage-4-lite",
      error: new AiHttpError("voyage", 429, "Voyage AI API error (429): " + "y".repeat(1000)),
    });
    await logAiFailure({
      userId: userId!,
      feature: "tagging",
      provider: "claude",
      model: "claude-haiku-5-5",
      error: Anthropic.APIError.generate(
        401,
        { type: "error", error: { type: "authentication_error", message: "invalid x-api-key" } },
        undefined,
        new Headers()
      ),
    });

    const rows = await rowsFor();
    expect(rows.map((r) => [r.feature, r.status, r.errorKind])).toEqual([
      ["chat", "ok", null],
      ["recommendation", "refusal", null],
      ["embedding", "error", "rate_limit"],
      ["tagging", "error", "auth"],
    ]);

    const [ok, refusal, rateLimited, auth] = rows;
    expect(ok).toMatchObject({ inputTokens: 1200, outputTokens: 300, errorMessage: null });
    expect(refusal).toMatchObject({ inputTokens: 900, outputTokens: 12 }); // billed
    expect(rateLimited).toMatchObject({ provider: "voyage", inputTokens: 0, outputTokens: 0 });
    expect(rateLimited.errorMessage).toHaveLength(MAX_ERROR_MESSAGE_LENGTH);
    expect(auth.errorMessage).toMatch(/^401 /);
  });

  it("a row inserted without status defaults to ok (existing rows backfill the same way)", async () => {
    const [row] = await db
      .insert(aiUsage)
      .values({
        userId: userId!,
        feature: "profile",
        provider: "claude",
        model: "claude-sonnet-5-5",
        inputTokens: 1,
        outputTokens: 1,
      })
      .returning({ status: aiUsage.status });
    expect(row.status).toBe("ok");
  });

  it("logAiFailure never throws, even when the insert fails", async () => {
    // A user id with no users row violates the FK. The logger must swallow it.
    await expect(
      logAiFailure({
        userId: "00000000-0000-4000-8000-000000000000",
        feature: "chat",
        provider: "claude",
        model: "claude-sonnet-5-5",
        error: new Error("boom"),
      })
    ).resolves.toBeUndefined();
  });

  it("logAiOutcome writes provider outcomes, keeping billed usage on invalid_response", async () => {
    await logAiOutcome(
      { userId: userId!, feature: "embedding" },
      { status: "ok", provider: "voyage", model: "voyage-4-lite", usage: { inputTokens: 42, outputTokens: 0 } }
    );
    await logAiOutcome(
      { userId: userId!, feature: "tagging" },
      {
        status: "error",
        provider: "claude",
        model: "claude-haiku-5-5",
        error: new AiInvalidResponseError('no "tags" array'),
        usage: { inputTokens: 300, outputTokens: 20 },
      }
    );

    const rows = (await rowsFor()).slice(-2);
    expect(rows.map((r) => [r.feature, r.provider, r.status, r.errorKind, r.inputTokens])).toEqual([
      ["embedding", "voyage", "ok", null, 42],
      ["tagging", "claude", "error", "invalid_response", 300],
    ]);
  });
});
