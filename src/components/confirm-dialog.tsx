// ============================================================================
// CONFIRM DIALOG
// ============================================================================
//
// A reusable confirmation modal that replaces window.confirm() across the app.
// Uses Radix AlertDialog — purpose-built for "are you sure?" interruptions.
//
// Why AlertDialog instead of Dialog?
//   - AlertDialog traps focus AND prevents closing by clicking outside.
//     This is intentional for destructive actions — you don't want a
//     misclick on the backdrop to dismiss the warning and proceed.
//   - Dialog allows backdrop-close, which is fine for info modals but
//     wrong for "Delete this record?" confirmations.
//   - AlertDialog also sets role="alertdialog" for screen readers,
//     signaling that this requires user attention before proceeding.
//
// Usage:
//   <ConfirmDialog
//     open={showConfirm}
//     onOpenChange={setShowConfirm}
//     title="Delete record?"
//     description="This can't be undone."
//     confirmLabel="Delete"
//     variant="danger"
//     onConfirm={handleDelete}
//   />
// ============================================================================

"use client";

import * as AlertDialog from "@radix-ui/react-alert-dialog";

type Props = {
  // Controlled open state — the parent manages whether the dialog is visible.
  open: boolean;
  onOpenChange: (open: boolean) => void;

  // Content
  title: string;
  description?: string;

  // Button labels
  confirmLabel?: string;
  cancelLabel?: string;

  // Visual variant — "danger" makes the confirm button red.
  variant?: "danger" | "default";

  // Called when the user clicks the confirm button.
  onConfirm: () => void;

  // Optional: disable the confirm button (e.g., while an action is in progress)
  isConfirming?: boolean;
};

export default function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  variant = "default",
  onConfirm,
  isConfirming = false,
}: Props) {
  return (
    <AlertDialog.Root open={open} onOpenChange={onOpenChange}>
      <AlertDialog.Portal>
        {/* Backdrop overlay — same style as the Dialog in record-card */}
        <AlertDialog.Overlay className="fixed inset-0 z-50 bg-black/50 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0" />

        {/* Dialog content — centered, narrow width for a focused decision */}
        <AlertDialog.Content className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl bg-white p-6 shadow-xl focus:outline-none dark:bg-gray-900">
          <AlertDialog.Title className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            {title}
          </AlertDialog.Title>

          {description && (
            <AlertDialog.Description className="mt-2 text-sm text-gray-500 dark:text-gray-400">
              {description}
            </AlertDialog.Description>
          )}

          {/* Action buttons — right-aligned, cancel first (safer default) */}
          <div className="mt-6 flex justify-end gap-3">
            <AlertDialog.Cancel asChild>
              <button className="rounded-md px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800">
                {cancelLabel}
              </button>
            </AlertDialog.Cancel>

            <AlertDialog.Action asChild>
              <button
                onClick={onConfirm}
                disabled={isConfirming}
                className={`rounded-md px-4 py-2 text-sm font-medium disabled:opacity-50 ${
                  variant === "danger"
                    ? "bg-red-600 text-white hover:bg-red-700 dark:bg-red-700 dark:hover:bg-red-600"
                    : "bg-gray-900 text-white hover:bg-gray-700 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-gray-300"
                }`}
              >
                {isConfirming ? "..." : confirmLabel}
              </button>
            </AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
