// ============================================================================
// SMOKE TEST
// ============================================================================
//
// A "smoke test" is the simplest possible test — it just verifies that the
// testing setup itself works. If this test passes, we know:
//   - Vitest is configured correctly
//   - The setup file loaded (jest-dom matchers are available)
//   - TypeScript compilation works in test files
//   - Global test functions (describe, it, expect) are available
//
// We'll delete this once we have real tests. It's scaffolding for the
// testing infrastructure, just like create-next-app is scaffolding for the app.

describe("testing setup", () => {
  it("works", () => {
    expect(true).toBe(true);
  });

  it("has jest-dom matchers available", () => {
    // Create a simple DOM element to test against.
    // In real component tests, React Testing Library creates these for us.
    const element = document.createElement("div");
    element.textContent = "hello";
    document.body.appendChild(element);

    // These matchers come from @testing-library/jest-dom.
    // If the setup file didn't load, these would throw
    // "toBeInTheDocument is not a function".
    expect(element).toBeInTheDocument();
    expect(element).toHaveTextContent("hello");

    // Clean up — remove the element we added so it doesn't leak
    // into other tests. Good habit, even though it doesn't matter here.
    document.body.removeChild(element);
  });
});
