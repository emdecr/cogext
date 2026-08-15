// ============================================================================
// COVER IMAGE INPUT
// ============================================================================
//
// A compact optional cover-image picker used by book records in the create and
// edit forms. Unlike the full image-type dropzone (which owns the whole form),
// this sits inside the book metadata block alongside the review/rating fields.
//
// It's controlled: the PARENT owns the selected File and whether an existing
// cover was removed. This component just renders the picker/preview and reports
// selections back — the parent uploads on submit (POST /api/upload) and stores
// the returned path as records.imagePath.
//
// Book covers deliberately skip Claude Vision: analysis only runs for
// type === "image" in createRecord, so a book's imagePath is never analyzed.
// ============================================================================

"use client";

import { useEffect, useMemo, useRef } from "react";

// Kept in sync with the image-type dropzone in create-record-form.tsx.
// (Server-side /api/upload re-validates type + magic bytes + size regardless.)
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"];
const MAX_BYTES = 5 * 1024 * 1024;

export function CoverImageInput({
  existingUrl,
  file,
  onSelect,
  onClear,
  onError,
  disabled = false,
}: {
  // A previously-saved cover URL (edit form). Null when creating or removed.
  existingUrl: string | null;
  // A newly-selected file not yet uploaded. Null when none picked.
  file: File | null;
  onSelect: (file: File) => void;
  // Clears a pending file and/or removes the existing saved cover.
  onClear: () => void;
  onError: (message: string) => void;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  // Object URL for the pending file's preview. Revoked on change/unmount so we
  // don't leak blob URLs.
  const objectUrl = useMemo(
    () => (file ? URL.createObjectURL(file) : null),
    [file],
  );
  useEffect(() => {
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [objectUrl]);

  const preview = objectUrl ?? existingUrl;

  function handleSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files?.[0];
    // Reset so picking the same file again still fires onChange.
    e.target.value = "";
    if (!selected) return;
    if (!ALLOWED_TYPES.includes(selected.type)) {
      onError("Please select a JPEG, PNG, GIF, or WebP image");
      return;
    }
    if (selected.size > MAX_BYTES) {
      onError("Cover image must be under 5MB");
      return;
    }
    onSelect(selected);
  }

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/gif,image/webp"
        onChange={handleSelect}
        disabled={disabled}
        className="sr-only"
      />

      {preview ? (
        <div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={preview}
            alt="Cover preview"
            className="max-h-56 rounded-md border border-gray-200 bg-gray-50 object-contain dark:border-gray-700 dark:bg-gray-800"
          />
          <div className="mt-2 flex gap-3 text-xs">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={disabled}
              className="text-gray-600 hover:text-gray-900 disabled:opacity-50 dark:text-gray-400 dark:hover:text-gray-200"
            >
              Replace
            </button>
            <button
              type="button"
              onClick={onClear}
              disabled={disabled}
              className="text-red-500 hover:text-red-700 disabled:opacity-50"
            >
              Remove
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={disabled}
          className="flex w-full cursor-pointer flex-col items-center justify-center rounded-md -outline-offset-2 outline-2 outline-dashed outline-gray-300 px-4 py-8 text-center text-sm text-gray-500 transition-colors hover:text-gray-600 hover:outline-gray-400 disabled:opacity-50 dark:text-gray-400 dark:outline-gray-600 dark:hover:text-gray-500"
        >
          <span>Add a cover image</span>
          <span className="mt-1 text-xs text-gray-400">
            JPEG, PNG, GIF, or WebP • Max 5MB
          </span>
        </button>
      )}
    </div>
  );
}
