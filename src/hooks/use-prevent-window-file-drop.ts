// ============================================================================
// PREVENT WINDOW FILE DROP HOOK
// ============================================================================
//
// Used by the image dropzones (image-type field in create-record-form.tsx,
// book cover in cover-image-input.tsx). A file released just outside a drop
// target hits the browser default, which navigates away to open the file and
// throws away the unsaved form. While enabled, this swallows file drags/drops
// anywhere on the window so a near-miss does nothing instead.
//
// Only "Files" drags are touched, so in-page drag-and-drop (e.g. reordering
// records in a collection) keeps working. The dropzones' own onDrop handlers
// still fire — React handles them before the event bubbles to window.
// ============================================================================

"use client";

import { useEffect } from "react";

export function usePreventWindowFileDrop(enabled = true) {
  useEffect(() => {
    if (!enabled) return;

    function preventFileDrop(e: DragEvent) {
      if (!e.dataTransfer?.types.includes("Files")) return;
      e.preventDefault();
    }

    window.addEventListener("dragover", preventFileDrop);
    window.addEventListener("drop", preventFileDrop);
    return () => {
      window.removeEventListener("dragover", preventFileDrop);
      window.removeEventListener("drop", preventFileDrop);
    };
  }, [enabled]);
}
