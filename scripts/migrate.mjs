// =============================================================================
// DATABASE MIGRATION RUNNER
// =============================================================================
//
// This script runs all pending Drizzle migrations against the database.
// It's called by docker-entrypoint.sh before the app starts in production.
//
// Why plain .mjs (JavaScript) instead of TypeScript?
//   The production Docker image has no TypeScript tooling — it's a minimal
//   Node.js runtime. Plain ESM JavaScript runs directly with `node` and
//   has no compilation step. The `drizzle-orm` and `postgres` packages are
//   available in the standalone image's node_modules.
//
// How it works:
//   1. Reads DATABASE_URL from the environment
//   2. Opens a Postgres connection
//   3. Calls drizzle-orm's migrate() which reads the SQL files in ./drizzle/
//      and runs any that haven't been applied yet (tracked in __drizzle_migrations table)
//   4. Closes the connection and exits
//
// The migrate() function is idempotent — safe to run on every deploy.
// Already-applied migrations are skipped. Only new ones run.
//
// Usage:
//   node scripts/migrate.mjs          (dev, from project root)
//   node migrate.mjs                  (prod, from .next/standalone/)
// =============================================================================

import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import path from "path";
import { fileURLToPath } from "url";

// __dirname doesn't exist in ESM. This is the ESM equivalent.
// fileURLToPath converts "file:///app/migrate.mjs" → "/app/migrate.mjs"
// path.dirname then gives us "/app"
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Read and validate DATABASE_URL
// ---------------------------------------------------------------------------
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error("❌ DATABASE_URL is not set. Cannot run migrations.");
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Connect and migrate
// ---------------------------------------------------------------------------
console.log("🔄 Running database migrations...");

// max: 1 — migration runner only needs one connection.
// We close it explicitly when done.
const client = postgres(databaseUrl, { max: 1 });
const db = drizzle(client);

try {
  // migrate() reads all .sql files in the migrationsFolder and checks the
  // __drizzle_migrations table in your database to see which ones have
  // already been applied. It only runs new ones.
  //
  // migrationsFolder path: when this script runs from .next/standalone/
  // in production, the drizzle/ folder is copied there too (see Dockerfile).
  // So __dirname + "/drizzle" works in both dev and prod.
  await migrate(db, {
    migrationsFolder: path.join(__dirname, "drizzle"),
  });

  console.log("✅ Migrations complete.");
} catch (error) {
  console.error("❌ Migration failed:", error);
  // Exit with code 1 — signals failure to the entrypoint script.
  // docker-entrypoint.sh uses `set -e`, so it will stop before starting the app.
  process.exit(1);
} finally {
  // Always close the connection, even if migration failed.
  // Otherwise the process hangs waiting for the connection to close.
  await client.end();
}
