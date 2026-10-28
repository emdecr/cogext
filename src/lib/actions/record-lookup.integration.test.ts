// ============================================================================
// RECORD LOOKUP — INTEGRATION TEST
// ============================================================================
//
// Exercises lookupRecords() (the editor's `[[` picker) against a real Postgres:
// the ILIKE matching, LIKE-wildcard escaping, the books-first / title-prefix
// ordering, excludeId, and per-user scoping all live in SQL. Only the session
// is mocked (next/headers throws outside a request).

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq, inArray } from "drizzle-orm";

import { db } from "@/db";
import { records, users } from "@/db/schema";
import type { RecordType } from "@/lib/validations/records";

const mockState = vi.hoisted(() => ({ sessionUserId: null as string | null }));

vi.mock("@/lib/auth/session", () => ({
  getSession: vi.fn(async () =>
    mockState.sessionUserId ? { userId: mockState.sessionUserId } : null,
  ),
}));

import { lookupRecords } from "@/lib/actions/record-lookup";

let userAId: string;
let userBId: string;

type SeedRecord = {
  type?: RecordType;
  title?: string | null;
  content?: string;
  sourceAuthor?: string;
  createdAt?: Date;
};

async function seed(userId: string, rows: SeedRecord[]): Promise<string[]> {
  const ids: string[] = [];
  for (const r of rows) {
    const [inserted] = await db
      .insert(records)
      .values({
        userId,
        type: r.type ?? "note",
        title: r.title ?? null,
        content: r.content ?? "",
        sourceAuthor: r.sourceAuthor ?? null,
        ...(r.createdAt ? { createdAt: r.createdAt } : {}),
      })
      .returning({ id: records.id });
    ids.push(inserted.id);
  }
  return ids;
}

beforeAll(async () => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const [a] = await db
    .insert(users)
    .values({ email: `lookup-a-${suffix}@example.com`, passwordHash: "x" })
    .returning({ id: users.id });
  const [b] = await db
    .insert(users)
    .values({ email: `lookup-b-${suffix}@example.com`, passwordHash: "x" })
    .returning({ id: users.id });
  userAId = a.id;
  userBId = b.id;
});

beforeEach(async () => {
  await db.delete(records).where(inArray(records.userId, [userAId, userBId]));
  mockState.sessionUserId = userAId;
});

afterAll(async () => {
  const ids = [userAId, userBId].filter(Boolean);
  if (ids.length === 0) return;
  await db.delete(records).where(inArray(records.userId, ids));
  for (const id of ids) {
    await db.delete(users).where(eq(users.id, id));
  }
});

describe("lookupRecords (integration)", () => {
  it("matches title, author, and content case-insensitively", async () => {
    await seed(userAId, [
      { type: "book", title: "The Dispossessed", sourceAuthor: "Ursula K. Le Guin" },
      { title: "Groceries", content: "eggs, milk" },
      { content: "Thinking about anarchism and dispossession" },
    ]);

    expect((await lookupRecords("DISPOSS")).map((r) => r.label)).toEqual([
      "The Dispossessed",
      "Thinking about anarchism and dispossession",
    ]);
    expect((await lookupRecords("le guin")).map((r) => r.label)).toEqual([
      "The Dispossessed",
    ]);
  });

  it("ranks books first, then title prefix, then title substring", async () => {
    await seed(userAId, [
      { title: "A note on Dune" },
      { title: "Dune notes" },
      { type: "book", title: "Children of Dune" },
    ]);

    expect((await lookupRecords("dune")).map((r) => r.label)).toEqual([
      "Children of Dune",
      "Dune notes",
      "A note on Dune",
    ]);
  });

  it("returns most recent records (books first) for an empty query", async () => {
    await seed(userAId, [
      { title: "Old note", createdAt: new Date("2026-01-01") },
      { title: "New note", createdAt: new Date("2026-06-01") },
      { type: "book", title: "Some book", createdAt: new Date("2025-01-01") },
    ]);

    expect((await lookupRecords("  ")).map((r) => r.label)).toEqual([
      "Some book",
      "New note",
      "Old note",
    ]);
  });

  it("treats % and _ literally", async () => {
    await seed(userAId, [{ title: "100% sure" }, { title: "1000 things" }]);
    expect((await lookupRecords("100%")).map((r) => r.label)).toEqual(["100% sure"]);
  });

  it("excludes the record being edited", async () => {
    const [self] = await seed(userAId, [{ title: "Dune notes" }, { title: "Dune quotes" }]);
    const results = await lookupRecords("dune", { excludeId: self });
    expect(results.map((r) => r.label)).toEqual(["Dune quotes"]);
  });

  it("labels untitled records with a plain-text content excerpt", async () => {
    await seed(userAId, [{ content: `**Bold** start ${"word ".repeat(40)}` }]);
    const [result] = await lookupRecords("bold");
    expect(result.label.startsWith("Bold start word")).toBe(true);
    expect(result.label.endsWith("…")).toBe(true);
    expect(result.label.length).toBeLessThanOrEqual(80);
  });

  it("never returns another user's records", async () => {
    await seed(userBId, [{ type: "book", title: "Dune" }]);
    expect(await lookupRecords("dune")).toEqual([]);
  });
});
