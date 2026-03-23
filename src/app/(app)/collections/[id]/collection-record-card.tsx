// ============================================================================
// COLLECTION RECORD CARD
// ============================================================================
//
// Displays a record within a collection detail page. Similar to RecordCard
// on the dashboard, but with a "Remove from collection" action instead of
// the full edit/delete modal.
//
// Clicking the card shows the record content. The remove button unlinks
// the record from this collection (doesn't delete the record itself).
// ============================================================================

"use client";

import { useState } from "react";
import { removeRecordFromCollection } from "@/lib/actions/collections";

type CollectionRecord = {
  id: string;
  type: string;
  title: string | null;
  content: string;
  sourceUrl: string | null;
  sourceAuthor: string | null;
  imagePath: string | null;
  note: string | null;
  createdAt: Date;
  position: number;
  tags: { id: string; name: string; isAi: boolean }[];
};

// Color mapping — same as record-card.tsx
const TYPE_COLORS: Record<string, string> = {
  note: "bg-blue-100 text-blue-700",
  quote: "bg-amber-100 text-amber-700",
  article: "bg-green-100 text-green-700",
  link: "bg-purple-100 text-purple-700",
  image: "bg-pink-100 text-pink-700",
};

type Props = {
  record: CollectionRecord;
  collectionId: string;
};

export default function CollectionRecordCard({ record, collectionId }: Props) {
  const [isRemoving, setIsRemoving] = useState(false);

  const displayTitle =
    record.title ||
    record.content.slice(0, 50) + (record.content.length > 50 ? "..." : "");

  const preview =
    record.content.length > 150
      ? record.content.slice(0, 150) + "..."
      : record.content;

  async function handleRemove() {
    setIsRemoving(true);
    await removeRecordFromCollection(collectionId, record.id);
    // Page will refresh via revalidatePath — the card disappears
  }

  return (
    <div className="group relative mb-4 break-inside-avoid overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-900">
      {/* Remove button — shows on hover in the top-right corner */}
      <button
        onClick={handleRemove}
        disabled={isRemoving}
        className="absolute right-2 top-2 z-10 rounded-md bg-white/80 px-2 py-1 text-xs text-gray-500 opacity-0 shadow-sm transition-opacity hover:text-red-500 group-hover:opacity-100 disabled:opacity-50 dark:bg-gray-800/80"
        title="Remove from collection"
      >
        {isRemoving ? "..." : "✕"}
      </button>

      {/* Image */}
      {record.imagePath && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={record.imagePath}
          alt={record.title || "Uploaded image"}
          className="h-36 w-full object-cover sm:h-48"
        />
      )}

      <div className="p-3 sm:p-4">
        {/* Type badge */}
        <div className="mb-2">
          <span
            className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium capitalize ${TYPE_COLORS[record.type] || "bg-gray-100 text-gray-700"}`}
          >
            {record.type}
          </span>
        </div>

        {/* Title */}
        <h3 className="mb-1 text-sm font-medium text-gray-900 dark:text-gray-100">
          {displayTitle}
        </h3>

        {/* Content preview */}
        {record.title && (
          <p className="mb-2 text-sm text-gray-600 dark:text-gray-400">
            {preview}
          </p>
        )}

        {/* Author */}
        {record.sourceAuthor && (
          <p className="mb-2 text-xs text-gray-500 dark:text-gray-400">
            — {record.sourceAuthor}
          </p>
        )}

        {/* Tags */}
        {record.tags.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-1">
            {record.tags.map((tag) => (
              <span
                key={tag.id}
                className={`inline-block rounded-full px-2 py-0.5 text-xs ${
                  tag.isAi
                    ? "bg-violet-100 text-violet-600 dark:bg-violet-900 dark:text-violet-300"
                    : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"
                }`}
              >
                {tag.name}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
