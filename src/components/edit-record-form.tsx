// ============================================================================
// EDIT RECORD FORM
// ============================================================================
//
// Rendered by RecordDetail in edit mode. Like RecordDetail, it is
// Dialog-agnostic (plain heading + button, close driven by `onClose`) so it
// works on both the standalone /records/[id] page and the intercepting modal.
// Owns its own header/body/footer layout so the surface can expand to
// near-fullscreen while editing. Image upload is intentionally not
// supported here — only metadata edits.
// ============================================================================

"use client";

import { useState } from "react";
import { updateRecord } from "@/lib/actions/records";
import { addTagToRecord, removeTagFromRecord } from "@/lib/actions/tags";
import TagInput from "@/components/tag-input";
import {
  SHELF_META,
  isShelfType,
  type RecordType,
  type ShelfStatus,
} from "@/lib/validations/records";
import ShelfFields, { type ShelfValues } from "@/components/shelf-fields";
import MarkdownField from "@/components/markdown-field";

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

  // Shelf fields (book, movie, show, music).
  const isShelf = isShelfType(record.type);
  const [shelf, setShelf] = useState<ShelfValues>({
    rating: record.rating,
    shelfStatus: record.shelfStatus ?? "",
    dateFinished: record.dateFinished ?? "",
    releaseYear: record.releaseYear,
    subtitle: record.subtitle ?? "",
  });

  // Cover / poster (shelf records). `coverFile` is a newly-picked file (not yet uploaded);
  // `coverRemoved` marks the existing saved cover for deletion.
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverRemoved, setCoverRemoved] = useState(false);

  // Tags are managed with their own server actions (add/remove take effect
  // immediately), independent of the form's Save — same model as the read-only
  // detail view. Local state gives instant pill feedback without a refetch.
  const [tags, setTags] = useState<Tag[]>(
    record.recordTags.map((rt) => rt.tag),
  );

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

    // Resolve the cover change (shelf records only). `undefined` = leave unchanged;
    // "" = remove; a path = new/replaced cover.
    let imagePath: string | undefined;
    if (isShelf) {
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
      ...(isShelf
        ? {
            rating: shelf.rating ?? undefined,
            shelfStatus: shelf.shelfStatus || undefined,
            dateFinished: shelf.dateFinished || undefined,
            releaseYear: shelf.releaseYear ?? undefined,
            subtitle: shelf.subtitle || undefined,
          }
        : {}),
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

  // ---- Tag add/remove (immediate, via server actions) ----
  async function handleAddTag(name: string) {
    // Guard against a duplicate the input didn't catch (e.g. case folding).
    if (tags.some((t) => t.name === name.trim().toLowerCase())) return;
    const result = await addTagToRecord(record.id, name);
    if (result.success && result.tag) {
      const added = result.tag;
      setTags((prev) =>
        prev.some((t) => t.id === added.id) ? prev : [...prev, added],
      );
    }
  }

  async function handleRemoveTag(tagId: string) {
    // Optimistic: drop the pill now, then persist.
    const previous = tags;
    setTags((prev) => prev.filter((t) => t.id !== tagId));
    const result = await removeTagFromRecord(record.id, tagId);
    if (!result.success) setTags(previous);
  }

  const showSourceUrl =
    record.type === "link" ||
    record.type === "article" ||
    record.type === "quote" ||
    record.type === "image" ||
    isShelf;
  const showAuthor =
    record.type === "quote" ||
    record.type === "article" ||
    record.type === "link" ||
    isShelf;

  // Shared note field, placed under the Description for shelf records (left
  // column) and
  // in the metadata column for every other type. Mirrors create-record-form.
  const noteField = (
    <MarkdownField
      id="edit-note"
      recordId={record.id}
      label={
        <>
          Note{" "}
          <span className="font-normal text-gray-400">(optional)</span>
        </>
      }
      value={note}
      onChange={setNote}
      placeholder="Your personal annotation..."
      rows={5}
      dialogTitle="Edit note"
    />
  );

  return (
    <form onSubmit={handleSubmit} className="flex h-full flex-col">
      {/* ---- Header ---- */}
      <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 dark:border-gray-700">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          Edit Record
        </h2>
        <button
          type="button"
          onClick={onClose}
          className="-mr-2 rounded-md p-2 text-lg leading-none text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800 dark:hover:text-gray-300"
          aria-label="Close form"
        >
          ✕
        </button>
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

            {isShelfType(record.type) && SHELF_META[record.type].hasSubtitle && (
              <div>
                <label htmlFor="edit-subtitle" className={labelClass}>
                  Subtitle{" "}
                  <span className="font-normal text-gray-400">(optional)</span>
                </label>
                <input
                  id="edit-subtitle"
                  type="text"
                  value={shelf.subtitle}
                  onChange={(e) =>
                    setShelf((s) => ({ ...s, subtitle: e.target.value }))
                  }
                  className={inputClass}
                />
                {fieldErrors?.subtitle && (
                  <p className="mt-1 text-sm text-red-500">
                    {fieldErrors.subtitle[0]}
                  </p>
                )}
              </div>
            )}

            <MarkdownField
              id="edit-content"
              recordId={record.id}
              label={isShelf ? "Description" : "Content"}
              value={content}
              onChange={setContent}
              rows={isShelf ? 6 : 12}
              error={fieldErrors?.content?.[0]}
              dialogTitle={
                isShelf ? "Edit description" : "Edit content"
              }
            />

            {/* Shelf records keep the note right under the description. */}
            {isShelf && noteField}
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
                  inputMode="url"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
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
                  {isShelfType(record.type)
                    ? SHELF_META[record.type].creatorLabel
                    : record.type === "quote"
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

            {isShelfType(record.type) && (
              <ShelfFields
                type={record.type}
                idPrefix="edit-"
                values={shelf}
                onChange={(patch) => setShelf((prev) => ({ ...prev, ...patch }))}
                fieldErrors={fieldErrors}
                cover={{
                  existingUrl: coverRemoved ? null : record.imagePath,
                  file: coverFile,
                  onSelect: (f) => {
                    setCoverFile(f);
                    setCoverRemoved(false);
                    setError(null);
                  },
                  onClear: () => {
                    setCoverFile(null);
                    setCoverRemoved(true);
                  },
                  onError: setError,
                  disabled: isSubmitting,
                }}
              />
            )}

            {/* Other types keep the note here in the metadata column. */}
            {!isShelf && noteField}

            <div>
              <label className={labelClass}>Tags</label>
              <TagInput
                tags={tags}
                onAdd={handleAddTag}
                onRemove={handleRemoveTag}
                disabled={isSubmitting}
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
