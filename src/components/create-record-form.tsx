// ============================================================================
// CREATE RECORD FORM
// ============================================================================
//
// "use client" — this is a CLIENT component because it needs:
//   - useState for form state and error messages
//   - Event handlers (onChange, onSubmit)
//   - Dynamic UI (showing/hiding fields based on record type)
//
// Server components can't do any of that — they render once on the server
// and send static HTML. Client components hydrate in the browser and
// become interactive.
//
// This form calls the createRecord server action directly. When you call
// a server action from a client component, Next.js handles the
// request/response cycle automatically — no fetch() needed.
// ============================================================================

"use client";

import { useState, useRef, useEffect } from "react";
import { createRecord } from "@/lib/actions/records";
import { addTagToRecord } from "@/lib/actions/tags";
import { RECORD_TYPES } from "@/lib/validations/records";
import TagInput from "@/components/tag-input";

export default function CreateRecordForm() {
  // ---- State ----
  // We track form fields, submission state, and errors separately.

  const [type, setType] = useState<(typeof RECORD_TYPES)[number]>("note");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [sourceAuthor, setSourceAuthor] = useState("");
  const [note, setNote] = useState("");

  // Tags — stored locally during creation, then linked to the record
  // after it's saved. Each tag gets a temporary ID (for the UI key)
  // that gets replaced by the real database ID on save.
  const [pendingTags, setPendingTags] = useState<
    { id: string; name: string; isAi: boolean }[]
  >([]);

  // Image upload state
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  // useRef gives us a reference to the hidden file input element
  // so we can trigger it programmatically (click it from our custom button).
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Track whether the form is currently submitting (for loading state)
  const [isSubmitting, setIsSubmitting] = useState(false);

  // General error message (e.g., "Failed to create record")
  const [error, setError] = useState<string | null>(null);

  // Per-field errors from Zod validation (e.g., { content: ["Required"] })
  const [fieldErrors, setFieldErrors] = useState<
    Record<string, string[]> | undefined
  >(undefined);

  // Controls whether the form is expanded/visible
  const [isOpen, setIsOpen] = useState(false);

  // ---- Keyboard shortcut listeners ----
  // Listen for custom events dispatched by the global keyboard shortcuts hook.
  // "N" opens the form, "Esc" closes it.
  useEffect(() => {
    function handleNewRecord() {
      setIsOpen(true);
    }
    function handleClose() {
      // Only close if the form is open — don't interfere with other
      // components that also listen for Esc (command palette, modals, etc.)
      setIsOpen((prev) => {
        if (prev) return false;
        return prev; // No change if already closed
      });
    }

    window.addEventListener("shortcut:new-record", handleNewRecord);
    window.addEventListener("shortcut:close", handleClose);
    return () => {
      window.removeEventListener("shortcut:new-record", handleNewRecord);
      window.removeEventListener("shortcut:close", handleClose);
    };
  }, []);

  // ---- Image handling ----
  // When the user selects a file, we:
  //   1. Store the File object in state (for uploading later)
  //   2. Create a preview URL using URL.createObjectURL
  //
  // URL.createObjectURL creates a temporary browser-only URL that points
  // to the file in memory. It looks like "blob:http://localhost:3000/abc123".
  // This lets us show a preview WITHOUT uploading the file yet.

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    // Basic client-side validation (the server validates too)
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
    // Clean up the blob URL to free memory.
    // Without this, the browser holds the file data in memory
    // until the page is closed.
    if (imagePreview) URL.revokeObjectURL(imagePreview);
    setImagePreview(null);
    // Reset the file input so the same file can be re-selected
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  // ---- Form submission ----
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setFieldErrors(undefined);
    setIsSubmitting(true);

    let imagePath: string | undefined;

    // If this is an image record, upload the file first
    if (type === "image" && imageFile) {
      setIsUploading(true);

      // Create a FormData object — this is the standard way to send
      // files over HTTP. It encodes the data as multipart/form-data,
      // which supports binary file data (unlike JSON).
      const formData = new FormData();
      formData.append("file", imageFile);

      try {
        const uploadRes = await fetch("/api/upload", {
          method: "POST",
          body: formData,
          // NOTE: Don't set Content-Type header manually when sending
          // FormData — the browser sets it automatically with the
          // correct boundary string. Setting it yourself breaks the upload.
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

    // Now create the record (with imagePath if we uploaded an image)
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

    // Add tags to the newly created record.
    // We do this after creation because tags need a record ID to link to.
    // Promise.all runs all tag additions in parallel for speed.
    if (result.recordId && pendingTags.length > 0) {
      await Promise.all(
        pendingTags.map((tag) => addTagToRecord(result.recordId!, tag.name)),
      );
    }

    // Success — reset the form
    setTitle("");
    setContent("");
    setSourceUrl("");
    setSourceAuthor("");
    setNote("");
    setType("note");
    setPendingTags([]);
    clearImage();
    setIsOpen(false);
  }

  // ---- Render ----

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="flex h-12 w-12 items-center justify-center rounded-full bg-gray-900 text-2xl text-white shadow-lg hover:bg-gray-700 transition-colors dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-gray-300"
        aria-label="Create new record"
      >
        +
      </button>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="w-full max-w-lg rounded-lg border border-gray-200 bg-white p-6 shadow-lg dark:border-gray-700 dark:bg-gray-900"
    >
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">New Record</h2>
        <button
          type="button"
          onClick={() => setIsOpen(false)}
          className="text-gray-400 hover:text-gray-600"
          aria-label="Close form"
        >
          ✕
        </button>
      </div>

      {/* General error message */}
      {error && (
        <div className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-600">
          {error}
        </div>
      )}

      {/* ---- Record Type Selector ---- */}
      <div className="mb-4">
        <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
          Type
        </label>
        <div className="flex flex-wrap gap-2">
          {RECORD_TYPES.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => {
                setType(t);
                // Clear image when switching away from image type
                if (t !== "image") clearImage();
              }}
              className={`rounded-full px-3 py-1 text-sm capitalize transition-colors ${
                type === t
                  ? "bg-gray-900 text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* ---- Image Upload (shown only for image type) ---- */}
      {/* We hide the native file input and use a custom styled button
          that triggers it via ref. Native file inputs are notoriously
          hard to style consistently across browsers. */}
      {type === "image" && (
        <div className="mb-4">
          <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
            Image
          </label>

          {/* Hidden file input — triggered by the button below */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/gif,image/webp"
            onChange={handleFileSelect}
            className="hidden"
          />

          {imagePreview ? (
            // Show preview when an image is selected
            <div className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={imagePreview}
                alt="Preview"
                className="max-h-48 w-full rounded-md border border-gray-200 object-cover"
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
            // Show upload button when no image is selected
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="w-full rounded-md border-2 border-dashed border-gray-300 px-4 py-8 text-sm text-gray-500 hover:border-gray-400 hover:text-gray-600"
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

      {/* ---- Title (optional) ---- */}
      <div className="mb-4">
        <label
          htmlFor="title"
          className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300"
        >
          Title{" "}
          <span className="font-normal text-gray-400">(optional)</span>
        </label>
        <input
          id="title"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Give it a name, or let AI suggest one later"
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:placeholder:text-gray-500 dark:focus:border-gray-400 dark:focus:ring-gray-400"
        />
        {fieldErrors?.title && (
          <p className="mt-1 text-sm text-red-500">{fieldErrors.title[0]}</p>
        )}
      </div>

      {/* ---- Content ---- */}
      {/* For image type, content is optional (defaults to "Image").
          For all other types, it's the main body text. */}
      <div className="mb-4">
        <label
          htmlFor="content"
          className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300"
        >
          {type === "image" ? (
            <>
              Description{" "}
              <span className="font-normal text-gray-400">(optional)</span>
            </>
          ) : (
            "Content"
          )}
        </label>
        <textarea
          id="content"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder={
            type === "image"
              ? "Describe the image..."
              : type === "quote"
                ? "Paste the quote..."
                : type === "link"
                  ? "What is this link about?"
                  : type === "article"
                    ? "Paste an excerpt or summary..."
                    : "Write your note..."
          }
          rows={type === "image" ? 2 : 4}
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:placeholder:text-gray-500 dark:focus:border-gray-400 dark:focus:ring-gray-400"
        />
        {fieldErrors?.content && (
          <p className="mt-1 text-sm text-red-500">
            {fieldErrors.content[0]}
          </p>
        )}
      </div>

      {/* ---- Source URL (shown for link and article types) ---- */}
      {(type === "link" || type === "article") && (
        <div className="mb-4">
          <label
            htmlFor="sourceUrl"
            className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300"
          >
            Source URL
          </label>
          <input
            id="sourceUrl"
            type="url"
            value={sourceUrl}
            onChange={(e) => setSourceUrl(e.target.value)}
            placeholder="https://..."
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:placeholder:text-gray-500 dark:focus:border-gray-400 dark:focus:ring-gray-400"
          />
          {fieldErrors?.sourceUrl && (
            <p className="mt-1 text-sm text-red-500">
              {fieldErrors.sourceUrl[0]}
            </p>
          )}
        </div>
      )}

      {/* ---- Author/Source (shown for quote, article, link types) ---- */}
      {(type === "quote" || type === "article" || type === "link") && (
        <div className="mb-4">
          <label
            htmlFor="sourceAuthor"
            className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300"
          >
            {type === "quote" ? "Author" : "Author / Source"}{" "}
            <span className="font-normal text-gray-400">(optional)</span>
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
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:placeholder:text-gray-500 dark:focus:border-gray-400 dark:focus:ring-gray-400"
          />
        </div>
      )}

      {/* ---- Personal Note (optional) ---- */}
      <div className="mb-4">
        <label
          htmlFor="note"
          className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300"
        >
          Note{" "}
          <span className="font-normal text-gray-400">(optional)</span>
        </label>
        <textarea
          id="note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Your personal annotation..."
          rows={3}
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:placeholder:text-gray-500 dark:focus:border-gray-400 dark:focus:ring-gray-400"
        />
      </div>

      {/* ---- Tags ---- */}
      <div className="mb-4">
        <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
          Tags{" "}
          <span className="font-normal text-gray-400">(optional)</span>
        </label>
        <TagInput
          tags={pendingTags}
          onAdd={(name) => {
            // Generate a temporary ID for the UI. This gets replaced
            // by the real database ID when we save.
            setPendingTags((prev) => [
              ...prev,
              { id: `temp-${Date.now()}`, name, isAi: false },
            ]);
          }}
          onRemove={(id) => {
            setPendingTags((prev) => prev.filter((t) => t.id !== id));
          }}
          disabled={isSubmitting}
        />
      </div>

      {/* ---- Submit Button ---- */}
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={() => setIsOpen(false)}
          className="rounded-md px-4 py-2 text-sm text-gray-600 hover:bg-gray-100"
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
  );
}
