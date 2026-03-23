// ============================================================================
// KEYBOARD SHORTCUTS HOOK
// ============================================================================
//
// Centralizes global keyboard shortcuts for the app. Mounted once at the
// dashboard level, listens for key combos and dispatches custom events
// that individual components can listen for.
//
// Why custom events instead of passing callbacks through props?
//   - The create form is deeply nested and manages its own open/close state.
//     Threading a callback through multiple component layers would be messy.
//   - Custom events decouple the shortcut system from the component tree.
//     Any component can listen for "shortcut:new-record" without the hook
//     knowing about that component.
//
// Safety: shortcuts are IGNORED when the user is typing in an input,
// textarea, or contenteditable element. Without this check, pressing "N"
// while writing a note would open the form instead of typing the letter.
//
// Registered shortcuts:
//   ⌘K / Ctrl+K → Search (handled by CommandPalette directly)
//   N           → New record
//   Esc         → Close whatever's open (handled per-component)
// ============================================================================

"use client";

import { useEffect } from "react";

// Check if the user is currently typing in an input field.
// We don't want single-key shortcuts (like "N") to fire while typing.
function isTyping(): boolean {
  const active = document.activeElement;
  if (!active) return false;

  const tag = active.tagName.toLowerCase();
  if (tag === "input" || tag === "textarea" || tag === "select") return true;

  // contenteditable elements (rich text editors, etc.)
  if (active.getAttribute("contenteditable") === "true") return true;

  return false;
}

export function useKeyboardShortcuts() {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // ---- N → New Record ----
      // Only fires when not in an input and no modifier keys are held.
      // The modifier check prevents conflicts with ⌘N (new browser window),
      // Ctrl+N, etc.
      if (
        e.key === "n" &&
        !e.metaKey &&
        !e.ctrlKey &&
        !e.altKey &&
        !isTyping()
      ) {
        e.preventDefault();
        // Dispatch a custom event that CreateRecordForm listens for.
        window.dispatchEvent(new CustomEvent("shortcut:new-record"));
      }

      // ---- Esc → Close ----
      // Dispatches a generic "close" event. Each component decides whether
      // it has something open to close. Esc is already handled by:
      //   - CommandPalette (closes search)
      //   - Radix Dialog/AlertDialog (closes modals)
      // This event catches anything else (create form, drawers, etc.).
      if (e.key === "Escape") {
        window.dispatchEvent(new CustomEvent("shortcut:close"));
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);
}
