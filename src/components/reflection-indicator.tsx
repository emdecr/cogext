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
import EmptyState from "@/components/empty-state";

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
          className="relative flex h-9 items-center rounded-md bg-gray-200 px-3 text-sm text-gray-700 hover:bg-gray-300 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
          title={
            hasUnread
              ? `${unreadReflections.length} new reflection${unreadReflections.length > 1 ? "s" : ""}`
              : "Weekly reflections"
          }
        >
          {/* Lightbulb icon — represents insights and reflections */}
          <svg
            className="h-4 w-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9.663 17h4.674M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
            />
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
          className="z-50 w-80 rounded-lg border border-gray-200 bg-white p-3 shadow-lg animate-[popoverIn_150ms_ease-out] dark:border-gray-700 dark:bg-gray-900"
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
            <EmptyState
              icon="reflections"
              title="No new reflections"
              description="You're all caught up."
              compact
            />
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
