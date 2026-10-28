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

// Record refs (plans/2026-10-28-inline-record-links.md): `/records/<uuid>`
// links become recordRef chip nodes and must serialize back byte-identical.
describe("record refs round-trip", () => {
  const id = "3f2a9c1e-1b2c-4d5e-8f90-123456789abc";

  function docJson(markdown: string) {
    const editor = new Editor({ extensions: richTextExtensions, content: markdown });
    const json = editor.getJSON();
    editor.destroy();
    return json;
  }

  it("parses a record link into a recordRef node", () => {
    const json = docJson(`See [The Dispossessed](/records/${id} "book").`);
    expect(json.content?.[0].content?.[1]).toEqual({
      type: "recordRef",
      attrs: { id, label: "The Dispossessed", type: "book" },
    });
  });

  it("preserves a record link with its type", () => {
    const md = `See [The Dispossessed](/records/${id} "book") today.`;
    expect(roundTrip(md)).toBe(md);
  });

  it("preserves a hand-typed record link without a type", () => {
    const md = `See [my note](/records/${id}).`;
    expect(roundTrip(md)).toBe(md);
  });

  it("preserves brackets in the label", () => {
    const md = `[A \\[bracketed\\] title](/records/${id} "book")`;
    expect(roundTrip(md)).toBe(md);
  });

  it("keeps other links as ordinary links alongside a record ref", () => {
    const md = `[Book](/records/${id} "book") and [site](https://example.com)`;
    expect(roundTrip(md)).toBe(md);
    const nodes = docJson(md).content?.[0].content ?? [];
    expect(nodes.map((n) => n.type)).toEqual(["recordRef", "text", "text"]);
    expect(nodes[2].marks?.[0].type).toBe("link");
  });

  it("leaves non-uuid /records links as ordinary links", () => {
    const nodes = docJson("[x](/records/not-a-uuid)").content?.[0].content ?? [];
    expect(nodes[0].type).toBe("text");
    expect(nodes[0].marks?.[0].type).toBe("link");
  });

  it("ignores an unknown type in the link title", () => {
    const json = docJson(`[x](/records/${id} "spaceship")`);
    expect(json.content?.[0].content?.[0]).toMatchObject({ attrs: { type: null } });
    expect(roundTrip(`[x](/records/${id} "spaceship")`)).toBe(`[x](/records/${id})`);
  });
});
