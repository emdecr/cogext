// ============================================================================
// REFLECTION CONTENT (Client Component)
// ============================================================================
//
// Renders two different kinds of content that live on the same reflection row:
//   1. The reflection body itself (markdown prose)
//   2. Structured recommendations (cards / list items)
//
// We keep those render paths separate on purpose.
//
// Why not just append the recommendations into the markdown string?
//   Because recommendations are structured data with stable fields:
//     - media type
//     - title
//     - creator
//     - optional year
//     - reason
//
// Rendering them as structured UI means:
//   - the layout stays consistent
//   - the code doesn't depend on Claude formatting HTML-like markdown
//   - future features (save, dismiss, filtering) can hook into real fields
// ============================================================================

"use client";

import Markdown from "react-markdown";
import type { Recommendation } from "@/lib/ai/recommendations";

type Props = {
  content: string;
  recommendations: Recommendation[];
};

// Small visual labels for each recommendation type. We use plain text symbols
// instead of emoji so the UI feels consistent with the app's calm tone.
const TYPE_META: Record<Recommendation["type"], { icon: string; label: string }> =
  {
    book: { icon: "[B]", label: "Book" },
    film: { icon: "[F]", label: "Film" },
    show: { icon: "[S]", label: "Show" },
    essay: { icon: "[E]", label: "Essay" },
    podcast: { icon: "[P]", label: "Podcast" },
    article: { icon: "[A]", label: "Article" },
  };

export default function ReflectionContent({
  content,
  recommendations,
}: Props) {
  return (
    <div className="space-y-10">
      {/* ---- Reflection markdown ----
          Tailwind Typography handles the long-form prose nicely. */}
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

      {/* ---- Recommendations ----
          Omit the section entirely when no recommendations exist. This keeps
          older reflections and fallback cases visually clean. */}
      {recommendations.length > 0 ? (
        <section
          aria-labelledby="recommendations-heading"
          className="border-t border-gray-100 pt-8 dark:border-gray-800"
        >
          <div className="mb-5">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-violet-600 dark:text-violet-400">
              Recommended Next
            </p>
            <h2
              id="recommendations-heading"
              className="mt-2 text-lg font-semibold text-gray-900 dark:text-gray-100"
            >
              Media paths that echo this week&apos;s themes
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-600 dark:text-gray-400">
              These recommendations are generated from the reflection itself, so
              they feel like natural continuations of the week rather than a
              generic popularity feed.
            </p>
          </div>

          <div className="space-y-4">
            {recommendations.map((recommendation, index) => {
              const meta = TYPE_META[recommendation.type];

              return (
                <article
                  key={`${recommendation.type}-${recommendation.title}-${index}`}
                  className="rounded-xl border border-gray-200 bg-gray-50/70 p-4 dark:border-gray-800 dark:bg-gray-950/60"
                >
                  <div className="flex items-start gap-4">
                    <div className="mt-0.5 min-w-0 rounded-md border border-violet-200 bg-violet-50 px-2 py-1 text-xs font-semibold uppercase tracking-wide text-violet-700 dark:border-violet-900 dark:bg-violet-950/60 dark:text-violet-300">
                      <span aria-hidden="true">{meta.icon}</span> {meta.label}
                    </div>

                    <div className="min-w-0 flex-1">
                      <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">
                        {recommendation.title}
                      </h3>

                      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                        {recommendation.creator}
                        {recommendation.year ? ` • ${recommendation.year}` : ""}
                      </p>

                      <p className="mt-3 text-sm leading-6 text-gray-700 dark:text-gray-300">
                        {recommendation.reason}
                      </p>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      ) : null}
    </div>
  );
}
