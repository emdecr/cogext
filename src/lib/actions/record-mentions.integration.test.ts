// ============================================================================
// RECORD MENTIONS + RELATED DE-DUPE — INTEGRATION TEST
// ============================================================================
//
// getRecordMentions() finds "Mentioned in" backlinks with an ILIKE scan of
// content/note, and getRelatedRecords() must leave out anything already shown
// in Connections or "Mentioned in". Both live in SQL, so this runs against a
// real Postgres + pgvector. Only the session (and the AI module that
// records.ts imports) are mocked.

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq, inArray, or } from "drizzle-orm";

import { db } from "@/db";
import { recordLinks, records, users } from "@/db/schema";

const mockState = vi.hoisted(() => ({ sessionUserId: null as string | null }));

vi.mock("@/lib/auth/session", () => ({
  getSession: vi.fn(async () =>
    mockState.sessionUserId ? { userId: mockState.sessionUserId } : null,
  ),
}));
vi.mock("@/lib/ai", () => ({}));
vi.mock("@/lib/ai/embed-record", () => ({ embedRecord: vi.fn() }));
vi.mock("@/lib/ai/analyze-image", () => ({ analyzeImage: vi.fn() }));

import { getRecordMentions } from "@/lib/actions/record-mentions";
import { getRelatedRecords } from "@/lib/actions/records";

// Every seeded embedding is the same vector, so every record is a perfect
// (similarity 1) neighbor of every other — Related would return all of them
// unless something excludes them.
const DIMS = 1024;
const SAME_VECTOR = Array.from({ length: DIMS }, (_, i) => (i === 0 ? 1 : 0));

let userAId: string;
let userBId: string;

async function seed(
  userId: string,
  r: { title: string; content?: string; note?: string | null },
): Promise<string> {
  const [inserted] = await db
    .insert(records)
    .values({
      userId,
      type: "note",
      title: r.title,
      content: r.content ?? "",
      note: r.note ?? null,
      embedding: SAME_VECTOR,
      embeddingModel: "test-model",
    })
    .returning({ id: records.id });
  return inserted.id;
}

const ref = (id: string, label = "Target") => `[${label}](/records/${id} "book")`;

async function cleanup(ids: string[]) {
  const owned = db
    .select({ id: records.id })
    .from(records)
    .where(inArray(records.userId, ids));
  await db
    .delete(recordLinks)
    .where(
      or(inArray(recordLinks.recordId, owned), inArray(recordLinks.relatedRecordId, owned)),
    );
  await db.delete(records).where(inArray(records.userId, ids));
}

beforeAll(async () => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const [a] = await db
    .insert(users)
    .values({ email: `mentions-a-${suffix}@example.com`, passwordHash: "x" })
    .returning({ id: users.id });
  const [b] = await db
    .insert(users)
    .values({ email: `mentions-b-${suffix}@example.com`, passwordHash: "x" })
    .returning({ id: users.id });
  userAId = a.id;
  userBId = b.id;
});

beforeEach(async () => {
  await cleanup([userAId, userBId]);
  mockState.sessionUserId = userAId;
});

afterAll(async () => {
  const ids = [userAId, userBId].filter(Boolean);
  if (ids.length === 0) return;
  await cleanup(ids);
  for (const id of ids) {
    await db.delete(users).where(eq(users.id, id));
  }
});

describe("getRecordMentions (integration)", () => {
  it("finds records that ref this one in content or note", async () => {
    const target = await seed(userAId, { title: "Target" });
    await seed(userAId, { title: "In content", content: `See ${ref(target)}.` });
    await seed(userAId, { title: "In note", note: `cf. ${ref(target)}` });
    // Hand-typed, uppercase id, no type title — still a ref.
    await seed(userAId, {
      title: "Hand typed",
      content: `[x](/records/${target.toUpperCase()})`,
    });
    await seed(userAId, { title: "Unrelated", content: "no refs here" });

    const titles = (await getRecordMentions(target)).map((r) => r.title).sort();
    expect(titles).toEqual(["Hand typed", "In content", "In note"]);
  });

  it("excludes self-refs and other users' records", async () => {
    const target = await seed(userAId, { title: "Target" });
    await db
      .update(records)
      .set({ content: `I am ${ref(target)}` })
      .where(eq(records.id, target));
    await seed(userBId, { title: "Other user", content: ref(target) });

    expect(await getRecordMentions(target)).toEqual([]);
  });

  it("returns nothing for a non-uuid id", async () => {
    expect(await getRecordMentions("%")).toEqual([]);
  });
});

describe("getRelatedRecords de-dupe (integration)", () => {
  it("leaves out connections (either direction) and mentions", async () => {
    const target = await seed(userAId, { title: "Target" });
    const outgoing = await seed(userAId, { title: "Connected from target" });
    const incoming = await seed(userAId, { title: "Connected to target" });
    await seed(userAId, { title: "Mentions target", note: ref(target) });
    await seed(userAId, { title: "Just related" });

    await db.insert(recordLinks).values([
      { userId: userAId, recordId: target, relatedRecordId: outgoing },
      { userId: userAId, recordId: incoming, relatedRecordId: target },
    ]);

    const titles = (await getRelatedRecords(target)).map((r) => r.title);
    expect(titles).toEqual(["Just related"]);
  });
});
