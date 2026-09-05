// ============================================================================
// MARKDOWN FIELD
// ============================================================================
//
// A drop-in replacement for the plain <textarea> + label + error blocks in the
// create/edit record forms. The textarea stays the default, quick-capture
// control; a small "Open editor" button promotes the current value into the
// RichTextDialog (Chunk 2) for focused, formatting-capable editing.
//
// The field only ever deals in markdown strings, so wiring is trivial: pass the
// same `value`/`onChange` the textarea used, and edits made in the dialog flow
// straight back through `onChange`.
// ============================================================================

"use client";

import { useState } from "react";
import RichTextDialog from "@/components/rich-text-dialog";

// Mirrors the inputClass/labelClass constants in the record forms so the
// textarea looks identical whether it's a raw <textarea> or inside this field.
const inputClass =
  "w-full rounded-md border border-gray-300 px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:placeholder:text-gray-500 dark:focus:border-gray-400 dark:focus:ring-gray-400";

const labelTextClass =
  "text-sm font-medium text-gray-700 dark:text-gray-300";

type Props = {
  id: string;
  // ReactNode (not string) so callers can keep their existing labels, including
  // the "(optional)" spans and "Description" vs "Content" wording.
  label: React.ReactNode;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  placeholder?: string;
  rows?: number;
  disabled?: boolean;
  // Title shown in the RichTextDialog header, e.g. "Edit content".
  dialogTitle: string;
};

export default function MarkdownField({
  id,
  label,
  value,
  onChange,
  error,
  placeholder,
  rows = 8,
  disabled = false,
  dialogTitle,
}: Props) {
  const [open, setOpen] = useState(false);

  return (
    <div>
      {/* Field header: label on the left, "Open editor" affordance on the right. */}
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <label htmlFor={id} className={labelTextClass}>
          {label}
        </label>
        <button
          type="button"
          onClick={() => setOpen(true)}
          disabled={disabled}
          className="inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 disabled:opacity-40 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200"
        >
          Open editor <span aria-hidden="true">⤢</span>
        </button>
      </div>

      <textarea
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        disabled={disabled}
        className={inputClass}
      />

      {error && <p className="mt-1 text-sm text-red-500">{error}</p>}

      <RichTextDialog
        open={open}
        onOpenChange={setOpen}
        title={dialogTitle}
        value={value}
        onSave={onChange}
        placeholder={placeholder}
      />
    </div>
  );
}
