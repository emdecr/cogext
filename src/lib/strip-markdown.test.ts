// ============================================================================
// UNIT TESTS — stripMarkdown
// ============================================================================
//
// stripMarkdown backs card/search previews, so its job is narrow: reduce a
// markdown string to a clean single line of plain text without leaking syntax.
// These tests lock that behavior down (it's a preview-only stripper, not a
// full parser — we test the syntax we actually author, not every edge case).
// ============================================================================

import { describe, it, expect } from "vitest";
import { stripMarkdown } from "@/lib/strip-markdown";

describe("stripMarkdown", () => {
  it("strips heading markers", () => {
    expect(stripMarkdown("## A heading")).toBe("A heading");
    expect(stripMarkdown("###### deep")).toBe("deep");
  });

  it("unwraps bold, italic, and strikethrough", () => {
    expect(stripMarkdown("some **bold** text")).toBe("some bold text");
    expect(stripMarkdown("some *italic* text")).toBe("some italic text");
    expect(stripMarkdown("some _italic_ text")).toBe("some italic text");
    expect(stripMarkdown("some ~~struck~~ text")).toBe("some struck text");
  });

  it("reduces links to their text and images to their alt", () => {
    expect(stripMarkdown("see [the docs](https://example.com)")).toBe(
      "see the docs",
    );
    expect(stripMarkdown("![a cat](https://example.com/cat.png)")).toBe("a cat");
  });

  it("strips list markers (bulleted and numbered)", () => {
    expect(stripMarkdown("- one\n- two")).toBe("one two");
    expect(stripMarkdown("1. first\n2. second")).toBe("first second");
    expect(stripMarkdown("* star")).toBe("star");
  });

  it("strips blockquotes and horizontal rules", () => {
    expect(stripMarkdown("> quoted line")).toBe("quoted line");
    expect(stripMarkdown("before\n\n---\n\nafter")).toBe("before after");
  });

  it("unwraps inline code and fenced code blocks", () => {
    expect(stripMarkdown("run `npm test` now")).toBe("run npm test now");
    expect(stripMarkdown("```\nconst x = 1;\n```")).toBe("const x = 1;");
  });

  it("collapses whitespace to a single line", () => {
    expect(stripMarkdown("line one\n\n\nline two")).toBe("line one line two");
    expect(stripMarkdown("  padded   spacing  ")).toBe("padded spacing");
  });

  it("passes plain text through unchanged (aside from trimming)", () => {
    expect(stripMarkdown("just a normal sentence.")).toBe(
      "just a normal sentence.",
    );
  });

  it("handles a realistic mixed document", () => {
    const md = "## A heading\n\nSome **bold** and *italic* prose, plus a [link](https://example.com).\n\n- point one\n- point two";
    expect(stripMarkdown(md)).toBe(
      "A heading Some bold and italic prose, plus a link. point one point two",
    );
  });

  it("returns an empty string for empty input", () => {
    expect(stripMarkdown("")).toBe("");
    expect(stripMarkdown("   \n  ")).toBe("");
  });
});
