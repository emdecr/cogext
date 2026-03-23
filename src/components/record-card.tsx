// ============================================================================
// RECORD CARD
// ============================================================================
//
// Displays a single record in the masonry grid. Clicking the card opens
// a detail modal (Radix Dialog) showing the full content, tags, and
// actions (add/remove tags, delete).
// ============================================================================

"use client";

import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { deleteRecord } from "@/lib/actions/records";
import { addTagToRecord, removeTagFromRecord } from "@/lib/actions/tags";
import TagInput from "@/components/tag-input";
import EditRecordForm from "@/components/edit-record-form";

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
  const [isDeleting, setIsDeleting] = useState(false);
  // Toggle between viewing the record detail and editing it.
  // When isEditing is true, the modal shows the EditRecordForm instead.
  const [isEditing, setIsEditing] = useState(false);

  // Flatten the tags from the join table structure into a simple array.
  // The relational query returns { recordTags: [{ tag: { id, name, isAi } }] }
  // and we want just [{ id, name, isAi }] for easier use.
  const tags = record.recordTags.map((rt) => rt.tag);

  const preview =
    record.content.length > 150
      ? record.content.slice(0, 150) + "..."
      : record.content;

  const displayTitle =
    record.title ||
    record.content.slice(0, 50) +
      (record.content.length > 50 ? "..." : "");

  async function handleDelete() {
    if (!window.confirm("Delete this record? This can't be undone.")) return;

    setIsDeleting(true);
    const result = await deleteRecord(record.id);
    if (!result.success) {
      alert(result.error || "Failed to delete");
      setIsDeleting(false);
    }
  }

  async function handleAddTag(name: string) {
    await addTagToRecord(record.id, name);
  }

  async function handleRemoveTag(tagId: string) {
    await removeTagFromRecord(record.id, tagId);
  }

  return (
    <Dialog.Root>
      {/* ================================================================
          CARD VIEW (trigger)
          ================================================================ */}
      <Dialog.Trigger asChild>
        <div className="group mb-4 cursor-pointer break-inside-avoid overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm transition-shadow hover:shadow-md dark:border-gray-700 dark:bg-gray-900">
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
                {record.sourceUrl}
              </p>
            )}

            {/* Tags on card — compact pills, no remove buttons */}
            {tags.length > 0 && (
              <div className="mb-2 flex flex-wrap gap-1">
                {tags.map((tag) => (
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

            {/* User note */}
            {record.note && (
              <p className="mb-2 text-xs italic text-gray-500 dark:text-gray-400">
                &ldquo;{record.note}&rdquo;
              </p>
            )}

            {/* Timestamp */}
            <p className="text-xs text-gray-400">
              {timeAgo(new Date(record.createdAt))}
            </p>
          </div>
        </div>
      </Dialog.Trigger>

      {/* ================================================================
          DETAIL MODAL
          ================================================================ */}
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0" />

        <Dialog.Content
          className="fixed left-1/2 top-1/2 z-50 max-h-[85vh] w-[calc(100%-2rem)] max-w-2xl -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl bg-white p-4 shadow-xl focus:outline-none dark:bg-gray-900 md:p-6"
          // Reset edit mode when the modal closes so it always opens in view mode.
          onCloseAutoFocus={() => setIsEditing(false)}
        >
          {/* Header — shared between view and edit modes */}
          <div className="mb-4 flex items-start justify-between">
            <Dialog.Title className="text-xl font-semibold text-gray-900 dark:text-gray-100">
              {isEditing ? "Edit Record" : displayTitle}
            </Dialog.Title>
            <Dialog.Close className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800 dark:hover:text-gray-300">
              ✕
            </Dialog.Close>
          </div>

          {isEditing ? (
            /* ============================================================
               EDIT MODE — shows the form with pre-filled values.
               When the form saves or cancels, we switch back to view mode.
               ============================================================ */
            <EditRecordForm
              record={record}
              onClose={() => setIsEditing(false)}
            />
          ) : (
            /* ============================================================
               VIEW MODE — the original detail view content.
               ============================================================ */
            <>
              {/* Type badge */}
              <div className="mb-4">
                <span
                  className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium capitalize ${TYPE_COLORS[record.type] || "bg-gray-100 text-gray-700"}`}
                >
                  {record.type}
                </span>
              </div>

              {/* Image */}
              {record.imagePath && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={record.imagePath}
                  alt={record.title || "Uploaded image"}
                  className="mb-4 w-full rounded-lg object-contain"
                />
              )}

              {/* Full content */}
              <div className="mb-4 whitespace-pre-wrap text-sm leading-relaxed text-gray-700 dark:text-gray-300">
                {record.content}
              </div>

              {/* Author attribution */}
              {record.sourceAuthor && (
                <div className="mb-4">
                  <p className="mb-1 text-xs font-medium text-gray-500 dark:text-gray-400">Author</p>
                  <p className="text-sm text-gray-700 dark:text-gray-300">{record.sourceAuthor}</p>
                </div>
              )}

              {/* Source URL */}
              {record.sourceUrl && (
                <div className="mb-4">
                  <p className="mb-1 text-xs font-medium text-gray-500 dark:text-gray-400">Source</p>
                  <a
                    href={record.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="break-all text-sm text-blue-500 hover:underline dark:text-blue-400"
                  >
                    {record.sourceUrl}
                  </a>
                </div>
              )}

              {/* User note */}
              {record.note && (
                <div className="mb-4 rounded-md bg-gray-50 p-3 dark:bg-gray-800">
                  <p className="mb-1 text-xs font-medium text-gray-500 dark:text-gray-400">
                    Your note
                  </p>
                  <p className="text-sm italic text-gray-600 dark:text-gray-300">{record.note}</p>
                </div>
              )}

              {/* ---- Tags ---- */}
              {/* In the modal, tags are interactive — you can add and remove.
                  Server actions fire immediately (no save button needed). */}
              <div className="mb-4">
                <p className="mb-1 text-xs font-medium text-gray-500 dark:text-gray-400">Tags</p>
                <TagInput
                  tags={tags}
                  onAdd={handleAddTag}
                  onRemove={handleRemoveTag}
                />
              </div>

              {/* Footer — edit + delete actions */}
              <div className="flex items-center justify-between border-t border-gray-100 pt-4 dark:border-gray-800">
                <p className="text-xs text-gray-400 dark:text-gray-500">
                  Created {new Date(record.createdAt).toLocaleDateString()} at{" "}
                  {new Date(record.createdAt).toLocaleTimeString()}
                </p>

                <div className="flex items-center gap-2">
                  {/* Edit button — switches to edit mode */}
                  <button
                    onClick={() => setIsEditing(true)}
                    className="rounded-md px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
                  >
                    Edit
                  </button>

                  <button
                    onClick={handleDelete}
                    disabled={isDeleting}
                    className="rounded-md px-3 py-1.5 text-xs text-red-500 hover:bg-red-50 disabled:opacity-50 dark:hover:bg-red-950"
                  >
                    {isDeleting ? "Deleting..." : "Delete"}
                  </button>
                </div>
              </div>
            </>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
