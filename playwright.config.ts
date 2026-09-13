// ============================================================================
// PLAYWRIGHT CONFIGURATION
// ============================================================================
//
// Playwright runs E2E (end-to-end) tests in real browsers. Unlike Vitest
// (which simulates a DOM in Node.js), Playwright launches actual Chrome,
// Firefox, or Safari and clicks through your app like a real user.
//
// Run E2E tests:
//   npx playwright test              — run all E2E tests (headless)
//   npx playwright test --ui         — open the interactive test UI
//   npx playwright test --headed     — watch the browser as tests run
//   npx playwright show-report       — view the HTML test report

import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  // Where Playwright looks for test files.
  // We keep E2E tests separate from unit tests (which live in src/).
  // This makes it easy to run them independently.
  testDir: "./e2e",

  // Run test files in parallel for speed.
  fullyParallel: true,

  // Fail the whole suite if you accidentally left a `test.only` in the code.
  // Prevents false confidence from CI only running one test.
  forbidOnly: !!process.env.CI,

  // How many times to retry a failed test. Flaky tests are common in E2E
  // because they depend on timing (animations, network, etc.).
  // 0 retries locally (fail fast while developing), 2 in CI (be forgiving).
  retries: process.env.CI ? 2 : 0,

  // How many test files to run at once. In CI, limit parallelism to avoid
  // overwhelming the machine. Locally, let Playwright decide.
  workers: process.env.CI ? 1 : undefined,

  // Generate an HTML report after tests finish.
  // "on-failure" means it only auto-opens if something failed.
  reporter: [["html", { open: "on-failure" }]],

  // Shared settings for all tests.
  use: {
    // The URL of your running app. Playwright navigates here.
    // This must match the port Next.js runs on.
    baseURL: "http://localhost:3100",

    // Capture a screenshot and trace on failure — invaluable for debugging
    // why an E2E test broke, especially in CI where you can't watch it.
    screenshot: "only-on-failure",
    trace: "on-first-retry",
  },

  // Which browsers to test in. Each entry runs ALL your tests in that browser.
  // Start with just Chromium for speed. Uncomment others when you want
  // cross-browser coverage (usually closer to launch).
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    // Uncomment to test in more browsers:
    // {
    //   name: "firefox",
    //   use: { ...devices["Desktop Firefox"] },
    // },
    // {
    //   name: "webkit",
    //   use: { ...devices["Desktop Safari"] },
    // },
    // {
    //   name: "mobile-chrome",
    //   use: { ...devices["Pixel 5"] },
    // },
  ],

  // Start the app before running tests, then shut it down after.
  //
  // We test the PRODUCTION build (`next build` + `next start`), not `next dev`,
  // so E2E proves production behavior — RSC caching, minification, and
  // production-only config validation all differ from dev and are exactly what
  // a smoke test should catch.
  //
  // Note: next.config.ts sets `output: "standalone"` for the Docker image, so
  // `next start` prints a warning and serves the full `.next` production build
  // rather than the trimmed standalone bundle. That's fine here — it's still a
  // production server in production mode. The exact standalone artifact
  // (`node .next/standalone/server.js`) is what the Docker image runs, and its
  // correctness is covered by the Docker build job + the deploy health check.
  webServer: {
    // Port 3100 avoids collisions with a dev server on 3000.
    command: "npm run build && npm run start -- --port 3100",
    // Readiness probe MUST hit a path that returns 200. We use the liveness
    // endpoint (not "/") because the proxy redirects "/" when logged out —
    // Playwright treats a non-200 here as "server not ready" and would time
    // out. /api/health is excluded from the proxy and always 200s.
    url: "http://localhost:3100/api/health",
    // A cold `next build` is far slower than starting a dev server.
    timeout: 180_000,
    // Reuse an already-running server on 3100 during local iteration.
    reuseExistingServer: !process.env.CI,
    // `next build` + `next start` run in production mode, which enforces
    // config validation (src/lib/config.ts): JWT_SECRET must be >=32 chars and
    // not a known default, CRON_SECRET must be >=32, and the AI keys must be
    // present. Provide throwaway values here so local `npm run test:e2e` works
    // in prod mode without real secrets; CI passes its own via the job env
    // (which wins over these fallbacks). STORAGE_PROVIDER=local avoids the
    // MinIO-specific required vars — the smoke tests don't touch storage.
    env: {
      JWT_SECRET:
        process.env.JWT_SECRET || "e2e-jwt-secret-at-least-32-characters-long",
      CRON_SECRET:
        process.env.CRON_SECRET || "e2e-cron-secret-at-least-32-characters-long",
      STORAGE_PROVIDER: process.env.STORAGE_PROVIDER || "local",
      VOYAGE_API_KEY: process.env.VOYAGE_API_KEY || "e2e-not-a-real-key",
      ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || "e2e-not-a-real-key",
    },
  },
});
