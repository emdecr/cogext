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

  // Automatically start your dev server before running tests.
  // This means you don't need to manually run `npm run dev` first —
  // Playwright handles it. It waits for the server to be ready,
  // then runs tests, then shuts it down.
  webServer: {
    // We use port 3100 to avoid collisions with other dev servers.
    // The --port flag pins Next.js to this exact port instead of
    // letting it pick a random one when 3000 is taken.
    command: "npm run dev -- --port 3100",
    url: "http://localhost:3100",
    // Reuse an already-running dev server if you have one open.
    // Saves time during development.
    reuseExistingServer: !process.env.CI,
  },
});
