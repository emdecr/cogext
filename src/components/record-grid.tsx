// ============================================================================
// RECORD GRID
// ============================================================================
//
// Client component that wraps the filter bar + filter drawer + masonry grid.
// Receives ALL records from the server component (dashboard page),
// manages filter state, and renders only the matching records.
//
// Filter state lives here because:
//   - FilterBar needs to show active filters
//   - FilterDrawer needs to set tag filters
//   - The grid needs to apply filters
//   - All three share the same state, so it lives in their common parent
// ============================================================================

"use client";

import { useState, useMemo } from "react";
import RecordCard from "@/components/record-card";
import FilterBar from "@/components/filter-bar";
import FilterDrawer from "@/components/filter-drawer";

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
  sourceAuthor: string | null;
  imagePath: string | null;
  note: string | null;
  createdAt: Date;
  recordTags: { tag: Tag }[];
};

// Collection summary — matches what getCollections() returns
type CollectionSummary = {
  id: string;
  name: string;
  description: string | null;
  coverImage: string | null;
  recordCount: number;
  createdAt: Date;
};

export default function RecordGrid({
  records,
  collections = [],
}: {
  records: RecordWithTags[];
  collections?: CollectionSummary[];
}) {
  const [activeType, setActiveType] = useState<string | null>(null);
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  // ---- Derive available tags from the records ----
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

  // Count active filters (for the badge on the Filters button)
  const activeFilterCount = (activeTag ? 1 : 0);

  // ---- Filter records ----
  const filteredRecords = useMemo(() => {
    return records.filter((record) => {
      if (activeType && record.type !== activeType) return false;

      if (activeTag) {
        const hasTag = record.recordTags.some(
          (rt) => rt.tag.name === activeTag,
        );
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
        activeFilterCount={activeFilterCount}
        onOpenDrawer={() => setIsDrawerOpen(true)}
      />

      {/* Filter drawer */}
      <FilterDrawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        activeTag={activeTag}
        onTagChange={(tag) => {
          setActiveTag(tag);
          // Close drawer after selecting a filter for a clean UX
          setIsDrawerOpen(false);
        }}
        availableTags={availableTags}
        collections={collections}
      />

      {/* Results count when filtering */}
      {(activeType || activeTag) && (
        <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">
          Showing {filteredRecords.length} of {records.length} record
          {records.length !== 1 ? "s" : ""}
          {activeType && (
            <span>
              {" "}
              &middot; type:{" "}
              <span className="font-medium">{activeType}</span>
            </span>
          )}
          {activeTag && (
            <span>
              {" "}
              &middot; tag:{" "}
              <span className="font-medium">{activeTag}</span>
            </span>
          )}
        </p>
      )}

      {/* Record grid */}
      {filteredRecords.length === 0 ? (
        <div className="mt-8 rounded-lg border-2 border-dashed border-gray-300 p-12 text-center text-gray-500 dark:border-gray-700 dark:text-gray-400">
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
              <p className="mt-2 text-sm">Try adjusting your filters.</p>
            </>
          )}
        </div>
      ) : (
        <div className="mt-4 columns-1 gap-3 sm:columns-2 sm:gap-4 lg:columns-3 xl:columns-4">
          {filteredRecords.map((record) => (
            <RecordCard key={record.id} record={record} />
          ))}
        </div>
      )}
    </>
  );
}
