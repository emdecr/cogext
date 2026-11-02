// ============================================================================
// RECORD MENTIONS + RELATED DE-DUPE — INTEGRATION TEST
// ============================================================================
//
// getRecordMentions() finds backlinks with a regex scan of content/note,
// getOutgoingMentions() resolves the refs in this record's own text, and
// getRelatedRecords() must leave out anything already shown in Connections
// (links and mentions in either direction). Both live in SQL, so this runs against a
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

import {
  getOutgoingMentions,
  getRecordMentions,
} from "@/lib/actions/record-mentions";
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
    // Id followed by more id-like text is a different path, not a ref.
    await seed(userAId, {
      title: "Suffixed",
      content: `[x](/records/${target}-extra)`,
    });
    // Trailing path/query/hash still points at the target.
    await seed(userAId, {
      title: "With hash",
      content: `[x](/records/${target}#notes)`,
    });

    const titles = (await getRecordMentions(target)).map((r) => r.title).sort();
    expect(titles).toEqual(["Hand typed", "In content", "In note", "With hash"]);
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

describe("getOutgoingMentions (integration)", () => {
  it("resolves refs in content and note, in order, skipping missing and foreign ids", async () => {
    const first = await seed(userAId, { title: "First" });
    const second = await seed(userAId, { title: "Second" });
    const foreign = await seed(userBId, { title: "Foreign" });
    const missing = "00000000-0000-4000-8000-000000000000";
    const source = await seed(userAId, {
      title: "Source",
      content: `${ref(second, "2")} ${ref(missing)} ${ref(foreign)} ${ref(second, "again")}`,
      note: ref(first, "1"),
    });
    await db
      .update(records)
      .set({ note: `${ref(first, "1")} and me ${ref(source)}` })
      .where(eq(records.id, source));

    const titles = (await getOutgoingMentions(source)).map((r) => r.title);
    expect(titles).toEqual(["Second", "First"]);
  });

  it("returns nothing for another user's record", async () => {
    const target = await seed(userAId, { title: "Target" });
    const source = await seed(userBId, { title: "Other", content: ref(target) });
    expect(await getOutgoingMentions(source)).toEqual([]);
  });
});

describe("getRelatedRecords de-dupe (integration)", () => {
  it("leaves out connections and mentions (either direction)", async () => {
    const target = await seed(userAId, { title: "Target" });
    const outgoing = await seed(userAId, { title: "Connected from target" });
    const incoming = await seed(userAId, { title: "Connected to target" });
    await seed(userAId, { title: "Mentions target", note: ref(target) });
    const mentioned = await seed(userAId, { title: "Mentioned by target" });
    await seed(userAId, { title: "Just related" });
    await db
      .update(records)
      .set({ content: `See ${ref(mentioned)}` })
      .where(eq(records.id, target));

    await db.insert(recordLinks).values([
      { userId: userAId, recordId: target, relatedRecordId: outgoing },
      { userId: userAId, recordId: incoming, relatedRecordId: target },
    ]);

    const titles = (await getRelatedRecords(target)).map((r) => r.title);
    expect(titles).toEqual(["Just related"]);
  });
});
