// ============================================================================
// RECORD GRID
// ============================================================================
//
// Client component that wraps the filter bar + masonry grid.
// Receives ALL records from the server component (dashboard page),
// manages filter state, and renders only the matching records.
//
// Why client-side filtering?
//   - All records are already loaded (server component fetched them)
//   - Filtering an array in memory is instant (no loading state needed)
//   - No server round-trip = no flicker, no spinner
//   - Works fine for our target size (< 50k records)
//
// If we had millions of records, we'd filter server-side with query
// params and pagination. But for a personal knowledge base, client-side
// is simpler and faster.
// ============================================================================

"use client";

import { useState, useMemo } from "react";
import RecordCard from "@/components/record-card";
import FilterBar from "@/components/filter-bar";

// Type matches what getRecords() returns (with tags included)
type Tag = {
  id: string;
  name: string;
  isAi: boolean;
};

type RecordWithTags = {
  id: string;
  type: "image" | "quote" | "article" | "link" | "note";
  title: string | null;
  content: string;
  sourceUrl: string | null;
  imagePath: string | null;
  note: string | null;
  createdAt: Date;
  recordTags: { tag: Tag }[];
};

export default function RecordGrid({
  records,
}: {
  records: RecordWithTags[];
}) {
  const [activeType, setActiveType] = useState<string | null>(null);
  const [activeTag, setActiveTag] = useState<string | null>(null);

  // ---- Derive available tags from the records ----
  // useMemo caches this computation so it only re-runs when `records` changes,
  // not on every render (e.g., when filter state changes).
  //
  // We count how many records use each tag, then sort by count (most used first).
  // This is a common "aggregate" pattern:
  //   1. Build a map of { tagName → count }
  //   2. Convert to an array of { name, count }
  //   3. Sort descending by count
  const availableTags = useMemo(() => {
    const tagCounts = new Map<string, number>();

    for (const record of records) {
      for (const rt of record.recordTags) {
        const count = tagCounts.get(rt.tag.name) || 0;
        tagCounts.set(rt.tag.name, count + 1);
      }
    }

    return Array.from(tagCounts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
  }, [records]);

  // ---- Filter records ----
  // Apply both filters (type AND tag). Both must match if both are active.
  const filteredRecords = useMemo(() => {
    return records.filter((record) => {
      // Type filter: if active, only show records of that type
      if (activeType && record.type !== activeType) return false;

      // Tag filter: if active, only show records that have that tag
      if (activeTag) {
        const hasTag = record.recordTags.some((rt) => rt.tag.name === activeTag);
        if (!hasTag) return false;
      }

      return true;
    });
  }, [records, activeType, activeTag]);

  return (
    <>
      {/* Filter bar */}
      <FilterBar
        activeType={activeType}
        onTypeChange={setActiveType}
        activeTag={activeTag}
        onTagChange={setActiveTag}
        availableTags={availableTags}
      />

      {/* Results count when filtering */}
      {(activeType || activeTag) && (
        <p className="mt-3 text-sm text-gray-500">
          Showing {filteredRecords.length} of {records.length} record
          {records.length !== 1 ? "s" : ""}
          {activeType && (
            <span>
              {" "}
              &middot; type: <span className="font-medium">{activeType}</span>
            </span>
          )}
          {activeTag && (
            <span>
              {" "}
              &middot; tag: <span className="font-medium">{activeTag}</span>
            </span>
          )}
        </p>
      )}

      {/* Record grid */}
      {filteredRecords.length === 0 ? (
        <div className="mt-8 rounded-lg border-2 border-dashed border-gray-300 p-12 text-center text-gray-500">
          {records.length === 0 ? (
            <>
              <p className="text-lg">No records yet</p>
              <p className="mt-2 text-sm">
                Click the + button to save your first note, quote, link, or
                article.
              </p>
            </>
          ) : (
            <>
              <p className="text-lg">No matching records</p>
              <p className="mt-2 text-sm">
                Try adjusting your filters.
              </p>
            </>
          )}
        </div>
      ) : (
        <div className="mt-4 columns-1 gap-4 sm:columns-2 lg:columns-3 xl:columns-4">
          {filteredRecords.map((record) => (
            <RecordCard key={record.id} record={record} />
          ))}
        </div>
      )}
    </>
  );
}
