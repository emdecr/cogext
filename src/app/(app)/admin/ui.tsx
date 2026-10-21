// ============================================================================
// ADMIN UI PRIMITIVES
// ============================================================================
//
// Small shared pieces for the admin tabs: card/heading classes, status badges,
// and a relative timestamp with the exact UTC time on hover. Server-safe (no
// hooks), so tab pages can stay server components.
// ============================================================================

import { formatRelative, formatUtc } from "@/lib/backups/parse";
import { getAdminTab } from "./tabs";

export const card =
  "rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900";
export const cardTitle =
  "text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400";
export const muted = "text-sm text-gray-500 dark:text-gray-400";

export const tone = {
  green:
    "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
  amber:
    "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  red: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
  gray: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
} as const;

export type Tone = keyof typeof tone;

export function Badge({
  color,
  children,
}: {
  color: Tone;
  children: React.ReactNode;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${tone[color]}`}
    >
      {children}
    </span>
  );
}

// "3 hours ago" with the exact UTC time on hover.
export function When({ iso, now }: { iso: string; now: Date }) {
  return (
    <time dateTime={iso} title={formatUtc(iso)}>
      {formatRelative(iso, now)}
    </time>
  );
}

// Tab heading + one-line description, from the shared tab list.
export function TabHeading({ slug }: { slug: string }) {
  const tab = getAdminTab(slug);
  return (
    <>
      <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
        {tab.label}
      </h2>
      <p className={`mt-1 ${muted}`}>{tab.description}</p>
    </>
  );
}
