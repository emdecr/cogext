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

import { useState } from "react";
import { createRecord } from "@/lib/actions/records";
import { RECORD_TYPES } from "@/lib/validations/records";

export default function CreateRecordForm() {
  // ---- State ----
  // We track form fields, submission state, and errors separately.
  // In a larger app you might use a form library (react-hook-form),
  // but for learning purposes, managing state manually shows what's
  // actually happening.

  const [type, setType] = useState<(typeof RECORD_TYPES)[number]>("note");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [note, setNote] = useState("");

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

  // ---- Form submission ----
  async function handleSubmit(e: React.FormEvent) {
    // Prevent the browser's default form submission (which would reload
    // the page). We handle submission ourselves with the server action.
    e.preventDefault();

    // Clear previous errors and set loading state
    setError(null);
    setFieldErrors(undefined);
    setIsSubmitting(true);

    // Call the server action. This sends the data to the server,
    // runs the action function, and returns the result — all handled
    // by Next.js behind the scenes.
    const result = await createRecord({
      type,
      title: title || undefined, // Convert empty string to undefined
      content,
      sourceUrl: sourceUrl || undefined,
      note: note || undefined,
    });

    setIsSubmitting(false);

    if (!result.success) {
      // Show errors from the server action
      setError(result.error || "Something went wrong");
      setFieldErrors(result.fieldErrors);
      return;
    }

    // Success — reset the form
    setTitle("");
    setContent("");
    setSourceUrl("");
    setNote("");
    setType("note");
    setIsOpen(false);
  }

  // ---- Render ----
  // When collapsed, show just the "+" button.
  // When expanded, show the full form.

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="flex h-12 w-12 items-center justify-center rounded-full bg-gray-900 text-2xl text-white shadow-lg hover:bg-gray-700 transition-colors"
        aria-label="Create new record"
      >
        +
      </button>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="w-full max-w-lg rounded-lg border border-gray-200 bg-white p-6 shadow-lg"
    >
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">New Record</h2>
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
      {/* We use buttons styled as pills instead of a <select> dropdown.
          This gives users a visual preview of all options at once. */}
      <div className="mb-4">
        <label className="mb-1 block text-sm font-medium text-gray-700">
          Type
        </label>
        <div className="flex flex-wrap gap-2">
          {RECORD_TYPES.map((t) => (
            <button
              key={t}
              type="button" // "button" not "submit" — prevents form submission on click
              onClick={() => setType(t)}
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

      {/* ---- Title (optional) ---- */}
      <div className="mb-4">
        <label
          htmlFor="title"
          className="mb-1 block text-sm font-medium text-gray-700"
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
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500"
        />
        {fieldErrors?.title && (
          <p className="mt-1 text-sm text-red-500">{fieldErrors.title[0]}</p>
        )}
      </div>

      {/* ---- Content (required) ---- */}
      <div className="mb-4">
        <label
          htmlFor="content"
          className="mb-1 block text-sm font-medium text-gray-700"
        >
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
          rows={4}
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500"
        />
        {fieldErrors?.content && (
          <p className="mt-1 text-sm text-red-500">
            {fieldErrors.content[0]}
          </p>
        )}
      </div>

      {/* ---- Source URL (shown for link and article types) ---- */}
      {/* Conditional rendering: only show this field when it's relevant.
          Notes and quotes don't usually have source URLs. */}
      {(type === "link" || type === "article") && (
        <div className="mb-4">
          <label
            htmlFor="sourceUrl"
            className="mb-1 block text-sm font-medium text-gray-700"
          >
            Source URL
          </label>
          <input
            id="sourceUrl"
            type="url"
            value={sourceUrl}
            onChange={(e) => setSourceUrl(e.target.value)}
            placeholder="https://..."
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500"
          />
          {fieldErrors?.sourceUrl && (
            <p className="mt-1 text-sm text-red-500">
              {fieldErrors.sourceUrl[0]}
            </p>
          )}
        </div>
      )}

      {/* ---- Personal Note (optional) ---- */}
      <div className="mb-4">
        <label
          htmlFor="note"
          className="mb-1 block text-sm font-medium text-gray-700"
        >
          Note{" "}
          <span className="font-normal text-gray-400">(optional)</span>
        </label>
        <input
          id="note"
          type="text"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Your personal annotation..."
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500"
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
          disabled={isSubmitting}
          className="rounded-md bg-gray-900 px-4 py-2 text-sm text-white hover:bg-gray-700 disabled:opacity-50"
        >
          {isSubmitting ? "Saving..." : "Save Record"}
        </button>
      </div>
    </form>
  );
}
