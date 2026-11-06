// ============================================================================
// RECORD TYPE STYLES — shared badge colors
// ============================================================================
// One map for the type badge on cards, the detail view, mini cards and the
// command palette (previously duplicated in each). Unknown types fall back to
// gray at the call site.
// ============================================================================

import type { RecordType, ShelfType } from "@/lib/validations/records";

export const TYPE_COLORS: Record<RecordType, string> = {
  note: "bg-blue-100 text-blue-700",
  quote: "bg-amber-100 text-amber-700",
  article: "bg-green-100 text-green-700",
  link: "bg-purple-100 text-purple-700",
  image: "bg-pink-100 text-pink-700",
  book: "bg-indigo-100 text-indigo-700",
  movie: "bg-rose-100 text-rose-700",
  show: "bg-teal-100 text-teal-700",
};

const FALLBACK_TYPE_COLOR = "bg-gray-100 text-gray-700";

export function typeColor(type: string): string {
  return Object.hasOwn(TYPE_COLORS, type)
    ? TYPE_COLORS[type as RecordType]
    : FALLBACK_TYPE_COLOR;
}

// Status chip on shelf records ("Want to watch", "Currently reading"), tinted
// to match the type badge.
export const SHELF_CHIP_COLORS: Record<ShelfType, string> = {
  book: "bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300",
  movie: "bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-300",
  show: "bg-teal-50 text-teal-700 dark:bg-teal-950 dark:text-teal-300",
};
