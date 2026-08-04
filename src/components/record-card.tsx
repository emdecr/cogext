// ============================================================================
// RECORD CARD
// ============================================================================
//
// Displays a single record in the masonry grid. The card is a link to the
// record's canonical URL (/records/[id]). Clicking it is intercepted by a
// parallel route so it opens as a modal over the current page (Instagram
// style), while a direct visit / refresh / shared link renders the full
// standalone page. Either way the detail UI is RecordDetail.
// ============================================================================

"use client";

import Link from "next/link";

// TypeScript type for the record prop, now including tags
// from the relational query.
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

// Color mapping for record type badges.
const TYPE_COLORS: Record<string, string> = {
  note: "bg-blue-100 text-blue-700",
  quote: "bg-amber-100 text-amber-700",
  article: "bg-green-100 text-green-700",
  link: "bg-purple-100 text-purple-700",
  image: "bg-pink-100 text-pink-700",
};

function timeAgo(date: Date): string {
  const now = new Date();
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;

  return date.toLocaleDateString();
}

export default function RecordCard({ record }: { record: RecordWithTags }) {
  const preview =
    record.content.length > 150
      ? record.content.slice(0, 150) + "..."
      : record.content;

  const titleLimit = record.type === "quote" ? 200 : 50;
  const displayTitle =
    record.title ||
    record.content.slice(0, titleLimit) +
    (record.content.length > titleLimit ? "..." : "");

  return (
    <Link
      href={`/records/${record.id}`}
      className="group mb-4 block cursor-pointer break-inside-avoid overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md dark:border-gray-700 dark:bg-gray-900"
    >
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
        {!record.imagePath && (
          <h3 className={`mb-4 text-sm text-gray-900 dark:text-gray-100 ${["link", "note"].includes(record.type) ? "font-bold" : "font-medium"} ${record.type === "quote" ? "italic" : ""}`}>
            {displayTitle}
          </h3>
        )}

        {/* Content preview */}
        {record.title && !record.imagePath && (
          <p className="mb-2 text-sm text-gray-600 dark:text-gray-400">{preview}</p>
        )}

        {/* Author attribution — styled as "— Author Name" for quotes */}
        {record.sourceAuthor && (
          <p className="mb-2 text-xs text-gray-500 dark:text-gray-400">
            — {record.sourceAuthor}
          </p>
        )}

        {/* Source URL */}
        {record.sourceUrl && (
          <p className="mb-2 truncate text-xs text-blue-500 dark:text-blue-400">
            {new URL(record.sourceUrl).hostname.replace(/^www\./, "")}
          </p>
        )}

        {/* Timestamp */}
        <p className="mt-4 text-xs text-gray-400">
          {timeAgo(new Date(record.createdAt))}
        </p>
      </div>
    </Link>
  );
}
