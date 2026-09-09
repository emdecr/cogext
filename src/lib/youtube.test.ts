// ============================================================================
// UNIT TESTS — YouTube URL helpers
// ============================================================================
//
// Pure functions: given a URL string, return a video id (or null) and build an
// embed URL. No network, no DOM.
// ============================================================================

import { describe, it, expect } from "vitest";
import { getYouTubeVideoId, getYouTubeEmbedUrl } from "@/lib/youtube";

describe("getYouTubeVideoId", () => {
  it("extracts the id from a standard watch URL", () => {
    expect(getYouTubeVideoId("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe(
      "dQw4w9WgXcQ",
    );
  });

  it("extracts the id from a youtu.be short link", () => {
    expect(getYouTubeVideoId("https://youtu.be/dQw4w9WgXcQ")).toBe(
      "dQw4w9WgXcQ",
    );
  });

  it("handles extra query params on a watch URL", () => {
    expect(
      getYouTubeVideoId("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42s"),
    ).toBe("dQw4w9WgXcQ");
  });

  it("handles a timestamp on a youtu.be link", () => {
    expect(getYouTubeVideoId("https://youtu.be/dQw4w9WgXcQ?t=42")).toBe(
      "dQw4w9WgXcQ",
    );
  });

  it("handles shorts, embed, and live paths", () => {
    expect(getYouTubeVideoId("https://www.youtube.com/shorts/dQw4w9WgXcQ")).toBe(
      "dQw4w9WgXcQ",
    );
    expect(getYouTubeVideoId("https://www.youtube.com/embed/dQw4w9WgXcQ")).toBe(
      "dQw4w9WgXcQ",
    );
    expect(getYouTubeVideoId("https://www.youtube.com/live/dQw4w9WgXcQ")).toBe(
      "dQw4w9WgXcQ",
    );
  });

  it("handles m. and music. subdomains", () => {
    expect(getYouTubeVideoId("https://m.youtube.com/watch?v=dQw4w9WgXcQ")).toBe(
      "dQw4w9WgXcQ",
    );
  });

  it("returns null for non-YouTube URLs", () => {
    expect(getYouTubeVideoId("https://example.com/watch?v=dQw4w9WgXcQ")).toBe(
      null,
    );
    expect(getYouTubeVideoId("https://vimeo.com/123456")).toBe(null);
  });

  it("returns null for a YouTube URL without a valid id", () => {
    expect(getYouTubeVideoId("https://www.youtube.com/")).toBe(null);
    expect(getYouTubeVideoId("https://www.youtube.com/watch?v=too-short")).toBe(
      null,
    );
    expect(getYouTubeVideoId("https://www.youtube.com/results?q=cats")).toBe(
      null,
    );
  });

  it("does not match a lookalike host (evil-youtube.com)", () => {
    expect(
      getYouTubeVideoId("https://evil-youtube.com/watch?v=dQw4w9WgXcQ"),
    ).toBe(null);
  });

  it("returns null for garbage input", () => {
    expect(getYouTubeVideoId("not a url")).toBe(null);
    expect(getYouTubeVideoId("")).toBe(null);
  });
});

describe("getYouTubeEmbedUrl", () => {
  it("builds a privacy-enhanced nocookie embed URL", () => {
    expect(getYouTubeEmbedUrl("dQw4w9WgXcQ")).toBe(
      "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ",
    );
  });
});
