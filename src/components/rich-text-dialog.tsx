// ============================================================================
// RICH TEXT DIALOG
// ============================================================================
//
// A focused, formatting-capable editing surface for a single markdown field
// (record `content` or `note`). Field-agnostic — the caller passes the current
// markdown `value` and gets edited markdown back via `onSave`.
//
// Structure:
//   - Radix Dialog (NOT AlertDialog): we WANT backdrop/Esc close for a
//     non-destructive editing surface. Mirrors record-modal.tsx conventions.
//   - The Tiptap engine lives in rich-text-editor.tsx, loaded with
//     next/dynamic({ ssr:false }) so its bundle is code-split out of the forms.
//   - Dirty guard: closing with unsaved edits asks before discarding, reusing
//     ConfirmDialog. The baseline for "dirty" is the editor's *normalized*
//     initial markdown (via onReady), so round-trip normalization alone never
//     trips the guard.
//
// SECURITY: the editor serializes to markdown with `html:false`, and the app
// renders markdown through <Markdown> without rehype-raw, so nothing here can
// introduce renderable raw HTML.
// ============================================================================

"use client";

import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import dynamic from "next/dynamic";
import ConfirmDialog from "@/components/confirm-dialog";

// Lazy-load the Tiptap-heavy editor. The dialog shell renders instantly; the
// editor engine streams in with a lightweight fallback.
const RichTextEditor = dynamic(() => import("@/components/rich-text-editor"), {
  ssr: false,
  loading: () => (
    <div className="flex min-h-[45vh] flex-1 items-center justify-center text-sm text-gray-400">
      Loading editor…
    </div>
  ),
});

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string; // e.g. "Edit content" / "Edit note"
  value: string; // current markdown
  onSave: (markdown: string) => void;
  placeholder?: string; // reserved for Phase 2 (placeholder extension)
};

export default function RichTextDialog({
  open,
  onOpenChange,
  title,
  value,
  onSave,
}: Props) {
  // `baseline` is the normalized initial markdown; `draft` is the live value.
  // Both are (re)seeded by the editor's onReady each time it mounts (which only
  // happens while `open`), so they start equal and isDirty stays false until a
  // real edit — no reseed effect needed.
  const [baseline, setBaseline] = useState(value);
  const [draft, setDraft] = useState(value);
  const [showDiscard, setShowDiscard] = useState(false);

  const isDirty = draft !== baseline;

  // Radix requests a close (Esc / backdrop / ✕). Intercept to guard unsaved
  // edits — we keep `open` true, so the dialog stays put behind the confirm.
  function handleOpenChange(next: boolean) {
    if (next) {
      onOpenChange(true);
      return;
    }
    if (isDirty) {
      setShowDiscard(true);
      return;
    }
    onOpenChange(false);
  }

  function handleSave() {
    onSave(draft);
    onOpenChange(false);
  }

  return (
    <>
      <Dialog.Root open={open} onOpenChange={handleOpenChange}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50 animate-[fadeIn_150ms_ease-out]" />
          {/* Full-screen sheet on phones/tablets; large centered card at lg.
              This dialog is opened from *inside* the record create/edit modal
              (itself a Radix Dialog). Stop Esc / outside-interaction events from
              bubbling to that parent, or a single Esc would close both and
              discard the whole form. The dirty-guard still runs via
              handleOpenChange below. */}
          <Dialog.Content
            onEscapeKeyDown={(e) => e.stopPropagation()}
            onPointerDownOutside={(e) => e.stopPropagation()}
            onInteractOutside={(e) => e.stopPropagation()}
            className="fixed inset-0 z-50 flex h-[100dvh] w-full flex-col overflow-hidden bg-white shadow-xl focus:outline-none animate-[scaleFadeIn_200ms_ease-out] dark:bg-gray-900 lg:inset-auto lg:left-1/2 lg:top-1/2 lg:h-[85dvh] lg:w-[90vw] lg:max-w-3xl lg:-translate-x-1/2 lg:-translate-y-1/2 lg:rounded-xl"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3 dark:border-gray-800">
              <Dialog.Title className="text-base font-semibold text-gray-900 dark:text-gray-100">
                {title}
              </Dialog.Title>
              <div className="flex items-center gap-2">
                <Dialog.Close asChild>
                  <button
                    type="button"
                    className="rounded-md px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
                  >
                    Cancel
                  </button>
                </Dialog.Close>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={!isDirty}
                  className="rounded-md bg-gray-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-gray-300"
                >
                  Save
                </button>
              </div>
            </div>

            {/* Editor body — only mounted while open so it seeds fresh each time. */}
            {open && (
              <RichTextEditor
                initialValue={value}
                onReady={(md) => {
                  setBaseline(md);
                  setDraft(md);
                }}
                onChange={setDraft}
              />
            )}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <ConfirmDialog
        open={showDiscard}
        onOpenChange={setShowDiscard}
        title="Discard changes?"
        description="Your edits in the editor will be lost."
        confirmLabel="Discard"
        variant="danger"
        onConfirm={() => {
          setShowDiscard(false);
          onOpenChange(false);
        }}
      />
    </>
  );
}
