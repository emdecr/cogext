// ============================================================================
// RICH TEXT EXTENSIONS
// ============================================================================
//
// The Tiptap extension set shared by the editor (rich-text-editor.tsx) and its
// round-trip test. Kept in one place so the test exercises the EXACT config the
// UI uses — the markdown parse/serialize behavior can't drift out from under
// the test.
//
// StarterKit v3 bundles bold/italic/strike/code, headings, lists, blockquote,
// link, underline, and undo/redo, so the MVP toolbar needs nothing extra. The
// Markdown extension makes the editor parse markdown on input and serialize
// back to markdown; `html: false` keeps that output pure markdown (no embedded
// HTML), which is what keeps authored content safe to render.
// ============================================================================

import StarterKit from "@tiptap/starter-kit";
import { Markdown } from "tiptap-markdown";
import type { Extensions } from "@tiptap/core";

export const richTextExtensions: Extensions = [
  StarterKit,
  Markdown.configure({
    html: false,
    transformPastedText: true,
    transformCopiedText: true,
  }),
];
