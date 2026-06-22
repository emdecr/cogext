// ============================================================================
// EDIT RECORD FORM
// ============================================================================
//
// Rendered inside the record detail Radix Dialog (record-card.tsx).
// Owns its own header/body/footer layout so the dialog can expand to
// near-fullscreen while editing. Image upload is intentionally not
// supported here — only metadata edits.
// ============================================================================

"use client";

import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
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
  onClose: () => void;
};

const inputClass =
  "w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:placeholder:text-gray-500 dark:focus:border-gray-400 dark:focus:ring-gray-400";

const labelClass =
  "mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300";

export default function EditRecordForm({ record, onClose }: Props) {
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

    onClose();
  }

  const showSourceUrl = record.type === "link" || record.type === "article";
  const showAuthor =
    record.type === "quote" ||
    record.type === "article" ||
    record.type === "link";

  return (
    <form onSubmit={handleSubmit} className="flex h-full flex-col">
      {/* ---- Header ---- */}
      <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 dark:border-gray-700">
        <Dialog.Title className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          Edit Record
        </Dialog.Title>
        <Dialog.Close asChild>
          <button
            type="button"
            className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800 dark:hover:text-gray-300"
            aria-label="Close form"
          >
            ✕
          </button>
        </Dialog.Close>
      </div>

      {/* ---- Scrollable body ---- */}
      <div className="flex-1 overflow-y-auto px-6 py-6">
        {error && (
          <div className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-600 dark:bg-red-950 dark:text-red-400">
            {error}
          </div>
        )}

        <div className="grid gap-x-8 gap-y-6 md:grid-cols-2">
          {/* Left column: primary content */}
          <div className="space-y-6">
            <div>
              <label htmlFor="edit-title" className={labelClass}>
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
                <p className="mt-1 text-sm text-red-500">
                  {fieldErrors.title[0]}
                </p>
              )}
            </div>

            <div>
              <label htmlFor="edit-content" className={labelClass}>
                Content
              </label>
              <textarea
                id="edit-content"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                rows={12}
                className={inputClass}
              />
              {fieldErrors?.content && (
                <p className="mt-1 text-sm text-red-500">
                  {fieldErrors.content[0]}
                </p>
              )}
            </div>
          </div>

          {/* Right column: metadata */}
          <div className="space-y-6">
            {showSourceUrl && (
              <div>
                <label htmlFor="edit-sourceUrl" className={labelClass}>
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

            {showAuthor && (
              <div>
                <label htmlFor="edit-sourceAuthor" className={labelClass}>
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

            <div>
              <label htmlFor="edit-note" className={labelClass}>
                Note{" "}
                <span className="font-normal text-gray-400">(optional)</span>
              </label>
              <textarea
                id="edit-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Your personal annotation..."
                rows={5}
                className={inputClass}
              />
            </div>
          </div>
        </div>
      </div>

      {/* ---- Sticky footer ---- */}
      <div className="flex justify-end gap-2 border-t border-gray-200 px-6 py-4 dark:border-gray-700">
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
