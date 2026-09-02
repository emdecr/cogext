// ============================================================================
// E2E SMOKE TEST
// ============================================================================
//
// Verifies the E2E infrastructure works AND that the app's public auth surface
// behaves as designed: /login is the only real page an unauthenticated visitor
// can reach; every other path is redirected to /nothing-to-see-here (a playful
// dead-end) rather than to /login.
//
// Playwright will:
//   1. Start the Next.js dev server (configured in playwright.config.ts)
//   2. Launch a real Chromium browser
//   3. Drive the app like a real user
//
// These run unauthenticated (no session cookie), which is exactly the state we
// want to assert this behavior in.

import { test, expect } from "@playwright/test";

test("login page loads", async ({ page }) => {
  await page.goto("/login");
  await expect(page).toHaveTitle(/./);
  await expect(
    page.getByRole("heading", { name: /welcome back/i })
  ).toBeVisible();
});

test("root redirects to the dead-end when logged out", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/nothing-to-see-here$/);
  await expect(page.getByText("nothing to see here.")).toBeVisible();
});

test("an arbitrary path redirects to the dead-end when logged out", async ({
  page,
}) => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/nothing-to-see-here$/);
});
