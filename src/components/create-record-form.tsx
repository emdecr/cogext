// ============================================================================
// CREATE RECORD FORM
// ============================================================================
//
// Renders the floating "+" button. Clicking it opens a near-fullscreen
// Radix Dialog containing the form. The form calls the createRecord
// server action directly — no fetch() needed.
// ============================================================================

"use client";

import { useState, useRef, useEffect } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { createRecord } from "@/lib/actions/records";
import { addTagToRecord } from "@/lib/actions/tags";
import { RECORD_TYPES } from "@/lib/validations/records";
import TagInput from "@/components/tag-input";

const inputClass =
  "w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:placeholder:text-gray-500 dark:focus:border-gray-400 dark:focus:ring-gray-400";

const labelClass =
  "mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300";

export default function CreateRecordForm() {
  const [type, setType] = useState<(typeof RECORD_TYPES)[number]>("note");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [sourceAuthor, setSourceAuthor] = useState("");
  const [note, setNote] = useState("");

  const [pendingTags, setPendingTags] = useState<
    { id: string; name: string; isAi: boolean }[]
  >([]);

  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<
    Record<string, string[]> | undefined
  >(undefined);

  const [isOpen, setIsOpen] = useState(false);

  // Global keyboard shortcuts: "N" opens the form, "Esc" closes it.
  // Radix Dialog handles Esc natively, but we keep the shortcut event
  // so other listeners stay consistent.
  useEffect(() => {
    function handleNewRecord() {
      setIsOpen(true);
    }
    function handleClose() {
      setIsOpen((prev) => (prev ? false : prev));
    }

    window.addEventListener("shortcut:new-record", handleNewRecord);
    window.addEventListener("shortcut:close", handleClose);
    return () => {
      window.removeEventListener("shortcut:new-record", handleNewRecord);
      window.removeEventListener("shortcut:close", handleClose);
    };
  }, []);

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const allowedTypes = ["image/jpeg", "image/png", "image/gif", "image/webp"];
    if (!allowedTypes.includes(file.type)) {
      setError("Please select a JPEG, PNG, GIF, or WebP image");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setError("Image must be under 5MB");
      return;
    }

    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
    setError(null);
  }

  function clearImage() {
    setImageFile(null);
    if (imagePreview) URL.revokeObjectURL(imagePreview);
    setImagePreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function resetForm() {
    setTitle("");
    setContent("");
    setSourceUrl("");
    setSourceAuthor("");
    setNote("");
    setType("note");
    setPendingTags([]);
    clearImage();
    setError(null);
    setFieldErrors(undefined);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setFieldErrors(undefined);
    setIsSubmitting(true);

    let imagePath: string | undefined;

    if (type === "image" && imageFile) {
      setIsUploading(true);

      const formData = new FormData();
      formData.append("file", imageFile);

      try {
        const uploadRes = await fetch("/api/upload", {
          method: "POST",
          body: formData,
        });

        if (!uploadRes.ok) {
          const data = await uploadRes.json();
          setError(data.error || "Failed to upload image");
          setIsSubmitting(false);
          setIsUploading(false);
          return;
        }

        const data = await uploadRes.json();
        imagePath = data.path;
      } catch {
        setError("Failed to upload image. Please try again.");
        setIsSubmitting(false);
        setIsUploading(false);
        return;
      }

      setIsUploading(false);
    }

    const result = await createRecord({
      type,
      title: title || undefined,
      content: content || (type === "image" ? "Image" : ""),
      sourceUrl: sourceUrl || undefined,
      sourceAuthor: sourceAuthor || undefined,
      note: note || undefined,
      imagePath,
    });

    setIsSubmitting(false);

    if (!result.success) {
      setError(result.error || "Something went wrong");
      setFieldErrors(result.fieldErrors);
      return;
    }

    if (result.recordId && pendingTags.length > 0) {
      await Promise.all(
        pendingTags.map((tag) => addTagToRecord(result.recordId!, tag.name)),
      );
    }

    resetForm();
    setIsOpen(false);
  }

  const showSourceUrl = type === "link" || type === "article";
  const showAuthor = type === "quote" || type === "article" || type === "link";

  return (
    <Dialog.Root
      open={isOpen}
      onOpenChange={(open) => {
        setIsOpen(open);
        if (!open) resetForm();
      }}
    >
      <Dialog.Trigger asChild>
        <button
          className="flex h-12 w-12 items-center justify-center rounded-full bg-gray-900 text-2xl text-white shadow-lg hover:bg-gray-700 transition-colors dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-gray-300"
          aria-label="Create new record"
        >
          +
        </button>
      </Dialog.Trigger>

      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50 animate-[fadeIn_150ms_ease-out]" />

        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 flex h-[90vh] w-[90vw] max-w-6xl -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-xl bg-white shadow-xl focus:outline-none animate-[scaleFadeIn_200ms_ease-out] dark:bg-gray-900">
          <form onSubmit={handleSubmit} className="flex h-full flex-col">
            {/* ---- Header ---- */}
            <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 dark:border-gray-700">
              <Dialog.Title className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                New Record
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

              {/* Type selector — full width */}
              <div className="mb-6">
                <label className={labelClass}>Type</label>
                <div className="flex flex-wrap gap-2">
                  {RECORD_TYPES.map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => {
                        setType(t);
                        if (t !== "image") clearImage();
                      }}
                      className={`rounded-full px-3 py-1 text-sm capitalize transition-colors ${
                        type === t
                          ? "bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900"
                          : "bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              {/* Two-column body */}
              <div className="grid gap-x-8 gap-y-6 md:grid-cols-2">
                {/* ---- Left column: primary content ---- */}
                <div className="space-y-6">
                  <div>
                    <label htmlFor="title" className={labelClass}>
                      Title{" "}
                      <span className="font-normal text-gray-400">
                        (optional)
                      </span>
                    </label>
                    <input
                      id="title"
                      type="text"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder="Give it a name, or let AI suggest one later"
                      className={inputClass}
                    />
                    {fieldErrors?.title && (
                      <p className="mt-1 text-sm text-red-500">
                        {fieldErrors.title[0]}
                      </p>
                    )}
                  </div>

                  {type !== "image" && (
                    <div>
                      <label htmlFor="content" className={labelClass}>
                        Content
                      </label>
                      <textarea
                        id="content"
                        value={content}
                        onChange={(e) => setContent(e.target.value)}
                        placeholder={
                          type === "quote"
                            ? "Paste the quote..."
                            : type === "link"
                              ? "What is this link about?"
                              : type === "article"
                                ? "Paste an excerpt or summary..."
                                : "Write your note..."
                        }
                        rows={12}
                        className={inputClass}
                      />
                      {fieldErrors?.content && (
                        <p className="mt-1 text-sm text-red-500">
                          {fieldErrors.content[0]}
                        </p>
                      )}
                    </div>
                  )}

                  {type === "image" && (
                    <div>
                      <label className={labelClass}>Image</label>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/jpeg,image/png,image/gif,image/webp"
                        onChange={handleFileSelect}
                        className="hidden"
                      />
                      {imagePreview ? (
                        <div className="relative">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={imagePreview}
                            alt="Preview"
                            className="max-h-96 w-full rounded-md border border-gray-200 object-cover dark:border-gray-700"
                          />
                          <button
                            type="button"
                            onClick={clearImage}
                            className="absolute right-2 top-2 rounded-full bg-black/50 px-2 py-1 text-xs text-white hover:bg-black/70"
                          >
                            Remove
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          className="w-full rounded-md border-2 border-dashed border-gray-300 px-4 py-12 text-sm text-gray-500 hover:border-gray-400 hover:text-gray-600 dark:border-gray-600 dark:text-gray-400 dark:hover:border-gray-500"
                        >
                          Click to select an image
                          <br />
                          <span className="text-xs text-gray-400">
                            JPEG, PNG, GIF, or WebP • Max 5MB
                          </span>
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {/* ---- Right column: metadata ---- */}
                <div className="space-y-6">
                  {showSourceUrl && (
                    <div>
                      <label htmlFor="sourceUrl" className={labelClass}>
                        Source URL
                      </label>
                      <input
                        id="sourceUrl"
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
                      <label htmlFor="sourceAuthor" className={labelClass}>
                        {type === "quote" ? "Author" : "Author / Source"}{" "}
                        <span className="font-normal text-gray-400">
                          (optional)
                        </span>
                      </label>
                      <input
                        id="sourceAuthor"
                        type="text"
                        value={sourceAuthor}
                        onChange={(e) => setSourceAuthor(e.target.value)}
                        placeholder={
                          type === "quote"
                            ? "Who said this?"
                            : "Who wrote this?"
                        }
                        className={inputClass}
                      />
                    </div>
                  )}

                  <div>
                    <label htmlFor="note" className={labelClass}>
                      Note{" "}
                      <span className="font-normal text-gray-400">
                        (optional)
                      </span>
                    </label>
                    <textarea
                      id="note"
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      placeholder="Your personal annotation..."
                      rows={5}
                      className={inputClass}
                    />
                  </div>

                  <div>
                    <label className={labelClass}>
                      Tags{" "}
                      <span className="font-normal text-gray-400">
                        (optional)
                      </span>
                    </label>
                    <TagInput
                      tags={pendingTags}
                      onAdd={(name) => {
                        setPendingTags((prev) => [
                          ...prev,
                          {
                            id: `temp-${Date.now()}`,
                            name,
                            isAi: false,
                          },
                        ]);
                      }}
                      onRemove={(id) => {
                        setPendingTags((prev) =>
                          prev.filter((t) => t.id !== id),
                        );
                      }}
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
                onClick={() => setIsOpen(false)}
                className="rounded-md px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting || (type === "image" && !imageFile)}
                className="rounded-md bg-gray-900 px-4 py-2 text-sm text-white hover:bg-gray-700 disabled:opacity-50 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-gray-300"
              >
                {isUploading
                  ? "Uploading..."
                  : isSubmitting
                    ? "Saving..."
                    : "Save Record"}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
