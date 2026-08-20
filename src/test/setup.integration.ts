// ============================================================================
// INTEGRATION TEST SETUP
// ============================================================================
//
// Runs ONCE before the integration suite (wired via setupFiles in
// vitest.integration.config.ts). Unlike the unit setup, this talks to a REAL
// Postgres + pgvector instance.
//
//   beforeAll — applies all Drizzle migrations. migrate() is idempotent, so on
//               a fresh CI database it builds the whole schema, and on an
//               already-migrated DB it's a no-op.
//   afterAll  — closes the connection pool so Vitest can exit cleanly instead
//               of hanging on open sockets.
//
// DATABASE_URL must point at a throwaway database (CI uses an ephemeral
// Postgres service; locally, use a separate name like cogext_test — never your
// dev data). The migration step assumes it may freely apply the schema.
// ============================================================================

import path from "path";
import { beforeAll, afterAll } from "vitest";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { db } from "@/db";

// Generous timeout — a cold database applying every migration takes longer than
// Vitest's default hook timeout.
beforeAll(async () => {
  await migrate(db, {
    migrationsFolder: path.join(process.cwd(), "drizzle"),
  });
}, 60_000);

afterAll(async () => {
  await db.$client.end();
});
