// ============================================================================
// REFLECTION CONTENT (Client Component)
// ============================================================================
//
// Renders reflection markdown as formatted HTML using react-markdown.
// This is a separate client component because react-markdown needs
// the browser's DOM — it can't run in a server component.
//
// We use the same `prose` styling approach as the chat messages in
// chat-thread.tsx. Tailwind Typography's prose class provides sensible
// defaults for all the HTML elements that markdown produces (headings,
// lists, paragraphs, code blocks, blockquotes, etc.).
//
// The prose-lg variant gives slightly larger text for comfortable reading,
// since reflections are longer-form content compared to chat messages.
// ============================================================================

"use client";

import Markdown from "react-markdown";

type Props = {
  content: string;
};

export default function ReflectionContent({ content }: Props) {
  return (
    <div
      className="
        prose prose-gray dark:prose-invert
        max-w-none
        prose-headings:font-semibold
        prose-headings:text-gray-900 dark:prose-headings:text-gray-100
        prose-p:leading-relaxed
        prose-p:text-gray-700 dark:prose-p:text-gray-300
        prose-li:text-gray-700 dark:prose-li:text-gray-300
        prose-strong:text-gray-900 dark:prose-strong:text-gray-100
        prose-blockquote:border-violet-300 dark:prose-blockquote:border-violet-700
        prose-blockquote:text-gray-600 dark:prose-blockquote:text-gray-400
        [&>*:first-child]:mt-0 [&>*:last-child]:mb-0
      "
    >
      <Markdown>{content}</Markdown>
    </div>
  );
}
