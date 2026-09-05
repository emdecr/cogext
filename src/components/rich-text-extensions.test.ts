// ============================================================================
// UNIT TESTS — markdown round-trip
// ============================================================================
//
// The WYSIWYG editor's core promise is that markdown is the source of truth:
// markdown in → Tiptap doc → markdown out must be stable for the features we
// expose. These tests instantiate a headless editor with the SAME extension
// set the UI uses (richTextExtensions) and assert the round-trip is lossless
// for that feature set. A regression here would silently corrupt saved content.
// ============================================================================

import { describe, it, expect } from "vitest";
import { Editor } from "@tiptap/core";
import { richTextExtensions } from "@/components/rich-text-extensions";
import type { MarkdownStorage } from "tiptap-markdown";

// Create a detached editor, seed it with markdown, read markdown back out.
function roundTrip(markdown: string): string {
  const editor = new Editor({
    extensions: richTextExtensions,
    content: markdown,
  });
  const out = (
    editor.storage as unknown as { markdown: MarkdownStorage }
  ).markdown.getMarkdown();
  editor.destroy();
  return out;
}

describe("markdown round-trip through the editor extensions", () => {
  it("preserves bold and italic", () => {
    expect(roundTrip("Some **bold** and *italic* text.")).toBe(
      "Some **bold** and *italic* text.",
    );
  });

  it("preserves headings", () => {
    expect(roundTrip("## A heading")).toBe("## A heading");
  });

  it("preserves bullet lists", () => {
    expect(roundTrip("- one\n- two")).toBe("- one\n- two");
  });

  it("preserves ordered lists", () => {
    expect(roundTrip("1. first\n2. second")).toBe("1. first\n2. second");
  });

  it("preserves blockquotes", () => {
    expect(roundTrip("> a quoted line")).toBe("> a quoted line");
  });

  it("preserves links", () => {
    expect(roundTrip("see [the docs](https://example.com)")).toBe(
      "see [the docs](https://example.com)",
    );
  });

  it("preserves inline code", () => {
    expect(roundTrip("run `npm test`")).toBe("run `npm test`");
  });

  it("preserves a realistic mixed document", () => {
    const md =
      "## A heading\n\nSome **bold** and *italic* prose, plus a [link](https://example.com).\n\n- point one\n- point two";
    expect(roundTrip(md)).toBe(md);
  });

  it("leaves plain prose untouched", () => {
    expect(roundTrip("Just a normal sentence.")).toBe("Just a normal sentence.");
  });
});
