// ============================================================================
// SEARCH — INTEGRATION TEST
// ============================================================================
//
// Exercises searchRecords() against a REAL Postgres + pgvector, because the
// thing most likely to silently break lives in SQL: the pgvector cosine
// distance (<=>), the full-text ts_rank / to_tsvector match, the IN-clause
// hydration, and the Reciprocal Rank Fusion that merges the two. Mocks are
// limited to the two boundaries we don't want in an integration test:
//
//   - @/lib/auth/session — so we don't need a real request/cookie context
//     (next/headers throws outside one), and can pin the "current user".
//   - @/lib/ai — so the query embedding is deterministic and offline (no
//     Voyage API key, no network, same vector every run).
//
// The database itself is real, so the ranking and — critically — the
// per-user authorization scoping are verified for real.
//
// A key behavior this pins down (learned from reading search.ts): semantic
// search returns EVERY embedded record for the user, ranked by distance, with
// no similarity threshold. So a record with a NULL embedding is what makes a
// result "keyword-only" — the isNotNull(embedding) filter excludes it from the
// semantic side. The fixtures below lean on that to hit each matchType branch.

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq, inArray } from "drizzle-orm";

import { db } from "@/db";
import { records, users } from "@/db/schema";

// ---- Mutable state the hoisted mocks read (vi.hoisted runs before imports) --
const mockState = vi.hoisted(() => ({
  sessionUserId: null as string | null,
  queryVector: [] as number[],
  embedThrows: false,
}));

vi.mock("@/lib/auth/session", () => ({
  getSession: vi.fn(async () =>
    mockState.sessionUserId ? { userId: mockState.sessionUserId } : null,
  ),
}));

vi.mock("@/lib/ai", () => ({
  getEmbeddingProvider: vi.fn(async () => ({
    embed: vi.fn(async () => {
      // Simulate the embedding provider being down (Voyage error, etc.).
      if (mockState.embedThrows) throw new Error("embedding provider down");
      return mockState.queryVector;
    }),
    embedBatch: vi.fn(async (texts: string[]) =>
      texts.map(() => mockState.queryVector),
    ),
  })),
}));

// Imported AFTER the mocks are registered so search.ts binds to them.
import { searchRecords } from "@/lib/actions/search";

// ---- Deterministic embeddings ----------------------------------------------
// One-hot 1024-dim vectors (matching the schema's vector dimension). Two vectors
// at the same position are identical (cosine distance 0); different positions
// are orthogonal (cosine distance 1). This gives us total control over semantic
// rank without any real model.
const DIMS = 1024;
function oneHot(pos: number): number[] {
  const v = new Array(DIMS).fill(0);
  v[pos] = 1;
  return v;
}

// ---- Fixtures --------------------------------------------------------------
let userAId: string; // the searcher
let userBId: string; // a different user — must never see A's results and vice versa

type SeedRecord = {
  content: string;
  title?: string;
  embedding?: number[] | null; // omit/null → excluded from semantic search
};

