// ============================================================================
// TEST SETUP FILE
// ============================================================================
//
// This file runs before EVERY test file. It's the place to set up global
// test utilities and configuration that all tests need.
//
// Right now it does one thing: imports jest-dom matchers. These give us
// readable assertions for DOM elements:
//
//   expect(element).toBeInTheDocument()     — does it exist in the DOM?
//   expect(element).toBeVisible()           — is it visible (not hidden)?
//   expect(element).toHaveTextContent("hi") — does it contain this text?
//   expect(button).toBeDisabled()           — is the button disabled?
//
// Without this import, we'd only have generic matchers like:
//   expect(element).not.toBeNull()          — less readable, less specific
//
// As the project grows, we might add more setup here:
//   - Mocking global APIs (like fetch)
//   - Resetting database state between tests
//   - Setting up test environment variables

import "@testing-library/jest-dom/vitest";
