// ============================================================================
// FILTER BAR
// ============================================================================
//
// Slim horizontal bar with:
//   - Type filter pills (All, Note, Quote, etc.)
//   - Active tag pill (if a tag filter is set, shown as a dismissable chip)
//   - "Filters" button with active count badge to open the drawer
//
// Tags and collections live in the FilterDrawer — this bar stays clean.
// ============================================================================

"use client";

import { RECORD_TYPES } from "@/lib/validations/records";

type FilterBarProps = {
  // Type filter
  activeType: string | null;
  onTypeChange: (type: string | null) => void;

  // Tag filter (set via drawer, displayed here as active pill)
  activeTag: string | null;
  onTagChange: (tag: string | null) => void;

  // How many filters are active (for the badge on the Filters button)
  activeFilterCount: number;

  // Open the filter drawer
  onOpenDrawer: () => void;
};

export default function FilterBar({
  activeType,
  onTypeChange,
  activeTag,
  onTagChange,
  activeFilterCount,
  onOpenDrawer,
}: FilterBarProps) {
  return (
    <div className="mt-6 flex flex-wrap items-center gap-2">
      {/* ---- Type filters ---- */}
      <button
        onClick={() => onTypeChange(null)}
        className={`rounded-full px-3 py-1 text-xs capitalize transition-colors ${
          activeType === null
            ? "bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900"
            : "bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700"
        }`}
      >
        All
      </button>

      {RECORD_TYPES.map((type) => (
        <button
          key={type}
          onClick={() => onTypeChange(activeType === type ? null : type)}
          className={`rounded-full px-3 py-1 text-xs capitalize transition-colors ${
            activeType === type
              ? "bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900"
              : "bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700"
          }`}
        >
          {type}
        </button>
      ))}

      {/* ---- Separator ---- */}
      <div className="mx-1 h-4 w-px bg-gray-200 dark:bg-gray-700" />

      {/* ---- Active tag pill ---- */}
      {/* When a tag filter is active (set via the drawer), show it here
          so the user knows what's filtering without opening the drawer.
          The ✕ button clears the tag filter. */}
      {activeTag && (
        <span className="inline-flex items-center gap-1 rounded-full bg-violet-100 px-2.5 py-1 text-xs text-violet-700 dark:bg-violet-900 dark:text-violet-300">
          {activeTag}
          <button
            onClick={() => onTagChange(null)}
            className="ml-0.5 hover:text-violet-900 dark:hover:text-violet-100"
            aria-label={`Remove ${activeTag} filter`}
          >
            ✕
          </button>
        </span>
      )}

      {/* ---- Filters button ---- */}
      {/* Opens the drawer. Badge shows count of active filters. */}
      <button
        onClick={onOpenDrawer}
        className="relative ml-auto rounded-md border border-gray-200 px-3 py-1 text-xs text-gray-600 hover:bg-gray-100 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-800"
      >
        Filters
        {activeFilterCount > 0 && (
          <span className="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-violet-500 text-[10px] text-white">
            {activeFilterCount}
          </span>
        )}
      </button>
    </div>
  );
}
