// ============================================================================
// RECORD MINI CARD
// ============================================================================
//
// A compact, linked card for one record, used in the grids on the record
// detail view: the emergent "Related" list (Phase 4) and the manual
// "Connections" list (Phase 5). Kept in one place so both lists render
// identically.
//
// Rendering rules (agreed with the product owner):
//   - image record  → the image IS the card (big, square, no text)
//   - book w/ cover → portrait cover (contained, not cropped) + title + author
//   - everything else → text card: type badge, title, truncated content
//     (quotes italicized), author
//
// The whole card is a <Link> to /records/<id>, so clicking opens the record
// (as the intercepting modal when navigated from within the app).
// ============================================================================

"use client";

import Link from "next/link";
import { isShelfType, type RelatedRecord } from "@/lib/validations/records";
import { typeColor } from "@/lib/record-type-styles";

export default function RecordMiniCard({ record }: { record: RelatedRecord }) {
  return (
    <Link
      href={`/records/${record.id}`}
      className="group block overflow-hidden rounded-lg border border-gray-200 bg-white transition-shadow hover:shadow-md dark:border-gray-700 dark:bg-gray-900"
    >
      {record.type === "image" && record.imagePath ? (
        // Image record: the image IS the content — show it big, no text.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={record.imagePath}
          alt={record.title ?? ""}
          className="aspect-square w-full object-cover"
        />
      ) : isShelfType(record.type) && record.imagePath ? (
        // Shelf record: cover/poster + title (+ creator). Portrait image,
        // contained on a neutral backer so it isn't cropped (matches the card).
        <div className="flex h-full flex-col">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={record.imagePath}
            alt={record.title ?? "Cover"}
            className="aspect-[3/4] w-full bg-gray-50 object-contain dark:bg-gray-800"
          />
          <div className="flex flex-1 flex-col p-2.5">
            {record.title && (
              <span className="line-clamp-2 text-sm font-medium text-gray-900 dark:text-gray-100">
                {record.title}
              </span>
            )}
            {record.sourceAuthor && (
              <span className="mt-0.5 truncate text-[11px] text-gray-400">
                — {record.sourceAuthor}
              </span>
            )}
          </div>
        </div>
      ) : (
        // Everything else: a text card with the content truncated.
        <div className="flex h-full flex-col gap-1.5 p-3">
          <span
            className={`inline-block w-fit rounded-full px-2 py-0.5 text-[10px] font-medium capitalize ${typeColor(record.type)}`}
          >
            {record.type}
          </span>
          {record.title && (
            <span className="line-clamp-2 text-sm font-medium text-gray-900 dark:text-gray-100">
              {record.title}
            </span>
          )}
          {record.preview && (
            <span
              className={`line-clamp-3 text-xs text-gray-600 dark:text-gray-400 ${record.type === "quote" ? "italic" : ""}`}
            >
              {record.type === "quote" ? `“${record.preview}”` : record.preview}
            </span>
          )}
          {record.sourceAuthor && (
            <span className="mt-auto truncate pt-1 text-[11px] text-gray-400">
              — {record.sourceAuthor}
            </span>
          )}
        </div>
      )}
    </Link>
  );
}
