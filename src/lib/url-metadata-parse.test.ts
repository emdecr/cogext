// ============================================================================
// UNIT TESTS — URL metadata HTML parsing
// ============================================================================
//
// Pure parsing over HTML strings — no network. The fetch/SSRF half lives in
// the server action and isn't exercised here.
// ============================================================================

import { describe, it, expect } from "vitest";
import { parseHtmlMetadata } from "@/lib/url-metadata-parse";

describe("parseHtmlMetadata", () => {
  it("prefers og:title over <title>", () => {
    const html = `
      <head>
        <title>Fallback Title</title>
        <meta property="og:title" content="Open Graph Title" />
      </head>`;
    expect(parseHtmlMetadata(html).title).toBe("Open Graph Title");
  });

  it("falls back to <title> when no og:title", () => {
    const html = `<head><title>Just a Title</title></head>`;
    expect(parseHtmlMetadata(html).title).toBe("Just a Title");
  });

  it("reads og:description and the meta description", () => {
    expect(
      parseHtmlMetadata(
        `<meta property="og:description" content="OG desc">`,
      ).description,
    ).toBe("OG desc");
    expect(
      parseHtmlMetadata(
        `<meta name="description" content="Plain desc">`,
      ).description,
    ).toBe("Plain desc");
  });

  it("handles attribute order with content before property", () => {
    const html = `<meta content="Reversed" property="og:title">`;
    expect(parseHtmlMetadata(html).title).toBe("Reversed");
  });

  it("decodes HTML entities", () => {
    const html = `<title>Tom &amp; Jerry &#39;95 &quot;Classic&quot;</title>`;
    expect(parseHtmlMetadata(html).title).toBe(`Tom & Jerry '95 "Classic"`);
  });

  it("returns nulls when nothing is present", () => {
    expect(parseHtmlMetadata("<html><body>no head</body></html>")).toEqual({
      title: null,
      description: null,
    });
  });

  it("ignores an empty title/content value", () => {
    expect(parseHtmlMetadata(`<title></title>`).title).toBe(null);
  });
});
