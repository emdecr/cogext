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
import {
  SHELF_META,
  isShelfType,
  type RecordType,
  type ShelfStatus,
} from "@/lib/validations/records";
import { SHELF_CHIP_COLORS, typeColor } from "@/lib/record-type-styles";
import { StarRating } from "@/components/star-rating";
import { formatDateOnly } from "@/lib/date-only";
import { stripMarkdown } from "@/lib/strip-markdown";

// TypeScript type for the record prop, now including tags
// from the relational query.
type Tag = {
  id: string;
  name: string;
  isAi: boolean;
};

type RecordWithTags = {
  id: string;
  type: RecordType;
  title: string | null;
  content: string;
  sourceUrl: string | null;
  sourceAuthor: string | null;
  imagePath: string | null;
  note: string | null;
  rating: number | null;
  shelfStatus: ShelfStatus | null;
  dateFinished: string | null;
  releaseYear: number | null;
  subtitle: string | null;
  createdAt: Date;
  recordTags: { tag: Tag }[];
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
  // Content is authored as markdown; strip it to plain text so previews and
  // fallback titles never leak "##" / "**" etc.
  const plainContent = stripMarkdown(record.content);

  const preview =
    plainContent.length > 150
      ? plainContent.slice(0, 150) + "..."
      : plainContent;

  const isShelf = isShelfType(record.type);
  const titleLimit = record.type === "quote" ? 200 : 50;
  const displayTitle =
    record.title ||
    plainContent.slice(0, titleLimit) +
    (plainContent.length > titleLimit ? "..." : "");
  // Book subtitle, under a real title only (not under a content fallback).
  const showSubtitle = isShelf && !!record.title && !!record.subtitle;

  return (
    <Link
      href={`/records/${record.id}`}
      className="group mb-4 block cursor-pointer break-inside-avoid overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md dark:border-gray-700 dark:bg-gray-900"
    >
      {record.imagePath && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={record.imagePath}
          alt={
            record.title ||
            (isShelfType(record.type)
              ? SHELF_META[record.type].imageLabel
              : "Uploaded image")
          }
          // Covers and posters are portrait — contain them (no crop) on a
          // neutral backer. Other images fill the card top edge-to-edge.
          className={
            isShelf
              ? "max-h-72 w-full bg-gray-50 object-contain dark:bg-gray-800"
              : "h-36 w-full object-cover sm:h-48"
          }
        />
      )}

      <div className="p-3 sm:p-4">
        {/* Type badge */}
        <div className="mb-2">
          <span
            className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium capitalize ${typeColor(record.type)}`}
          >
            {record.type}
          </span>
        </div>

        {/* Title — always shown for shelf records (even with a cover) so the
            shelf reads as title + creator + rating; hidden for other image
            records where the image is the content. */}
        {/* An untitled quote shows the quote text here, so it stays italic;
            a titled quote reads like any other heading. */}
        {(!record.imagePath || isShelf) && (
          <h3 className={`${showSubtitle ? "mb-1" : "mb-4"} text-sm text-gray-900 dark:text-gray-100 ${["link", "note"].includes(record.type) || (record.type === "quote" && record.title) ? "font-bold" : "font-medium"} ${record.type === "quote" && !record.title ? "italic" : ""}`}>
            {displayTitle}
          </h3>
        )}
        {showSubtitle && (
          <p className="mb-4 text-xs text-gray-600 dark:text-gray-400">
            {record.subtitle}
          </p>
        )}

        {/* Content preview */}
        {record.title && !record.imagePath && (
          <p className={`mb-2 text-sm ${record.type === "quote" ? "italic text-gray-900 dark:text-gray-100" : "text-gray-600 dark:text-gray-400"}`}>{preview}</p>
        )}

        {/* Author attribution — styled as "— Author Name" for quotes. Shelf
            records append the year: "— Denis Villeneuve · 2021". */}
        {(record.sourceAuthor || (isShelf && record.releaseYear)) && (
          <p className="mb-2 text-xs text-gray-500 dark:text-gray-400">
            {[
              record.sourceAuthor && `— ${record.sourceAuthor}`,
              isShelf && record.releaseYear,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        )}

        {/* Shelf meta — rating, status, date finished */}
        {isShelfType(record.type) &&
          (record.rating !== null ||
            record.shelfStatus ||
            record.dateFinished) && (
            <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
              {record.rating !== null && (
                <StarRating value={record.rating} className="text-sm" />
              )}
              {/* Skip the "done" chip (Read / Watched) — the date below already
                  conveys it. Keep "Want to …" / "Watching" since those have no
                  date and the chip is their only signal on the card. */}
              {record.shelfStatus && record.shelfStatus !== "done" && (
                <span
                  className={`rounded-full px-2 py-0.5 ${SHELF_CHIP_COLORS[record.type]}`}
                >
                  {SHELF_META[record.type].statusLabels[record.shelfStatus]}
                </span>
              )}
              {record.dateFinished && (
                <span>
                  {SHELF_META[record.type].doneVerb}{" "}
                  {formatDateOnly(record.dateFinished)}
                </span>
              )}
            </div>
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
