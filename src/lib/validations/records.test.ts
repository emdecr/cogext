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
    // "article" stays valid at the schema level even though it's retired from
    // the create UI — existing article records must still validate on edit.
    const types = [
      "image",
      "quote",
      "article",
      "link",
      "note",
      "book",
    ] as const;

    for (const type of types) {
      const result = createRecordSchema.safeParse({
        type,
        content: "some content",
        // Link records require a Source URL (see the link rule below); every
        // other type leaves it optional.
        sourceUrl: type === "link" ? "https://example.com" : undefined,
      });
      // Use a custom message so if this fails, we know WHICH type broke
      expect(result.success, `type "${type}" should be valid`).toBe(true);
    }
  });

  // ---- Book fields ----

  it("accepts a book record with rating, status, and date read", () => {
    const result = createRecordSchema.safeParse({
      type: "book",
      content: "A great read",
      title: "Sum",
      sourceAuthor: "David Eagleman",
      rating: 4.5,
      readingStatus: "read",
      dateRead: "2009-02-07",
    });

    expect(result.success).toBe(true);
  });

  it("rejects a rating above 5", () => {
    const result = createRecordSchema.safeParse({
      type: "book",
      content: "some content",
      rating: 6,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.rating).toBeDefined();
    }
  });

  it("rejects an invalid reading status", () => {
    const result = createRecordSchema.safeParse({
      type: "book",
      content: "some content",
      readingStatus: "on-hold",
    });

    expect(result.success).toBe(false);
  });

  it("accepts an empty string for dateRead (unfilled form field)", () => {
    const result = createRecordSchema.safeParse({
      type: "book",
      content: "some content",
      dateRead: "",
    });

    expect(result.success).toBe(true);
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
    // The form sends "" when the URL field is left blank. The schema allows
    // this via .or(z.literal("")) and the server action converts it to
    // undefined before writing to the DB. Uses a non-link type — links now
    // require a URL (see the link rule tests below).
    const result = createRecordSchema.safeParse({
      type: "quote",
      content: "Some content",
      sourceUrl: "",
    });

    expect(result.success).toBe(true);
  });

  // ---- Link requires a Source URL ----

  it("rejects a link record with no sourceUrl", () => {
    const result = createRecordSchema.safeParse({
      type: "link",
      content: "Some content",
      // sourceUrl omitted
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.sourceUrl).toContain(
        "Source URL is required for links",
      );
    }
  });

  it("rejects a link record with an empty/whitespace sourceUrl", () => {
    const result = createRecordSchema.safeParse({
      type: "link",
      content: "Some content",
      sourceUrl: "",
    });

    expect(result.success).toBe(false);
  });

  it("accepts a link record with a sourceUrl", () => {
    const result = createRecordSchema.safeParse({
      type: "link",
      content: "Some content",
      sourceUrl: "https://example.com",
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

  it("enforces the link sourceUrl rule when type is provided", () => {
    // The edit form sends `type` for links so clearing the URL is rejected.
    const result = updateRecordSchema.safeParse({
      id: "550e8400-e29b-41d4-a716-446655440000",
      type: "link",
      sourceUrl: "",
    });

    expect(result.success).toBe(false);
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