async function seed(userId: string, rows: SeedRecord[]): Promise<string[]> {
  const ids: string[] = [];
  for (const r of rows) {
    const [inserted] = await db
      .insert(records)
      .values({
        userId,
        type: "note",
        title: r.title ?? null,
        content: r.content,
        embedding: r.embedding ?? null,
        embeddingModel: r.embedding ? "test-model" : null,
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
    .values({ email: `search-a-${suffix}@example.com`, passwordHash: "x" })
    .returning({ id: users.id });
  const [b] = await db
    .insert(users)
    .values({ email: `search-b-${suffix}@example.com`, passwordHash: "x" })
    .returning({ id: users.id });
  userAId = a.id;
  userBId = b.id;
});

beforeEach(async () => {
  // Clean slate for each test; each seeds exactly the records it needs.
  await db.delete(records).where(inArray(records.userId, [userAId, userBId]));
  mockState.sessionUserId = userAId;
  mockState.embedThrows = false;
  mockState.queryVector = oneHot(1);
});

afterAll(async () => {
  // Guard against a failed beforeAll (undefined ids) so cleanup can't throw a
  // confusing secondary error that masks the real setup failure.
  const ids = [userAId, userBId].filter(Boolean);
  if (ids.length === 0) return;
  await db.delete(records).where(inArray(records.userId, ids));
  for (const id of ids) {
    await db.delete(users).where(eq(users.id, id));
  }
});

describe("searchRecords (integration)", () => {
  it("returns [] for a blank query without touching the DB or embedder", async () => {
    await seed(userAId, [{ content: "PostgreSQL indexing notes" }]);
    expect(await searchRecords("   ")).toEqual([]);
  });

  it("finds a record by exact keyword even with no embedding (keyword-only)", async () => {
    // NULL embedding → excluded from semantic search → pure keyword match.
    await seed(userAId, [
      { content: "Tuning PostgreSQL for analytics workloads", embedding: null },
      { content: "A completely unrelated note about tomatoes", embedding: null },
    ]);

    const results = await searchRecords("PostgreSQL");

    expect(results).toHaveLength(1);
    expect(results[0].content).toContain("PostgreSQL");
    expect(results[0].matchType).toBe("keyword");
  });

  it("finds a record by embedding proximity when keywords don't match (semantic-only)", async () => {
    // Content shares no words with the query, but its embedding equals the
    // query vector, so only semantic search can surface it.
    mockState.queryVector = oneHot(1);
    await seed(userAId, [
      { content: "Reflections on stoic philosophy and daily habits", embedding: oneHot(1) },
    ]);

    const results = await searchRecords("database performance");

    expect(results).toHaveLength(1);
    expect(results[0].matchType).toBe("semantic");
  });

  it("ranks a both-methods match above single-method matches and labels it 'both'", async () => {
    mockState.queryVector = oneHot(1);
    const [bothId, semId, kwId] = await seed(userAId, [
      // keyword ('PostgreSQL') AND closest embedding → matchType "both"
      { content: "PostgreSQL replication guide", embedding: oneHot(1) },
      // no keyword match, farther embedding → semantic-only
      { content: "Notes on tomato gardening", embedding: oneHot(2) },
      // keyword match, NULL embedding → keyword-only
      { content: "PostgreSQL vacuum settings", embedding: null },
    ]);

    const results = await searchRecords("PostgreSQL");
    const byId = new Map(results.map((r) => [r.id, r]));

    // The record found by BOTH methods should rank first and be labeled "both".
    expect(results[0].id).toBe(bothId);
    expect(byId.get(bothId)?.matchType).toBe("both");
    expect(byId.get(semId)?.matchType).toBe("semantic");
    expect(byId.get(kwId)?.matchType).toBe("keyword");
    // Scores are strictly descending (RRF fusion produced a real ordering).
    for (let i = 1; i < results.length; i++) {
      expect(results[i - 1].score).toBeGreaterThanOrEqual(results[i].score);
    }
  });

  it("never returns another user's records (authorization scoping)", async () => {
    mockState.queryVector = oneHot(1);
    // User B owns a record that matches BOTH the keyword and the query vector —
    // the strongest possible match. It must still never appear for user A.
    const [bSecretId] = await seed(userBId, [
      { content: "PostgreSQL SECRET credentials for user B", embedding: oneHot(1) },
    ]);
    const [aOwnId] = await seed(userAId, [
      { content: "PostgreSQL notes owned by user A", embedding: oneHot(1) },
    ]);

    const results = await searchRecords("PostgreSQL");
    const ids = results.map((r) => r.id);

    expect(ids).toContain(aOwnId);
    expect(ids).not.toContain(bSecretId);
    expect(results.every((r) => !r.content.includes("SECRET"))).toBe(true);
  });

  it("falls back to keyword search when the embedding provider fails", async () => {
    mockState.embedThrows = true; // semantic side throws → caught → []
    await seed(userAId, [
      { content: "PostgreSQL failover runbook", embedding: oneHot(1) },
    ]);

    const results = await searchRecords("PostgreSQL");

    expect(results).toHaveLength(1);
    // Semantic returned nothing, so the surviving match is keyword-only.
    expect(results[0].matchType).toBe("keyword");
  });

  it("caps results at 15", async () => {
    // 20 keyword-matching records; RRF slices the final list to 15.
    const rows: SeedRecord[] = Array.from({ length: 20 }, (_, i) => ({
      content: `PostgreSQL note number ${i}`,
      embedding: null,
    }));
    await seed(userAId, rows);

    const results = await searchRecords("PostgreSQL");

    expect(results.length).toBeLessThanOrEqual(15);
  });
});
