// ============================================================================
// RECORD CARD
// ============================================================================
//
// Displays a single record in the grid. This is a CLIENT component because
// it will eventually need interactivity (click to open detail modal,
// delete button, etc.).
//
// For now it shows:
//   - Record type as a colored badge
//   - Title (or a fallback based on content)
//   - Truncated content preview
//   - Relative timestamp
//
// This component receives a record object as a prop — it doesn't fetch
// data itself. The parent (dashboard page) fetches all records and maps
// over them, rendering one RecordCard per record.
// ============================================================================

"use client";

import { useState } from "react";
import { deleteRecord } from "@/lib/actions/records";

// TypeScript type for the record prop. We could import this from Drizzle's
// generated types, but defining it explicitly here makes the component's
// contract clearer and avoids coupling the UI to the ORM.
type Record = {
  id: string;
  type: "image" | "quote" | "article" | "link" | "note";
  title: string | null;
  content: string;
  sourceUrl: string | null;
  note: string | null;
  createdAt: Date;
};

// Color mapping for record type badges.
// Each type gets a distinct but subtle color to help visual scanning.
const TYPE_COLORS: Record<string, string> = {
  note: "bg-blue-100 text-blue-700",
  quote: "bg-amber-100 text-amber-700",
  article: "bg-green-100 text-green-700",
  link: "bg-purple-100 text-purple-700",
  image: "bg-pink-100 text-pink-700",
};

// Format a date as a relative time string (e.g., "2 hours ago", "3 days ago").
// This is a simple implementation — in a production app you might use
// a library like date-fns or dayjs for more robust formatting.
function timeAgo(date: Date): string {
  const now = new Date();
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;

  // For older dates, show the actual date
  return date.toLocaleDateString();
}

export default function RecordCard({ record }: { record: Record }) {
  const [isDeleting, setIsDeleting] = useState(false);

  // Truncate content to ~150 chars for the preview.
  // We'll show the full content in the detail modal later.
  const preview =
    record.content.length > 150
      ? record.content.slice(0, 150) + "..."
      : record.content;

  // Display title, or fall back to the first ~50 chars of content
  const displayTitle =
    record.title || record.content.slice(0, 50) + (record.content.length > 50 ? "..." : "");

  async function handleDelete() {
    // Confirm before deleting. In a nicer UI this would be a modal,
    // but window.confirm works for now.
    if (!window.confirm("Delete this record? This can't be undone.")) return;

    setIsDeleting(true);
    const result = await deleteRecord(record.id);
    if (!result.success) {
      alert(result.error || "Failed to delete");
      setIsDeleting(false);
    }
    // On success, revalidatePath in the server action will refresh the list
  }

  return (
    <div className="group rounded-lg border border-gray-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md">
      {/* Header: type badge + delete button */}
      <div className="mb-2 flex items-start justify-between">
        <span
          className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium capitalize ${TYPE_COLORS[record.type] || "bg-gray-100 text-gray-700"}`}
        >
          {record.type}
        </span>

        {/* Delete button — hidden by default, shown on hover (group-hover).
            The "group" class on the parent div enables this pattern. */}
        <button
          onClick={handleDelete}
          disabled={isDeleting}
          className="rounded p-1 text-gray-300 opacity-0 transition-opacity hover:bg-red-50 hover:text-red-500 group-hover:opacity-100"
          aria-label="Delete record"
        >
          {isDeleting ? "..." : "✕"}
        </button>
      </div>

      {/* Title */}
      <h3 className="mb-1 text-sm font-medium text-gray-900">
        {displayTitle}
      </h3>

      {/* Content preview — only show if different from title */}
      {record.title && (
        <p className="mb-2 text-sm text-gray-600">{preview}</p>
      )}

      {/* Source URL — shown as a truncated link */}
      {record.sourceUrl && (
        <a
          href={record.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mb-2 block truncate text-xs text-blue-500 hover:underline"
        >
          {record.sourceUrl}
        </a>
      )}

      {/* User note — shown in italics to distinguish from content */}
      {record.note && (
        <p className="mb-2 text-xs italic text-gray-500">
          &ldquo;{record.note}&rdquo;
        </p>
      )}

      {/* Timestamp */}
      <p className="text-xs text-gray-400">{timeAgo(new Date(record.createdAt))}</p>
    </div>
  );
}
