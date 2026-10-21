// ============================================================================
// TEST SETUP FILE
// ============================================================================
//
// This file runs before EVERY test file. It's the place to set up global
// test utilities and configuration that all tests need.
//
// It does two things:
//
// 1. Imports jest-dom matchers. These give us readable assertions for DOM
//    elements:
//
//      expect(element).toBeInTheDocument()     — does it exist in the DOM?
//      expect(element).toBeVisible()           — is it visible (not hidden)?
//      expect(element).toHaveTextContent("hi") — does it contain this text?
//      expect(button).toBeDisabled()           — is the button disabled?
//
// 2. Sets placeholder values for the env vars src/lib/config.ts REQUIRES.
//    config.ts validates them the moment it's imported (fail fast at startup),
//    and it's now imported by any module that reads a model setting
//    (src/lib/ai/model-settings.ts). Without these, merely importing e.g.
//    analyze-image.ts in a unit test would throw "Missing required environment
//    variable". Fake values only — nothing here can reach a real service.
//
//    Only fills vars that are UNSET, so:
//      - config.test.ts still controls the env itself (it sets a full env and
//        deletes vars to test the "missing" errors, then restores).
//      - jwt.test.ts / proxy.test.ts set their own JWT_SECRET in a hoisted
//        block, which runs after this file and wins.

import "@testing-library/jest-dom/vitest";

const TEST_ENV_PLACEHOLDERS: Record<string, string> = {
  DATABASE_URL: "postgres://test:test@localhost:5432/test_placeholder",
  JWT_SECRET: "test-placeholder-jwt-secret-at-least-32-chars",
  VOYAGE_API_KEY: "test-placeholder-voyage-key",
  ANTHROPIC_API_KEY: "test-placeholder-anthropic-key",
};

for (const [name, value] of Object.entries(TEST_ENV_PLACEHOLDERS)) {
  if (!process.env[name]) process.env[name] = value;
}
