// ============================================================================
// REGENERATE TAGS / BULK RETAG — INTEGRATION TEST
// ============================================================================
//
// regenerateTags() (one record, owner only) and retagUntaggedRecords() (admin,
// all untagged records) both run tagRecord(). Real Postgres; the session,
// admin gate, LLM, image analysis, embedding and next/cache are mocked.

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq, inArray } from "drizzle-orm";

import { db } from "@/db";
import { records, recordTags, tags, users } from "@/db/schema";

const mocks = vi.hoisted(() => ({
  sessionUserId: null as string | null,
  generateTags: vi.fn<
    (content: string, type: string, onOutcome?: unknown) => Promise<string[]>
  >(async () => []),
  analyzeImage: vi.fn(async (): Promise<string | null> => null),
  embedRecord: vi.fn(async () => {}),
}));

vi.mock("@/lib/auth/session", () => ({
  getSession: vi.fn(async () =>
    mocks.sessionUserId ? { userId: mocks.sessionUserId } : null,
  ),
}));
vi.mock("@/lib/auth/admin", () => ({
  requireAdmin: vi.fn(async () => ({ id: mocks.sessionUserId, email: "admin@example.com" })),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/ai", () => ({
  getLLMProvider: vi.fn(async () => ({ generateTags: mocks.generateTags })),
}));
vi.mock("@/lib/ai/analyze-image", () => ({ analyzeImage: mocks.analyzeImage }));
vi.mock("@/lib/ai/embed-record", () => ({ embedRecord: mocks.embedRecord }));
vi.mock("@/lib/ai/usage", () => ({ logAiOutcome: vi.fn() }));

import { regenerateTags } from "@/lib/actions/tags";
import { retagUntaggedRecords } from "@/lib/actions/admin/maintenance";

// Unique per run so tag names never collide with other suites' data.
const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const tagName = (base: string) => `${base}-${suffix}`;

let userAId: string;
let userBId: string;

async function seed(
  userId: string,
  values: Partial<typeof records.$inferInsert> = {},
): Promise<string> {
  const [row] = await db
    .insert(records)
    .values({ userId, type: "note", content: "Pasta with garlic", ...values })
    .returning({ id: records.id });
  return row.id;
}

async function tagNamesFor(recordId: string): Promise<string[]> {
  const rows = await db
    .select({ name: tags.name })
    .from(recordTags)
    .innerJoin(tags, eq(recordTags.tagId, tags.id))
    .where(eq(recordTags.recordId, recordId));
  return rows.map((r) => r.name).sort();
}

beforeAll(async () => {
  const [a] = await db
    .insert(users)
    .values({ email: `retag-a-${suffix}@example.com`, passwordHash: "x" })
    .returning({ id: users.id });
  const [b] = await db
    .insert(users)
    .values({ email: `retag-b-${suffix}@example.com`, passwordHash: "x" })
    .returning({ id: users.id });
  userAId = a.id;
  userBId = b.id;
});

beforeEach(() => {
  mocks.sessionUserId = userAId;
  mocks.generateTags.mockReset().mockResolvedValue([]);
  mocks.analyzeImage.mockReset().mockResolvedValue(null);
  mocks.embedRecord.mockClear();
});

afterAll(async () => {
  // record_tags doesn't cascade from records, so unlink first.
  const ourRecords = db
    .select({ id: records.id })
    .from(records)
    .where(inArray(records.userId, [userAId, userBId]));
  await db.delete(recordTags).where(inArray(recordTags.recordId, ourRecords));
  await db.delete(records).where(inArray(records.userId, [userAId, userBId]));
  await db.delete(users).where(inArray(users.id, [userAId, userBId]));
  const ours = (await db.select({ id: tags.id, name: tags.name }).from(tags))
    .filter((t) => t.name.endsWith(suffix))
    .map((t) => t.id);
  if (ours.length > 0) await db.delete(tags).where(inArray(tags.id, ours));
});

