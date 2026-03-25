// ============================================================================
// UNIT TESTS — Record Validation Schemas
// ============================================================================
//
// These tests cover the Zod schemas in records.ts. Zod schemas are pure
// functions — they take input and return either a parsed value or errors.
// No database, no network, no mocking needed.
//
// WHY test validation schemas?
//   Schemas are the first line of defense against bad input. A bug here
//   means malformed data reaches the database. These tests are cheap
//   to write and catch regressions when schema rules change.
//
// Pattern used throughout:
//   schema.safeParse(input) — returns { success, data } or { success, error }
//   We use safeParse (not parse) so we can assert on errors without
//   try/catch blocks in every test.
// ============================================================================

import {
  createRecordSchema,
  updateRecordSchema,
  deleteRecordSchema,
} from "@/lib/validations/records";

// ============================================================================
// createRecordSchema
// ============================================================================

describe("createRecordSchema", () => {
  // ---- Valid inputs ----

  it("accepts a valid note record", () => {
    const result = createRecordSchema.safeParse({
      type: "note",
      content: "This is my note",
    });

    expect(result.success).toBe(true);
  });

  it("accepts all valid record types", () => {
    const types = ["image", "quote", "article", "link", "note"] as const;

    for (const type of types) {
      const result = createRecordSchema.safeParse({
        type,
        content: "some content",
      });
      // Use a custom message so if this fails, we know WHICH type broke
      expect(result.success, `type "${type}" should be valid`).toBe(true);
    }
  });

  it("accepts optional fields when provided", () => {
    const result = createRecordSchema.safeParse({
      type: "quote",
      content: "To be or not to be",
      title: "Hamlet soliloquy",
      sourceAuthor: "Shakespeare",
      note: "Famous opening line",
      sourceUrl: "https://example.com/hamlet",
      imagePath: undefined,
    });

    expect(result.success).toBe(true);
  });

  it("accepts a valid URL for sourceUrl", () => {
    const result = createRecordSchema.safeParse({
      type: "link",
      content: "Interesting article about design",
      sourceUrl: "https://example.com/article",
    });

    expect(result.success).toBe(true);
  });

  it("accepts an empty string for sourceUrl (unfilled form field)", () => {
    // The form sends "" when the URL field is left blank.
    // The schema allows this via .or(z.literal("")) and the server
    // action converts it to undefined before writing to the DB.
    const result = createRecordSchema.safeParse({
      type: "link",
      content: "Some content",
      sourceUrl: "",
    });

    expect(result.success).toBe(true);
  });

  it("trims whitespace from content before validating", () => {
    // "  " (only spaces) should fail after trimming — not be accepted as content
    const result = createRecordSchema.safeParse({
      type: "note",
      content: "   ",
    });

    expect(result.success).toBe(false);
  });

  // ---- Invalid inputs ----

  it("rejects when content is missing", () => {
    const result = createRecordSchema.safeParse({
      type: "note",
      // content intentionally omitted
    });

    expect(result.success).toBe(false);
  });

  it("rejects when content is empty string", () => {
    const result = createRecordSchema.safeParse({
      type: "note",
      content: "",
    });

    expect(result.success).toBe(false);

    // Verify the error message is what we expect users to see
    if (!result.success) {
      const contentError = result.error.flatten().fieldErrors.content;
      expect(contentError).toContain("Content is required");
    }
  });

  it("rejects an invalid record type", () => {
    const result = createRecordSchema.safeParse({
      type: "banana", // not in RECORD_TYPES
      content: "some content",
    });

    expect(result.success).toBe(false);

    // We verify an error exists for the `type` field without checking the
    // exact message string. Zod v4 changed how errorMap formats enum errors,
    // and tying tests to exact framework-generated strings is brittle.
    // What matters: the field is invalid AND there's a human-readable error.
    if (!result.success) {
      const typeError = result.error.flatten().fieldErrors.type;
      expect(typeError).toBeDefined();
      expect(typeError!.length).toBeGreaterThan(0);
    }
  });

  it("rejects a malformed URL for sourceUrl", () => {
    const result = createRecordSchema.safeParse({
      type: "link",
      content: "Some content",
      sourceUrl: "not-a-url", // missing protocol
    });

    expect(result.success).toBe(false);

    if (!result.success) {
      const urlError = result.error.flatten().fieldErrors.sourceUrl;
      expect(urlError).toContain("Please enter a valid URL");
    }
  });
});

// ============================================================================
// updateRecordSchema
// ============================================================================

describe("updateRecordSchema", () => {
  it("requires a valid UUID for id", () => {
    const result = updateRecordSchema.safeParse({
      id: "not-a-uuid",
      content: "updated content",
    });

    expect(result.success).toBe(false);

    if (!result.success) {
      const idError = result.error.flatten().fieldErrors.id;
      expect(idError).toContain("Invalid record ID");
    }
  });

  it("accepts a valid UUID and partial fields", () => {
    const result = updateRecordSchema.safeParse({
      id: "550e8400-e29b-41d4-a716-446655440000", // valid UUID v4
      title: "Updated title",
      // content is not required for partial updates
    });

    expect(result.success).toBe(true);
  });

  it("allows updating with only an id (no other fields)", () => {
    // updateRecordSchema.partial() makes all content fields optional
    const result = updateRecordSchema.safeParse({
      id: "550e8400-e29b-41d4-a716-446655440000",
    });

    expect(result.success).toBe(true);
  });
});

// ============================================================================
// deleteRecordSchema
// ============================================================================

describe("deleteRecordSchema", () => {
  it("accepts a valid UUID", () => {
    const result = deleteRecordSchema.safeParse({
      id: "550e8400-e29b-41d4-a716-446655440000",
    });

    expect(result.success).toBe(true);
  });

  it("rejects a missing id", () => {
    const result = deleteRecordSchema.safeParse({});

    expect(result.success).toBe(false);
  });

  it("rejects a non-UUID id", () => {
    const result = deleteRecordSchema.safeParse({
      id: "123",
    });

    expect(result.success).toBe(false);
  });
});
