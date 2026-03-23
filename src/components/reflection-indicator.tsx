// ============================================================================
// REFLECTION INDICATOR
// ============================================================================
//
// A popover in the dashboard header that shows unread AI reflections.
// Uses Radix Popover for accessible, unstyled popover behavior.
//
// Architecture:
//   - This is a CLIENT component (needs useState for popover, onClick handlers)
//   - The PARENT (dashboard page, a server component) fetches the data and
//     passes it as props. This means: no loading spinner, no client fetch.
//   - When a reflection is clicked, we call markReflectionAsRead() (a server
//     action) and navigate to the detail view.
//
// The notification dot uses a subtle CSS pulse animation to draw attention
// without being obnoxious. Think "calm notification" — you notice it when
// you look, but it doesn't scream at you.
// ============================================================================

"use client";

import { useRouter } from "next/navigation";
import * as Popover from "@radix-ui/react-popover";
import { markReflectionAsRead } from "@/lib/actions/reflections";
import type { ReflectionSummary } from "@/lib/actions/reflections";

type Props = {
  // Unread reflections to show in the dropdown.
  // Fetched on the server and passed in — no client-side loading needed.
  unreadReflections: ReflectionSummary[];
};

export default function ReflectionIndicator({ unreadReflections }: Props) {
  const router = useRouter();
  const hasUnread = unreadReflections.length > 0;

  // When a reflection is clicked:
  // 1. Mark it as read (server action — updates the database)
  // 2. Navigate to the detail page
  async function handleReflectionClick(id: string) {
    await markReflectionAsRead(id);
    router.push(`/reflections/${id}`);
  }

  // Format a date string like "2026-03-16" into "Mar 16"
  function formatDate(dateStr: string): string {
    const date = new Date(dateStr + "T00:00:00"); // Prevent timezone shift
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }

  return (
    <Popover.Root>
      {/* ---- Trigger: sparkle icon with optional notification dot ---- */}
      <Popover.Trigger asChild>
        <button
          className="relative rounded-md bg-gray-200 px-3 py-2 text-sm text-gray-700 hover:bg-gray-300 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
          title={
            hasUnread
              ? `${unreadReflections.length} new reflection${unreadReflections.length > 1 ? "s" : ""}`
              : "Weekly reflections"
          }
        >
          {/* Sparkle icon (inline SVG — matches the project's pattern) */}
          <svg
            className="h-4 w-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            {/* A 4-point sparkle shape */}
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 3v1.5M12 19.5V21M4.22 4.22l1.06 1.06M17.72 17.72l1.06 1.06M3 12h1.5M19.5 12H21M4.22 19.78l1.06-1.06M17.72 6.28l1.06-1.06"
            />
            <circle cx="12" cy="12" r="3" strokeWidth={2} />
          </svg>

          {/* Notification dot — only visible when there are unread reflections.
              Uses absolute positioning to sit in the top-right corner of the button.
              The animate-pulse gives it a gentle breathing effect. */}
          {hasUnread && (
            <span className="absolute -top-0.5 -right-0.5 flex h-2.5 w-2.5">
              {/* Ping animation — a ring that expands and fades out */}
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-violet-400 opacity-75" />
              {/* Solid dot on top of the ping */}
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-violet-500" />
            </span>
          )}
        </button>
      </Popover.Trigger>

      {/* ---- Popover content ---- */}
      <Popover.Portal>
        <Popover.Content
          // align="end" positions the popover's right edge against the trigger's right edge.
          // sideOffset adds spacing between the trigger and the popover.
          align="end"
          sideOffset={8}
          className="z-50 w-80 rounded-lg border border-gray-200 bg-white p-3 shadow-lg dark:border-gray-700 dark:bg-gray-900"
        >
          {/* Header */}
          <h3 className="mb-2 text-sm font-semibold text-gray-900 dark:text-gray-100">
            Reflections
          </h3>

          {hasUnread ? (
            <>
              {/* List of unread reflections */}
              <ul className="space-y-2">
                {unreadReflections.map((reflection) => (
                  <li key={reflection.id}>
                    <button
                      onClick={() => handleReflectionClick(reflection.id)}
                      className="w-full rounded-md p-2 text-left transition-colors hover:bg-gray-100 dark:hover:bg-gray-800"
                    >
                      {/* Period label, e.g. "Mar 10 – Mar 16" */}
                      <p className="text-xs font-medium text-violet-600 dark:text-violet-400">
                        {formatDate(reflection.periodStart)} –{" "}
                        {formatDate(reflection.periodEnd)}
                      </p>
                      {/* Preview text — first 200 chars of the reflection */}
                      <p className="mt-0.5 line-clamp-2 text-sm text-gray-600 dark:text-gray-400">
                        {reflection.preview}
                      </p>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            // Empty state — no unread reflections
            <p className="py-4 text-center text-sm text-gray-500 dark:text-gray-400">
              No new reflections
            </p>
          )}

          {/* "View all" link — always shown, takes you to the full archive */}
          <div className="mt-2 border-t border-gray-100 pt-2 dark:border-gray-800">
            <button
              onClick={() => router.push("/reflections")}
              className="w-full rounded-md p-1.5 text-center text-xs font-medium text-gray-500 transition-colors hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            >
              View all reflections →
            </button>
          </div>

          {/* The arrow that points from the popover to the trigger */}
          <Popover.Arrow className="fill-white dark:fill-gray-900" />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
