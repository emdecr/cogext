// ============================================================================
// FILTER BAR
// ============================================================================
//
// Horizontal bar with filter controls:
//   - Type filters (pills for each record type)
//   - Tag filters (pills for each tag in use)
//
// Filtering is CLIENT-SIDE — we have all records already, so filtering
// an array in memory is instant. No server round-trip needed.
//
// The filter state lives in the parent (RecordGrid) and is passed down.
// This component just renders the controls and calls callbacks.
// ============================================================================

"use client";

import { RECORD_TYPES } from "@/lib/validations/records";

type FilterBarProps = {
  // Currently selected type filter (null = show all types)
  activeType: string | null;
  onTypeChange: (type: string | null) => void;

  // Currently selected tag filter (null = show all tags)
  activeTag: string | null;
  onTagChange: (tag: string | null) => void;

  // All tags that exist across the user's records — so we know
  // which tag pills to show. We derive this from the records data
  // rather than making a separate database query.
  availableTags: { name: string; count: number }[];
};

export default function FilterBar({
  activeType,
  onTypeChange,
  activeTag,
  onTagChange,
  availableTags,
}: FilterBarProps) {
  return (
    <div className="mt-6 space-y-3">
      {/* ---- Type filters ---- */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Type:</span>

        {/* "All" button — clears the type filter */}
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
            onClick={() =>
              // Toggle: clicking the active type clears it
              onTypeChange(activeType === type ? null : type)
            }
            className={`rounded-full px-3 py-1 text-xs capitalize transition-colors ${
              activeType === type
                ? "bg-gray-900 text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            {type}
          </button>
        ))}
      </div>

      {/* ---- Tag filters ---- */}
      {/* Only show if there are tags to filter by */}
      {availableTags.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Tags:</span>

          {/* "All" button for tags */}
          <button
            onClick={() => onTagChange(null)}
            className={`rounded-full px-3 py-1 text-xs transition-colors ${
              activeTag === null
                ? "bg-gray-900 text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            All
          </button>

          {availableTags.map(({ name, count }) => (
            <button
              key={name}
              onClick={() => onTagChange(activeTag === name ? null : name)}
              className={`rounded-full px-3 py-1 text-xs transition-colors ${
                activeTag === name
                  ? "bg-gray-900 text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {/* Show the tag name and how many records have it */}
              {name}
              <span className="ml-1 opacity-60">{count}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
