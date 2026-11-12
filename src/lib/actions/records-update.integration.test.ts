// ============================================================================
// UPDATE RECORD — INTEGRATION TEST
// ============================================================================
//
// updateRecord() writes the edit, then re-embeds in the background so edited
// text reaches semantic search. Runs against a real Postgres; the session, the
// AI modules and next/cache are mocked (revalidatePath needs a Next request).

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq, inArray } from "drizzle-orm";

import { db } from "@/db";
import { records, users } from "@/db/schema";

const mocks = vi.hoisted(() => ({
  sessionUserId: null as string | null,
  embedRecord: vi.fn(async () => {}),
}));

vi.mock("@/lib/auth/session", () => ({
  getSession: vi.fn(async () =>
    mocks.sessionUserId ? { userId: mocks.sessionUserId } : null,
  ),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/ai", () => ({}));
vi.mock("@/lib/ai/embed-record", () => ({ embedRecord: mocks.embedRecord }));
vi.mock("@/lib/ai/analyze-image", () => ({ analyzeImage: vi.fn() }));

import { updateRecord } from "@/lib/actions/records";

let userAId: string;
let userBId: string;

async function seedBook(userId: string): Promise<string> {
  const [inserted] = await db
    .insert(records)
    .values({ userId, type: "book", title: "Sapiens", content: "Sapiens" })
    .returning({ id: records.id });
  return inserted.id;
}

beforeAll(async () => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const [a] = await db
    .insert(users)
    .values({ email: `update-a-${suffix}@example.com`, passwordHash: "x" })
    .returning({ id: users.id });
  const [b] = await db
    .insert(users)
    .values({ email: `update-b-${suffix}@example.com`, passwordHash: "x" })
    .returning({ id: users.id });
  userAId = a.id;
  userBId = b.id;
});

beforeEach(() => {
  mocks.sessionUserId = userAId;
  mocks.embedRecord.mockClear();
});

afterAll(async () => {
  await db.delete(records).where(inArray(records.userId, [userAId, userBId]));
  await db.delete(users).where(inArray(users.id, [userAId, userBId]));
});

describe("updateRecord (integration)", () => {
  it("saves the subtitle and re-embeds the record", async () => {
    const id = await seedBook(userAId);

    const result = await updateRecord({
      id,
      type: "book",
      title: "Sapiens",
      content: "Sapiens",
      subtitle: "A Brief History of Humankind",
    });

    expect(result.success).toBe(true);
    const [row] = await db
      .select({ subtitle: records.subtitle })
      .from(records)
      .where(eq(records.id, id));
    expect(row.subtitle).toBe("A Brief History of Humankind");
    expect(mocks.embedRecord).toHaveBeenCalledExactlyOnceWith(id);
  });

  it("does not re-embed when the update fails", async () => {
    const othersRecord = await seedBook(userBId);

    const notFound = await updateRecord({
      id: othersRecord,
      type: "book",
      content: "Hijacked",
    });
    const invalid = await updateRecord({ id: "not-a-uuid", content: "x" });

    expect(notFound).toMatchObject({ success: false, error: "Record not found" });
    expect(invalid.success).toBe(false);
    expect(mocks.embedRecord).not.toHaveBeenCalled();
  });
});
