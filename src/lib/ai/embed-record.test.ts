// ============================================================================
// UNIT TESTS — prepareTextForEmbedding
// ============================================================================
//
// prepareTextForEmbedding is a pure function — it takes a record object
// and returns a string. No database, no network, no side effects.
//
// These tests verify:
//   1. All text fields are included in the output (so search works correctly)
//   2. Fields are labeled with prefixes (so the model understands structure)
//   3. Optional fields are omitted gracefully when null/undefined
//   4. The output format is consistent (fields in the right order)
//
// Why does this matter?
//   The embedding of a record IS its search capability. If this function
//   drops a field, that field becomes unsearchable. If it includes garbage,
//   search quality degrades. It's worth protecting with tests.
//
// WHY ALL THE MOCKS?
//   embed-record.ts imports @/db and @/lib/ai at module level (top of file).
//   When Vitest imports embed-record.ts to get prepareTextForEmbedding, it
//   also executes those imports — which throw unless DATABASE_URL and
//   AI_BASE_URL are set.
//
//   We mock those modules so their side effects (env var checks, DB connections)
//   never run. The mock stubs are never CALLED by prepareTextForEmbedding —
//   they just need to exist so the import doesn't crash.
//
//   Lesson: even testing a pure function requires mocking if it lives in a
//   module with impure imports. This is one reason to prefer smaller modules
//   — a pure function in its own file needs zero mocks.
// ============================================================================

// Mock @/db so the database connection is never attempted
vi.mock("@/db", () => ({
  db: {
    query: { records: { findFirst: vi.fn() } },
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({ where: vi.fn() }),
    }),
  },
}));

// Mock @/db/schema so Drizzle table definitions don't try to load
vi.mock("@/db/schema", () => ({
  records: {},
}));

// Mock the embedding provider factory — never called by prepareTextForEmbedding
vi.mock("@/lib/ai", () => ({
  getEmbeddingProvider: vi.fn(),
}));

import { prepareTextForEmbedding } from "@/lib/ai/embed-record";

describe("prepareTextForEmbedding", () => {
  // ---- Core fields ----

  it("always includes the record type", () => {
    const text = prepareTextForEmbedding({
      type: "note",
      title: null,
      content: "Some content",
      sourceAuthor: null,
      note: null,
    });

    expect(text).toContain("Type: note");
  });

  it("always includes the content", () => {
    const text = prepareTextForEmbedding({
      type: "note",
      title: null,
      content: "My important content",
      sourceAuthor: null,
      note: null,
    });

    expect(text).toContain("Content: My important content");
  });

  // ---- Optional fields ----

  it("includes title when present", () => {
    const text = prepareTextForEmbedding({
      type: "quote",
      title: "Famous quote",
      content: "To be or not to be",
      sourceAuthor: null,
      note: null,
    });

    expect(text).toContain("Title: Famous quote");
  });

  it("omits title when null", () => {
    const text = prepareTextForEmbedding({
      type: "note",
      title: null,
      content: "Content without a title",
      sourceAuthor: null,
      note: null,
    });

    // The word "Title:" should not appear at all
    expect(text).not.toContain("Title:");
  });

  it("includes author when present", () => {
    const text = prepareTextForEmbedding({
      type: "quote",
      title: null,
      content: "All that glitters is not gold",
      sourceAuthor: "Shakespeare",
      note: null,
    });

    expect(text).toContain("Author: Shakespeare");
  });

  it("omits author when null", () => {
    const text = prepareTextForEmbedding({
      type: "note",
      title: null,
      content: "Anonymous content",
      sourceAuthor: null,
      note: null,
    });

    expect(text).not.toContain("Author:");
  });

  it("includes note when present", () => {
    const text = prepareTextForEmbedding({
      type: "article",
      title: "The article",
      content: "Article body",
      sourceAuthor: null,
      note: "My personal annotation",
    });

    expect(text).toContain("Note: My personal annotation");
  });

  it("omits note when null", () => {
    const text = prepareTextForEmbedding({
      type: "note",
      title: null,
      content: "Content",
      sourceAuthor: null,
      note: null,
    });

    expect(text).not.toContain("Note:");
  });

  // ---- A complete record ----

  it("combines all fields for a fully populated record", () => {
    const text = prepareTextForEmbedding({
      type: "article",
      title: "On Solitude",
      content: "The best thinking happens alone.",
      sourceAuthor: "Michel de Montaigne",
      note: "Referenced in Digital Minimalism",
    });

    // Every field should be present
    expect(text).toContain("Type: article");
    expect(text).toContain("Title: On Solitude");
    expect(text).toContain("Content: The best thinking happens alone.");
    expect(text).toContain("Author: Michel de Montaigne");
    expect(text).toContain("Note: Referenced in Digital Minimalism");
  });

  it("separates fields with newlines", () => {
    const text = prepareTextForEmbedding({
      type: "note",
      title: "My Note",
      content: "Content here",
      sourceAuthor: null,
      note: null,
    });

    // Fields should be on separate lines — the model uses line breaks
    // to understand the structure
    const lines = text.split("\n");
    expect(lines).toContain("Type: note");
    expect(lines).toContain("Title: My Note");
    expect(lines).toContain("Content: Content here");
  });

  // ---- AI-generated descriptions become rich search signals ----

  it("produces richer text for image records with AI descriptions", () => {
    // This is the key case from Phase 2: after analyzeImage() runs,
    // the content field is a detailed description instead of "Image".
    // prepareTextForEmbedding should include it without modification.
    const aiDescription =
      "A red bicycle leaning against a stone wall in a European alley. " +
      "Morning light, cobblestones, potted plants visible in background.";

    const text = prepareTextForEmbedding({
      type: "image",
      title: "Street scene",
      content: aiDescription,
      sourceAuthor: null,
      note: null,
    });

    expect(text).toContain(aiDescription);
    // The type prefix ensures semantic search knows this is an image
    expect(text).toContain("Type: image");
  });
});
