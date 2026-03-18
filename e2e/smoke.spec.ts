// ============================================================================
// E2E SMOKE TEST
// ============================================================================
//
// Same idea as the Vitest smoke test — just verifies the E2E infrastructure
// works. Playwright will:
//   1. Start the Next.js dev server (configured in playwright.config.ts)
//   2. Launch a real Chromium browser
//   3. Navigate to the app
//   4. Check that it loaded
//
// We'll replace this with real user flow tests once we build auth and
// the record creation flow.

import { test, expect } from "@playwright/test";

test("app loads", async ({ page }) => {
  // Navigate to the home page.
  // The baseURL ("http://localhost:3000") is set in playwright.config.ts,
  // so "/" resolves to "http://localhost:3000/".
  await page.goto("/");

  // Verify the page loaded by checking for a visible element.
  // The default Next.js page has "Next.js" in a heading —
  // we just need SOMETHING to confirm the page rendered.
  // Update this selector once we build our own home page.
  await expect(page).toHaveTitle(/./);
});