describe("regenerateTags (integration)", () => {
  it("adds normalized, deduped AI tags from the record's content", async () => {
    const id = await seed(userAId);
    mocks.generateTags.mockResolvedValue([
      tagName("Pasta"),
      tagName("pasta"),
      ` ${tagName("garlic")} `,
    ]);

    const result = await regenerateTags(id);

    expect(result).toEqual({
      success: true,
      tags: [tagName("pasta"), tagName("garlic")],
    });
    expect(mocks.generateTags).toHaveBeenCalledWith(
      "Pasta with garlic",
      "note",
      expect.any(Function),
    );
    expect(await tagNamesFor(id)).toEqual(
      [tagName("garlic"), tagName("pasta")].sort(),
    );
    const [garlic] = await db.select().from(tags).where(eq(tags.name, tagName("garlic")));
    expect(garlic.isAi).toBe(true);
  });

  it("keeps existing tags and doesn't fail on ones already linked", async () => {
    const id = await seed(userAId);
    mocks.generateTags.mockResolvedValue([tagName("keep")]);
    await regenerateTags(id);
    mocks.generateTags.mockResolvedValue([tagName("keep"), tagName("new")]);

    const result = await regenerateTags(id);

    expect(result.success).toBe(true);
    expect(await tagNamesFor(id)).toEqual([tagName("keep"), tagName("new")].sort());
  });

  it("reports a failure when the LLM returns no tags", async () => {
    const id = await seed(userAId);

    const result = await regenerateTags(id);

    expect(result.success).toBe(false);
    expect(await tagNamesFor(id)).toEqual([]);
  });

  it("refuses another user's record without calling the LLM", async () => {
    const id = await seed(userBId);
    mocks.generateTags.mockResolvedValue([tagName("nope")]);

    const result = await regenerateTags(id);

    expect(result).toEqual({ success: false, error: "Record not found" });
    expect(mocks.generateTags).not.toHaveBeenCalled();
  });

  it("returns an error for a malformed id instead of throwing", async () => {
    const result = await regenerateTags("not-a-uuid");
    expect(result.success).toBe(false);
  });

  it("analyses a placeholder image first, saves the description and re-embeds", async () => {
    const id = await seed(userAId, {
      type: "image",
      content: "Image",
      imagePath: "/uploads/x.jpg",
    });
    mocks.analyzeImage.mockResolvedValue("A red bicycle by a river");
    mocks.generateTags.mockResolvedValue([tagName("bicycle")]);

    const result = await regenerateTags(id);

    expect(result.success).toBe(true);
    expect(mocks.analyzeImage).toHaveBeenCalledWith("/uploads/x.jpg", userAId);
    expect(mocks.generateTags).toHaveBeenCalledWith(
      "A red bicycle by a river",
      "image",
      expect.any(Function),
    );
    expect(mocks.embedRecord).toHaveBeenCalledWith(id);
    const [row] = await db.select().from(records).where(eq(records.id, id));
    expect(row.content).toBe("A red bicycle by a river");
  });

  it("doesn't tag a placeholder image when analysis fails again", async () => {
    const id = await seed(userAId, {
      type: "image",
      content: "Image",
      imagePath: "/uploads/x.jpg",
    });

    const result = await regenerateTags(id);

    expect(result.success).toBe(false);
    expect(mocks.generateTags).not.toHaveBeenCalled();
    const [row] = await db.select().from(records).where(eq(records.id, id));
    expect(row.content).toBe("Image");
  });

  it("tags an image from a user-typed description without re-analysing", async () => {
    const id = await seed(userAId, {
      type: "image",
      content: "My dog at the beach",
      imagePath: "/uploads/x.jpg",
    });
    mocks.generateTags.mockResolvedValue([tagName("dog")]);

    const result = await regenerateTags(id);

    expect(result.success).toBe(true);
    expect(mocks.analyzeImage).not.toHaveBeenCalled();
  });
});

describe("retagUntaggedRecords (integration)", () => {
  it("tags untagged records across users and reports the ones that failed", async () => {
    // Newest first, so these two are in the first batch.
    const ok = await seed(userBId, { content: "Bulk ok" });
    const bad = await seed(userAId, { content: "Bulk bad" });
    mocks.generateTags.mockImplementation(async (content) =>
      content === "Bulk ok" ? [tagName("bulk")] : [],
    );

    const result = await retagUntaggedRecords();

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(await tagNamesFor(ok)).toEqual([tagName("bulk")]);
    expect(result.failedIds).toContain(bad);
    expect(result.remaining).toBeGreaterThanOrEqual(1);

    // Skipping the failure moves the next batch past it.
    mocks.generateTags.mockClear();
    const next = await retagUntaggedRecords(result.failedIds);
    expect(next.success).toBe(true);
    const contents = mocks.generateTags.mock.calls.map((c) => c[0]);
    expect(contents).not.toContain("Bulk bad");
  });

  it("rejects malformed skip ids", async () => {
    const result = await retagUntaggedRecords(["not-a-uuid"]);
    expect(result).toEqual({ success: false, error: "Invalid request" });
  });
});
