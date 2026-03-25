// ============================================================================
// VITEST CONFIGURATION
// ============================================================================
//
// Vitest is our test runner — it finds test files, runs them, and reports
// results. This config tells it:
//   - How to handle React/JSX (via the React plugin)
//   - How to simulate a browser environment (via jsdom)
//   - Where to find tests and how to resolve imports
//
// Run tests:
//   npx vitest          — runs in watch mode (re-runs on file changes)
//   npx vitest run      — runs once and exits (for CI)
//   npx vitest run --coverage  — runs with code coverage report

import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  // The React plugin teaches Vitest how to handle JSX/TSX.
  // Without it, Vitest would choke on any file containing <Component />.
  plugins: [react()],

  test: {
    // "jsdom" simulates a browser DOM in Node.js. This means our component
    // tests can call document.querySelector, render React components, and
    // fire click events — all without opening a real browser.
    //
    // Alternative: "happy-dom" (faster but less complete). jsdom is the
    // safer choice — it handles more edge cases.
    environment: "jsdom",

    // This file runs BEFORE each test file. We use it to set up global
    // test utilities (like the jest-dom matchers). See below.
    setupFiles: ["./src/test/setup.ts"],

    // Where Vitest looks for test files. These patterns mean:
    //   - Any file ending in .test.ts or .test.tsx
    //   - Inside the src/ directory (not in node_modules, not in drizzle/, etc.)
    include: ["src/**/*.test.{ts,tsx}"],

    // IMPORTANT: exclude integration tests from this config.
    // Integration tests (*.integration.test.ts) require a real database and
    // are run separately via `npm run test:integration` using
    // vitest.integration.config.ts. Without this exclude, they'd be picked
    // up by the unit test runner and fail (no DB available).
    //
    // Why does this need explicit exclusion?
    // "some.integration.test.ts" ends in ".test.ts", so the include pattern
    // above would match it. The exclude takes precedence.
    exclude: ["src/**/*.integration.test.ts", "node_modules/**"],

    // Enable global test functions (describe, it, expect) without importing
    // them in every test file. Matches the Jest convention most devs expect.
    globals: true,
  },

  resolve: {
    alias: {
      // Match the path alias from tsconfig.json so imports like
      // `@/db` work in test files the same way they do in app code.
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
