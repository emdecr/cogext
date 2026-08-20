// ============================================================================
// DATABASE INTEGRATION TEST
// ============================================================================
//
// Exercises the real database layer — the actual connection, the applied
// migrations, and the pgvector extension — rather than mocks. This is the
// first integration test; it establishes the pattern (real DB via
// setup.integration.ts) that data-mutating tests can build on later.
//
// It is deliberately READ-ONLY: it never inserts or updates rows, so it's safe
// to run against any DATABASE_URL (a throwaway DB is still recommended).
//
// What it guards against:
//   - Migrations that don't apply cleanly on a fresh database (setup would fail)
//   - The pgvector extension missing — vector columns/indexes would break
//   - The migrated schema drifting from what the app expects
//
// Runs only under `npm run test:integration` (the *.integration.test.ts suffix
// is excluded from the unit runner).

import { sql } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";

type Row = Record<string, unknown>;

describe("database integration", () => {
  it("connects and runs a query", async () => {
    const rows = (await db.execute(sql`SELECT 1 AS ok`)) as unknown as Row[];
    expect(Number(rows[0].ok)).toBe(1);
  });

  it("has the pgvector extension available", async () => {
    // Casting a literal to `vector` only succeeds if the extension is
    // installed by migration 0000. If pgvector were missing, this throws.
    const rows = (await db.execute(
      sql`SELECT '[1,2,3]'::vector AS v`
    )) as unknown as Row[];
    expect(rows[0].v).toBeDefined();
  });

  it("applied migrations for the core tables", async () => {
    const rows = (await db.execute(sql`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
    `)) as unknown as Row[];

    const tableNames = rows.map((r) => r.table_name);
    for (const expected of [
      "users",
      "records",
      "tags",
      "record_tags",
      "reflections",
    ]) {
      expect(tableNames).toContain(expected);
    }
  });

  it("can issue a typed ORM read against a migrated table", async () => {
    // limit(0) proves the ORM ↔ schema ↔ table wiring end to end without
    // depending on any seeded data.
    const rows = await db.select().from(users).limit(0);
    expect(Array.isArray(rows)).toBe(true);
  });
});
