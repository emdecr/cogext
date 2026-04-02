// ============================================================================
// EDIT RECORD FORM
// ============================================================================
//
// Inline edit form that appears inside the record detail modal.
// Pre-fills all fields from the existing record and calls updateRecord()
// on save. Only sends changed fields (PATCH-style).
//
// This is a separate component (not inlined in RecordCard) because:
//   1. It has its own state (form values, submission state, errors)
//   2. Keeps RecordCard from getting even larger
//   3. Can be reused if we ever need editing from other contexts
//
// The form mirrors the create form's field layout but skips type selection
// (you can't change a note into an image) and image upload (not supported
// for edits yet — would need file replacement logic).
// ============================================================================

"use client";

import { useState } from "react";
import { updateRecord } from "@/lib/actions/records";
import { RECORD_TYPES } from "@/lib/validations/records";

type Tag = {
  id: string;
  name: string;
  isAi: boolean;
};

type RecordWithTags = {
  id: string;
  type: (typeof RECORD_TYPES)[number];
  title: string | null;
  content: string;
  sourceUrl: string | null;
  sourceAuthor: string | null;
  imagePath: string | null;
  note: string | null;
  createdAt: Date;
  recordTags: { tag: Tag }[];
};

type Props = {
  record: RecordWithTags;
  // Called when the user finishes editing (save or cancel).
  // The parent (RecordCard) uses this to switch back to the view mode.
  onClose: () => void;
};

export default function EditRecordForm({ record, onClose }: Props) {
  // ---- Form state, pre-filled from existing record ----
  // We use ?? "" to convert null to empty string for controlled inputs.
  // On save, we convert empty strings back to undefined (so updateRecord
  // stores them as null in the database).
  const [title, setTitle] = useState(record.title ?? "");
  const [content, setContent] = useState(record.content);
  const [sourceUrl, setSourceUrl] = useState(record.sourceUrl ?? "");
  const [sourceAuthor, setSourceAuthor] = useState(record.sourceAuthor ?? "");
  const [note, setNote] = useState(record.note ?? "");

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<
    Record<string, string[]> | undefined
  >(undefined);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setFieldErrors(undefined);
    setIsSubmitting(true);

    // Send updated fields to the server action.
    // updateRecord uses a partial schema — only fields we include get updated.
    // Empty strings become undefined → stored as null in the database.
    const result = await updateRecord({
      id: record.id,
      title: title || undefined,
      content,
      sourceUrl: sourceUrl || undefined,
      sourceAuthor: sourceAuthor || undefined,
      note: note || undefined,
    });

    setIsSubmitting(false);

    if (!result.success) {
      setError(result.error || "Something went wrong");
      setFieldErrors(result.fieldErrors);
      return;
    }

    // Success — close the edit form. The parent's data will refresh
    // because updateRecord calls revalidatePath("/dashboard").
    onClose();
  }

  // Shared input class string — same styling as create-record-form.
  const inputClass =
    "w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:placeholder:text-gray-500 dark:focus:border-gray-400 dark:focus:ring-gray-400";

  return (
    <form onSubmit={handleSubmit}>
      {/* Error banner */}
      {error && (
        <div className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-600 dark:bg-red-950 dark:text-red-400">
          {error}
        </div>
      )}

      {/* ---- Title ---- */}
      <div className="mb-4">
        <label
          htmlFor="edit-title"
          className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300"
        >
          Title{" "}
          <span className="font-normal text-gray-400">(optional)</span>
        </label>
        <input
          id="edit-title"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Give it a name..."
          className={inputClass}
        />
        {fieldErrors?.title && (
          <p className="mt-1 text-sm text-red-500">{fieldErrors.title[0]}</p>
        )}
      </div>

      {/* ---- Content ---- */}
      <div className="mb-4">
        <label
          htmlFor="edit-content"
          className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300"
        >
          Content
        </label>
        <textarea
          id="edit-content"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={4}
          className={inputClass}
        />
        {fieldErrors?.content && (
          <p className="mt-1 text-sm text-red-500">
            {fieldErrors.content[0]}
          </p>
        )}
      </div>

      {/* ---- Source URL (shown for link and article types) ---- */}
      {(record.type === "link" || record.type === "article") && (
        <div className="mb-4">
          <label
            htmlFor="edit-sourceUrl"
            className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300"
          >
            Source URL
          </label>
          <input
            id="edit-sourceUrl"
            type="url"
            value={sourceUrl}
            onChange={(e) => setSourceUrl(e.target.value)}
            placeholder="https://..."
            className={inputClass}
          />
          {fieldErrors?.sourceUrl && (
            <p className="mt-1 text-sm text-red-500">
              {fieldErrors.sourceUrl[0]}
            </p>
          )}
        </div>
      )}

      {/* ---- Author (shown for quote, article, link types) ---- */}
      {(record.type === "quote" ||
        record.type === "article" ||
        record.type === "link") && (
        <div className="mb-4">
          <label
            htmlFor="edit-sourceAuthor"
            className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300"
          >
            {record.type === "quote" ? "Author" : "Author / Source"}{" "}
            <span className="font-normal text-gray-400">(optional)</span>
          </label>
          <input
            id="edit-sourceAuthor"
            type="text"
            value={sourceAuthor}
            onChange={(e) => setSourceAuthor(e.target.value)}
            className={inputClass}
          />
        </div>
      )}

      {/* ---- Note ---- */}
      <div className="mb-4">
        <label
          htmlFor="edit-note"
          className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300"
        >
          Note{" "}
          <span className="font-normal text-gray-400">(optional)</span>
        </label>
        <textarea
          id="edit-note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Your personal annotation..."
          rows={3}
          className={inputClass}
        />
      </div>

      {/* ---- Actions ---- */}
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          className="rounded-md px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={isSubmitting}
          className="rounded-md bg-gray-900 px-4 py-2 text-sm text-white hover:bg-gray-700 disabled:opacity-50 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-gray-300"
        >
          {isSubmitting ? "Saving..." : "Save Changes"}
        </button>
      </div>
    </form>
  );
}
