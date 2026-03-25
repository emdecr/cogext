// ============================================================================
// TEST HELPERS — Factory functions for test data
// ============================================================================
//
// These factories create objects that match our database schema shapes.
// Use them in any test that needs a record or user — never hand-craft
// raw objects inline, because:
//
//   1. When the schema changes, you update ONE place (here), not every test
//   2. Tests communicate intent: createTestRecord({ type: "image" }) is
//      clearer than a sprawling object literal
//   3. Default values prevent "property is undefined" surprises in tests
//      that only care about one or two fields
//
// Usage:
//   const record = createTestRecord({ type: "quote", content: "Hello" })
//   const user   = createTestUser({ email: "alice@example.com" })
// ============================================================================

// ---- Record factory ----
// The `overrides` pattern: pass only the fields you care about.
// Everything else gets a sensible default.
export function createTestRecord(
  overrides: Partial<{
    id: string;
    userId: string;
    type: string;
    title: string | null;
    content: string;
    sourceUrl: string | null;
    sourceAuthor: string | null;
    note: string | null;
    imagePath: string | null;
    embedding: number[] | null;
    embeddingModel: string | null;
    createdAt: Date;
    updatedAt: Date;
  }> = {}
) {
  return {
    id: "test-record-id",
    userId: "test-user-id",
    type: "note",
    title: null,
    content: "Test content",
    sourceUrl: null,
    sourceAuthor: null,
    note: null,
    imagePath: null,
    embedding: null,
    embeddingModel: null,
    createdAt: new Date("2024-01-01"),
    updatedAt: new Date("2024-01-01"),
    // Spread last so caller's values win over defaults
    ...overrides,
  };
}

// ---- User factory ----
export function createTestUser(
  overrides: Partial<{
    id: string;
    email: string;
    passwordHash: string;
    createdAt: Date;
    updatedAt: Date;
  }> = {}
) {
  return {
    id: "test-user-id",
    email: "test@example.com",
    // A valid bcrypt hash for the password "TestPassword123!"
    // Pre-computed so tests don't have to wait for bcrypt to hash
    passwordHash: "$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewME6xdtTsOaqiqS",
    createdAt: new Date("2024-01-01"),
    updatedAt: new Date("2024-01-01"),
    ...overrides,
  };
}
