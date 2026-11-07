// ============================================================================
// FILTER BAR
// ============================================================================
//
// Slim horizontal bar with:
//   - Type filter pills (Note, Quote, Link, Image) plus one split "Shelf" pill
//     for books/movies/shows. No "All" pill — clicking the active pill clears
//     it, and nothing highlighted means no type filter.
//   - Active tag pill (if a tag filter is set, shown as a dismissable chip)
//   - "Filters" button with active count badge to open the drawer
//
// Tags and collections live in the FilterDrawer — this bar stays clean.
// ============================================================================

"use client";

import { useState } from "react";
import * as Popover from "@radix-ui/react-popover";
import {
  INLINE_FILTER_TYPES,
  SHELF_FILTER,
  SHELF_FILTER_TYPES,
  isShelfFilter,
  type TypeFilter,
} from "@/lib/type-filter";

const PILL_ACTIVE =
  "bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900";
const PILL_INACTIVE =
  "bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700";

type FilterBarProps = {
  // Type filter
  activeType: TypeFilter;
  onTypeChange: (type: TypeFilter) => void;

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
      {/* Inline on ≥sm where there's room; on mobile these move into the filter
          drawer (see FilterDrawer) so this row doesn't overflow. */}
      <div className="hidden flex-wrap items-center gap-2 sm:flex">
        {INLINE_FILTER_TYPES.map((type) => (
          <button
            key={type}
            onClick={() => onTypeChange(activeType === type ? null : type)}
            aria-pressed={activeType === type}
            className={`rounded-full px-3 py-1 text-xs capitalize transition-colors ${
              activeType === type ? PILL_ACTIVE : PILL_INACTIVE
            }`}
          >
            {type}
          </button>
        ))}

        <ShelfPill activeType={activeType} onTypeChange={onTypeChange} />

        {/* ---- Separator ---- */}
        <div className="mx-1 h-4 w-px bg-gray-200 dark:bg-gray-700" />
      </div>

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

// ============================================================================
// SHELF PILL
// ============================================================================
// Split pill: the label toggles "every shelf type"; the caret opens a menu to
// narrow to one (Book / Movie / Show). When narrowed, the label shows that type
// so the bar still says what's filtering.

function ShelfPill({
  activeType,
  onTypeChange,
}: {
  activeType: TypeFilter;
  onTypeChange: (type: TypeFilter) => void;
}) {
  const [open, setOpen] = useState(false);
  const active = isShelfFilter(activeType);
  const label = active && activeType !== SHELF_FILTER ? activeType : "shelf";

  const options: { value: TypeFilter; label: string }[] = [
    { value: SHELF_FILTER, label: "All" },
    ...SHELF_FILTER_TYPES.map((t) => ({ value: t, label: t })),
  ];

  // Each half gets its own hover shade so the split reads as two targets.
  const segment = active
    ? "hover:bg-gray-700 dark:hover:bg-gray-300"
    : "hover:bg-gray-200 dark:hover:bg-gray-700";

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <div
        className={`inline-flex items-stretch overflow-hidden rounded-full text-xs capitalize transition-colors ${
          active
            ? PILL_ACTIVE
            : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"
        }`}
      >
        <button
          onClick={() => onTypeChange(active ? null : SHELF_FILTER)}
          aria-pressed={active}
          className={`py-1 pl-3 pr-2 capitalize transition-colors ${segment}`}
        >
          {label}
        </button>
        <Popover.Trigger asChild>
          <button
            aria-label="Choose shelf type"
            title="Choose shelf type"
            className={`flex items-center border-l py-1 pl-1.5 pr-2.5 transition-colors ${segment} ${
              active
                ? "border-white/25 dark:border-gray-900/25"
                : "border-gray-300 dark:border-gray-600"
            }`}
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 12 12"
              className={`h-3 w-3 transition-transform ${open ? "rotate-180" : ""}`}
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M3 4.5 6 7.5 9 4.5" />
            </svg>
          </button>
        </Popover.Trigger>
      </div>

      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={4}
          className="z-[60] w-40 rounded-lg border border-gray-200 bg-white p-1 shadow-lg animate-[popoverIn_150ms_ease-out] dark:border-gray-700 dark:bg-gray-900"
        >
          <p className="px-2 pb-1 pt-1.5 text-[11px] font-medium uppercase tracking-wider text-gray-400">
            Shelf
          </p>
          {options.map((opt) => {
            const selected = activeType === opt.value;
            return (
              <button
                key={opt.value}
                onClick={() => {
                  onTypeChange(opt.value);
                  setOpen(false);
                }}
                aria-pressed={selected}
                className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm capitalize transition-colors ${
                  selected
                    ? "bg-gray-100 font-medium text-gray-900 dark:bg-gray-800 dark:text-gray-100"
                    : "text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-800"
                }`}
              >
                {opt.label}
                {selected && <span aria-hidden="true">✓</span>}
              </button>
            );
          })}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
