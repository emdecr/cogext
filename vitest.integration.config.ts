// ============================================================================
// VITEST INTEGRATION TEST CONFIGURATION
// ============================================================================
//
// A separate config for integration tests — tests that run against a real
// database and require real infrastructure (PostgreSQL + pgvector).
//
// Key differences from vitest.config.ts (unit tests):
//
//   environment: "node"
//     Integration tests run server-side code — no DOM needed.
//     Using "node" avoids the overhead of spinning up jsdom.
//
//   include: "*.integration.test.ts"
//     Separate file naming convention makes it clear which tests require
//     infrastructure vs which are self-contained.
//
//   testTimeout: 30000
//     Integration tests hit a real database. 2s (the default) is too tight
//     when PostgreSQL is starting or under load. 30s gives breathing room.
//
//   setupFiles: ["./src/test/setup.integration.ts"]
//     A different setup file that connects to the test database and runs
//     migrations before the test suite starts. (Create this when you write
//     your first integration test.)
//
// How to run:
//   npm run test:integration
//   (which calls: vitest run --config vitest.integration.config.ts)
//
// Prerequisites:
//   - PostgreSQL must be running with the test database available
//   - Set DATABASE_URL in your environment or .env.test file
//   - Recommended: use a separate DB name, e.g. "cogext_test"
//     so integration tests never touch your dev data
// ============================================================================

import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  // No React plugin needed — integration tests are pure server-side code.
  // (If you ever need to test a server component with integration-level
  // dependencies, add the plugin then.)

  test: {
    // Node environment — no browser simulation needed
    environment: "node",

    // Pick up only integration test files
    include: ["src/**/*.integration.test.ts"],

    // Generous timeout for database operations
    testTimeout: 30_000,

    // Global test functions without imports (describe, it, expect)
    globals: true,

    // NOTE: When you write your first integration test, create
    // src/test/setup.integration.ts to handle DB setup/teardown:
    //
    //   import { runMigrations } from "@/db"
    //   beforeAll(async () => { await runMigrations() })
    //   afterAll(async () => { await db.$client.end() })
    //
    // Then uncomment this line:
    // setupFiles: ["./src/test/setup.integration.ts"],
  },

  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
