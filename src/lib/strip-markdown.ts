// ============================================================================
// STRIP MARKDOWN
// ============================================================================
//
// Reduce a markdown string to plain text for truncated previews (card titles,
// content snippets, search results). Record content/notes are authored as
// markdown, so slicing the raw string would leak syntax like "## " or "**" into
// a preview. This is a lightweight, preview-only stripper — not a parser — so it
// favors being fast and predictable over handling every markdown edge case.
//
// Output is collapsed to a single line (whitespace runs → one space), which is
// what a one-line preview wants and makes character-count slicing behave.
// ============================================================================

export function stripMarkdown(md: string): string {
  return (
    md
      // Fenced code blocks: drop the fences, keep the code text.
      .replace(/```[\s\S]*?```/g, (block) => block.replace(/```/g, ""))
      // Images ![alt](url) → alt (do before links, same bracket shape).
      .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
      // Links [text](url) → text.
      .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
      // Heading markers, blockquote markers, list bullets/numbers at line start.
      .replace(/^\s{0,3}#{1,6}\s+/gm, "")
      .replace(/^\s{0,3}>\s?/gm, "")
      .replace(/^\s*([-*+]|\d+\.)\s+/gm, "")
      // Horizontal rules on their own line.
      .replace(/^\s*([-*_]\s*){3,}$/gm, "")
      // Emphasis: bold/italic/strikethrough wrappers, then inline code.
      .replace(/(\*\*|__)(.*?)\1/g, "$2")
      .replace(/(\*|_)(.*?)\1/g, "$2")
      .replace(/~~(.*?)~~/g, "$1")
      .replace(/`([^`]*)`/g, "$1")
      // Collapse all whitespace to single spaces for a clean one-line preview.
      .replace(/\s+/g, " ")
      .trim()
  );
}
