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
import {
  READING_STATUSES,
  READING_STATUS_LABELS,
  type RecordType,
  type ReadingStatus,
} from "@/lib/validations/records";
import { CoverImageInput } from "@/components/cover-image-input";

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
  readingStatus: ReadingStatus | null;
  dateRead: string | null;
  createdAt: Date;
  recordTags: { tag: Tag }[];
};

type Props = {
  record: RecordWithTags;
  onClose: () => void;
};

const inputClass =
  "w-full rounded-md border border-gray-300 px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:placeholder:text-gray-500 dark:focus:border-gray-400 dark:focus:ring-gray-400";

const labelClass =
  "mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300";

export default function EditRecordForm({ record, onClose }: Props) {
  const [title, setTitle] = useState(record.title ?? "");
  const [content, setContent] = useState(record.content);
  const [sourceUrl, setSourceUrl] = useState(record.sourceUrl ?? "");
  const [sourceAuthor, setSourceAuthor] = useState(record.sourceAuthor ?? "");
  const [note, setNote] = useState(record.note ?? "");

  // Book-only fields.
  const [rating, setRating] = useState<number | null>(record.rating);
  const [readingStatus, setReadingStatus] = useState<ReadingStatus | "">(
    record.readingStatus ?? "",
  );
  const [dateRead, setDateRead] = useState(record.dateRead ?? "");

  // Book cover. `coverFile` is a newly-picked file (not yet uploaded);
  // `coverRemoved` marks the existing saved cover for deletion.
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverRemoved, setCoverRemoved] = useState(false);

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

    // Resolve the cover change (book only). `undefined` = leave unchanged;
    // "" = remove; a path = new/replaced cover.
    let imagePath: string | undefined;
    if (record.type === "book") {
      if (coverFile) {
        const formData = new FormData();
        formData.append("file", coverFile);
        try {
          const uploadRes = await fetch("/api/upload", {
            method: "POST",
            body: formData,
          });
          if (!uploadRes.ok) {
            const data = await uploadRes.json();
            setError(data.error || "Failed to upload cover");
            setIsSubmitting(false);
            return;
          }
          imagePath = (await uploadRes.json()).path;
        } catch {
          setError("Failed to upload cover. Please try again.");
          setIsSubmitting(false);
          return;
        }
      } else if (coverRemoved) {
        imagePath = "";
      }
    }

    const result = await updateRecord({
      id: record.id,
      // Sent so server-side validation knows the record type (e.g. to enforce
      // "links require a Source URL"). The type itself can't change here.
      type: record.type,
      title: title || undefined,
      content,
      sourceUrl: sourceUrl || undefined,
      sourceAuthor: sourceAuthor || undefined,
      note: note || undefined,
      rating: record.type === "book" && rating !== null ? rating : undefined,
      readingStatus:
        record.type === "book" && readingStatus ? readingStatus : undefined,
      dateRead: record.type === "book" && dateRead ? dateRead : undefined,
      // Only include when the cover actually changed, so the action leaves an
      // untouched cover alone.
      ...(imagePath !== undefined ? { imagePath } : {}),
    });

    setIsSubmitting(false);

    if (!result.success) {
      setError(result.error || "Something went wrong");
      setFieldErrors(result.fieldErrors);
      return;
    }

    onClose();
  }

  const showSourceUrl =
    record.type === "link" ||
    record.type === "article" ||
    record.type === "quote" ||
    record.type === "image" ||
    record.type === "book";
  const showAuthor =
    record.type === "quote" ||
    record.type === "article" ||
    record.type === "link" ||
    record.type === "book";

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
            className="-mr-2 rounded-md p-2 text-lg leading-none text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800 dark:hover:text-gray-300"
            aria-label="Close form"
          >
            ✕
          </button>
        </Dialog.Close>
      </div>

      {/* ---- Scrollable body ---- */}
      <div className="flex-1 overflow-y-auto px-4 py-5 sm:px-6 sm:py-6">
        {error && (
          <div className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-600 dark:bg-red-950 dark:text-red-400">
            {error}
          </div>
        )}

        <div className="grid gap-x-8 gap-y-6 lg:grid-cols-2">
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
                {record.type === "book" ? "Description" : "Content"}
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
                  Source URL{" "}
                  {record.type !== "link" && (
                    <span className="font-normal text-gray-400">(optional)</span>
                  )}
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
                  {record.type === "quote" || record.type === "book"
                    ? "Author"
                    : "Author / Source"}{" "}
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

            {record.type === "book" && (
              <div className="space-y-6 rounded-md border border-gray-200 p-4 dark:border-gray-700">
                <div>
                  <label htmlFor="edit-rating" className={labelClass}>
                    Rating{" "}
                    <span className="font-normal text-gray-400">
                      (optional · 0–5)
                    </span>
                  </label>
                  <input
                    id="edit-rating"
                    type="number"
                    min={0}
                    max={5}
                    step="any"
                    value={rating ?? ""}
                    onChange={(e) =>
                      setRating(
                        e.target.value === "" ? null : Number(e.target.value),
                      )
                    }
                    placeholder="e.g. 4.25"
                    className={inputClass}
                  />
                  {fieldErrors?.rating && (
                    <p className="mt-1 text-sm text-red-500">
                      {fieldErrors.rating[0]}
                    </p>
                  )}
                </div>

                <div>
                  <label htmlFor="edit-readingStatus" className={labelClass}>
                    Status{" "}
                    <span className="font-normal text-gray-400">(optional)</span>
                  </label>
                  <select
                    id="edit-readingStatus"
                    value={readingStatus}
                    onChange={(e) =>
                      setReadingStatus(e.target.value as ReadingStatus | "")
                    }
                    className={inputClass}
                  >
                    <option value="">—</option>
                    {READING_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {READING_STATUS_LABELS[s]}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="edit-dateRead" className={labelClass}>
                    Date read{" "}
                    <span className="font-normal text-gray-400">
                      (optional)
                    </span>
                  </label>
                  <input
                    id="edit-dateRead"
                    type="date"
                    value={dateRead}
                    onChange={(e) => setDateRead(e.target.value)}
                    className={inputClass}
                  />
                </div>

                <div>
                  <label className={labelClass}>
                    Cover{" "}
                    <span className="font-normal text-gray-400">
                      (optional)
                    </span>
                  </label>
                  <CoverImageInput
                    existingUrl={coverRemoved ? null : record.imagePath}
                    file={coverFile}
                    onSelect={(f) => {
                      setCoverFile(f);
                      setCoverRemoved(false);
                      setError(null);
                    }}
                    onClear={() => {
                      setCoverFile(null);
                      setCoverRemoved(true);
                    }}
                    onError={setError}
                    disabled={isSubmitting}
                  />
                </div>
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
          className="rounded-md px-4 py-2.5 text-sm text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={isSubmitting}
          className="rounded-md bg-gray-900 px-5 py-2.5 text-sm text-white hover:bg-gray-700 disabled:opacity-50 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-gray-300"
        >
          {isSubmitting ? "Saving..." : "Save Changes"}
        </button>
      </div>
    </form>
  );
}
