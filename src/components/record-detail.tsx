// ============================================================================
// RECORD DETAIL
// ============================================================================
//
// The full detail view of a single record: header, scrollable body, and a
// sticky footer with edit/delete/collection actions. Toggles between a
// read-only VIEW mode and an EDIT mode (EditRecordForm) via local state.
//
// This is the single source of truth for the record detail UI. It is rendered
// by BOTH:
//   - the standalone page  (src/app/(app)/records/[id]/page.tsx)
//   - the intercepting modal (src/app/(app)/@modal/(.)records/[id]/...)
// so the two surfaces can never drift.
//
// It is intentionally decoupled from Radix Dialog: the modal supplies close
// behavior via the optional `onClose` prop (and its own accessible title). On
// the standalone page there is no `onClose`, so no close button is shown.
// ============================================================================

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { deleteRecord } from "@/lib/actions/records";
import { addTagToRecord, removeTagFromRecord } from "@/lib/actions/tags";
import TagInput from "@/components/tag-input";
import EditRecordForm from "@/components/edit-record-form";
import AddToCollection from "@/components/add-to-collection";
import ConfirmDialog from "@/components/confirm-dialog";

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

export default function RecordDetail({
  record,
  onClose,
}: {
  record: RecordWithTags;
  // Provided when rendered inside the modal (closes it). Absent on the
  // standalone page, where no close button is rendered.
  onClose?: () => void;
}) {
  const router = useRouter();
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  // Toggle between viewing the record detail and editing it.
  const [isEditing, setIsEditing] = useState(false);

  // Flatten the tags from the join table structure into a simple array.
  const tags = record.recordTags.map((rt) => rt.tag);

  async function handleDelete() {
    setIsDeleting(true);
    const result = await deleteRecord(record.id);
    if (!result.success) {
      alert(result.error || "Failed to delete");
      setIsDeleting(false);
      setShowDeleteConfirm(false);
      return;
    }
    // On success the record is gone. In the modal, close it (which navigates
    // back to the dashboard). On the standalone page, navigate to the
    // dashboard since this record's URL no longer resolves.
    if (onClose) {
      onClose();
    } else {
      router.push("/dashboard");
    }
  }

  async function handleAddTag(name: string) {
    await addTagToRecord(record.id, name);
  }

  async function handleRemoveTag(tagId: string) {
    await removeTagFromRecord(record.id, tagId);
  }

  if (isEditing) {
    // EDIT MODE — fullscreen form with its own header/body/footer.
    return (
      <EditRecordForm record={record} onClose={() => setIsEditing(false)} />
    );
  }

  // VIEW MODE — fullscreen detail view (header / body / footer).
  return (
    <div className="flex h-full flex-col">
      {/* ---- Header ---- */}
      <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 dark:border-gray-700">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Record Details
          </h2>
          <span
            className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium capitalize ${TYPE_COLORS[record.type] || "bg-gray-100 text-gray-700"}`}
          >
            {record.type}
          </span>
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800 dark:hover:text-gray-300"
            aria-label="Close"
          >
            ✕
          </button>
        )}
      </div>

      {/* ---- Scrollable body ---- */}
      <div className="flex-1 overflow-y-auto px-6 py-6">
        {record.imagePath ? (
          /* Image type: image on left, meta on right */
          <div className="grid gap-x-8 gap-y-6 md:grid-cols-2">
            <div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={record.imagePath}
                alt={record.title || "Uploaded image"}
                className="max-h-[70vh] w-full rounded-lg border border-gray-200 object-contain dark:border-gray-700"
              />
            </div>

            <div className="space-y-6">
              {record.title && (
                <div>
                  <p className="mb-1 text-xs font-medium text-gray-500 dark:text-gray-400">
                    Title
                  </p>
                  <p className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                    {record.title}
                  </p>
                </div>
              )}

              {record.note && (
                <div className="rounded-md bg-gray-50 p-3 dark:bg-gray-800">
                  <p className="mb-1 text-xs font-medium text-gray-500 dark:text-gray-400">
                    Your note
                  </p>
                  <p className="text-sm italic text-gray-600 dark:text-gray-300">
                    {record.note}
                  </p>
                </div>
              )}

              {record.content && (
                <div>
                  <p className="mb-1 text-xs font-medium text-gray-500 dark:text-gray-400">
                    Image Description
                  </p>
                  <p className="whitespace-pre-wrap text-sm italic text-gray-700 dark:text-gray-300">
                    {record.content}
                  </p>
                </div>
              )}

              <div>
                <p className="mb-1 text-xs font-medium text-gray-500 dark:text-gray-400">
                  Tags
                </p>
                <TagInput
                  tags={tags}
                  onAdd={handleAddTag}
                  onRemove={handleRemoveTag}
                />
              </div>
            </div>
          </div>
        ) : (
          /* Non-image types: content on left, meta on right (mirrors create form) */
          <div className="grid gap-x-8 gap-y-6 md:grid-cols-2">
            <div className="space-y-6">
              {record.title && (
                <div>
                  <p className="mb-1 text-xs font-medium text-gray-500 dark:text-gray-400">
                    Title
                  </p>
                  <p className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                    {record.title}
                  </p>
                </div>
              )}

              <div>
                <p className="mb-1 text-xs font-medium text-gray-500 dark:text-gray-400">
                  Content
                </p>
                <div
                  className={`whitespace-pre-wrap leading-relaxed text-gray-700 dark:text-gray-300 ${
                    record.type === "quote"
                      ? record.content.length < 140
                        ? "text-3xl font-serif italic leading-snug"
                        : record.content.length < 320
                          ? "text-xl font-serif italic"
                          : "text-base italic"
                      : "text-sm"
                  }`}
                >
                  {record.type === "quote" ? `“${record.content}”` : record.content}
                </div>
              </div>
            </div>

            <div className="space-y-6">
              {record.sourceUrl && (
                <div>
                  <p className="mb-1 text-xs font-medium text-gray-500 dark:text-gray-400">
                    Source
                  </p>
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

              {record.sourceAuthor && (
                <div>
                  <p className="mb-1 text-xs font-medium text-gray-500 dark:text-gray-400">
                    {record.type === "quote" ? "Author" : "Author / Source"}
                  </p>
                  <p className="text-sm text-gray-700 dark:text-gray-300">
                    {record.sourceAuthor}
                  </p>
                </div>
              )}

              {record.note && (
                <div className="rounded-md bg-gray-50 p-3 dark:bg-gray-800">
                  <p className="mb-1 text-xs font-medium text-gray-500 dark:text-gray-400">
                    Your note
                  </p>
                  <p className="text-sm italic text-gray-600 dark:text-gray-300">
                    {record.note}
                  </p>
                </div>
              )}

              <div>
                <p className="mb-1 text-xs font-medium text-gray-500 dark:text-gray-400">
                  Tags
                </p>
                <TagInput
                  tags={tags}
                  onAdd={handleAddTag}
                  onRemove={handleRemoveTag}
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ---- Sticky footer ---- */}
      <div className="flex items-center justify-between border-t border-gray-200 px-6 py-4 dark:border-gray-700">
        <p className="text-xs text-gray-400 dark:text-gray-500">
          Created {new Date(record.createdAt).toLocaleDateString()} at{" "}
          {new Date(record.createdAt).toLocaleTimeString()}
        </p>

        <div className="flex items-center gap-2">
          <AddToCollection recordId={record.id} />

          <button
            onClick={() => setIsEditing(true)}
            className="rounded-md px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
          >
            Edit
          </button>

          <button
            onClick={() => setShowDeleteConfirm(true)}
            disabled={isDeleting}
            className="rounded-md px-3 py-1.5 text-xs text-red-500 hover:bg-red-50 disabled:opacity-50 dark:hover:bg-red-950"
          >
            {isDeleting ? "Deleting..." : "Delete"}
          </button>
        </div>
      </div>

      {/* Delete confirmation — Radix AlertDialog, replaces window.confirm */}
      <ConfirmDialog
        open={showDeleteConfirm}
        onOpenChange={setShowDeleteConfirm}
        title="Delete this record?"
        description="This can't be undone. The record and all its tags will be permanently removed."
        confirmLabel="Delete"
        variant="danger"
        onConfirm={handleDelete}
        isConfirming={isDeleting}
      />
    </div>
  );
}
