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
  isShelfType,
  SHELF_META,
  SHELF_STATUSES,
  SHELF_TYPES,
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
      "movie",
      "show",
      "music",
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

  // ---- Shelf fields (book, movie, show, music) ----

  it("accepts a book record with rating, status, and date finished", () => {
    const result = createRecordSchema.safeParse({
      type: "book",
      content: "A great read",
      title: "Sum",
      sourceAuthor: "David Eagleman",
      rating: 4.5,
      shelfStatus: "done",
      dateFinished: "2009-02-07",
    });

    expect(result.success).toBe(true);
  });

  it("accepts a movie record with a release year", () => {
    const result = createRecordSchema.safeParse({
      type: "movie",
      content: "Dune",
      title: "Dune",
      sourceAuthor: "Denis Villeneuve",
      rating: 4,
      shelfStatus: "done",
      dateFinished: "2021-10-22",
      releaseYear: 2021,
    });

    expect(result.success).toBe(true);
  });

  it("accepts a music record with an owned status", () => {
    const result = createRecordSchema.safeParse({
      type: "music",
      content: "In Rainbows",
      sourceAuthor: "Radiohead",
      shelfStatus: "done",
      releaseYear: 2007,
    });

    expect(result.success).toBe(true);
  });

  it("trims a subtitle and rejects one over 500 characters", () => {
    const ok = createRecordSchema.safeParse({
      type: "book",
      content: "The Overstory",
      subtitle: "  A Novel  ",
    });
    expect(ok.success && ok.data.subtitle).toBe("A Novel");

    const tooLong = createRecordSchema.safeParse({
      type: "book",
      content: "The Overstory",
      subtitle: "x".repeat(501),
    });
    expect(tooLong.success).toBe(false);
  });

  it("accepts a show with an in-progress status", () => {
    const result = createRecordSchema.safeParse({
      type: "show",
      content: "Severance",
      shelfStatus: "in_progress",
    });

    expect(result.success).toBe(true);
  });

  it("rejects a non-integer or out-of-range release year", () => {
    for (const releaseYear of [2021.5, 0, 10000]) {
      const result = createRecordSchema.safeParse({
        type: "movie",
        content: "some content",
        releaseYear,
      });
      expect(result.success, `year ${releaseYear} should fail`).toBe(false);
      if (!result.success) {
        expect(result.error.flatten().fieldErrors.releaseYear).toBeDefined();
      }
    }
  });

  it("rejects the old book-only status values", () => {
    // The old book-only values; 0013 replaced them with want/in_progress/done.
    for (const shelfStatus of ["want_to_read", "reading", "read"]) {
      const result = createRecordSchema.safeParse({
        type: "book",
        content: "some content",
        shelfStatus,
      });
      expect(result.success, `"${shelfStatus}" should fail`).toBe(false);
    }
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

  it("rejects an invalid shelf status", () => {
    const result = createRecordSchema.safeParse({
      type: "book",
      content: "some content",
      shelfStatus: "on-hold",
    });

    expect(result.success).toBe(false);
  });

  it("accepts an empty string for dateFinished (unfilled form field)", () => {
    const result = createRecordSchema.safeParse({
      type: "book",
      content: "some content",
      dateFinished: "",
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

  it("accepts long-form content up to the length cap", () => {
    const result = createRecordSchema.safeParse({
      type: "note",
      content: "a".repeat(100_000),
    });

    expect(result.success).toBe(true);
  });

  it("rejects content that exceeds the length cap", () => {
    const result = createRecordSchema.safeParse({
      type: "note",
      content: "a".repeat(100_001),
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.content).toContain(
        "Content is too long",
      );
    }
  });

  it("rejects a note that exceeds the length cap", () => {
    const result = createRecordSchema.safeParse({
      type: "note",
      content: "ok",
      note: "a".repeat(100_001),
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.note).toContain(
        "Note is too long",
      );
    }
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

// ============================================================================
// Shelf helpers
// ============================================================================

describe("shelf types", () => {
  it("treats book, movie, show and music as shelf types and nothing else", () => {
    expect(SHELF_TYPES).toEqual(["book", "movie", "show", "music"]);
    for (const t of ["book", "movie", "show", "music"]) expect(isShelfType(t)).toBe(true);
    for (const t of ["note", "quote", "link", "image", "article", "", null, undefined]) {
      expect(isShelfType(t)).toBe(false);
    }
  });

  it("has a label for every status on every shelf type", () => {
    for (const type of SHELF_TYPES) {
      for (const status of SHELF_STATUSES) {
        expect(SHELF_META[type].statusLabels[status], `${type}/${status}`).toBeTruthy();
      }
    }
  });

  it("words the shelf per medium", () => {
    expect(SHELF_META.book.statusLabels.want).toBe("Want to read");
    expect(SHELF_META.movie.statusLabels.want).toBe("Want to watch");
    expect(SHELF_META.movie.creatorLabel).toBe("Director");
    expect(SHELF_META.show.creatorLabel).toBe("Creator");
    expect(SHELF_META.movie.imageLabel).toBe("Poster");
    expect(SHELF_META.music.statusLabels).toEqual({
      want: "Want to own",
      in_progress: "On order",
      done: "Owned",
    });
    expect(SHELF_META.music.creatorLabel).toBe("Artist");
    expect(SHELF_META.music.imageLabel).toBe("Cover");
  });

  it("offers a subtitle on books only", () => {
    expect(SHELF_TYPES.filter((t) => SHELF_META[t].hasSubtitle)).toEqual(["book"]);
  });
});
