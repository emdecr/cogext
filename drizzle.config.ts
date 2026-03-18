// ============================================================================
// DRIZZLE KIT CONFIGURATION
// ============================================================================
//
// This config is used by `drizzle-kit` (the CLI tool), NOT by your app at
// runtime. It tells drizzle-kit two things:
//   1. Where your schema file is (so it knows what tables should exist)
//   2. How to connect to the database (so it can apply migrations)
//
// Common commands:
//   npx drizzle-kit generate  — reads your schema, compares to existing
//                                migrations, generates a new SQL migration
//                                file for any changes
//   npx drizzle-kit migrate   — runs all pending migration files against
//                                the database
//   npx drizzle-kit studio    — opens a browser-based GUI to browse your
//                                data (like a lightweight pgAdmin)

import "dotenv/config";
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  // Path to the schema file we just created.
  schema: "./src/db/schema.ts",

  // Where drizzle-kit should output generated migration SQL files.
  // Each migration gets its own folder with a .sql file inside.
  out: "./drizzle",

  // Which SQL dialect to use. We're on Postgres.
  dialect: "postgresql",

  // Connection details for drizzle-kit to talk to the database.
  // This uses the same DATABASE_URL env var, but drizzle-kit doesn't
  // auto-load .env.local like Next.js does. We load it explicitly here.
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
