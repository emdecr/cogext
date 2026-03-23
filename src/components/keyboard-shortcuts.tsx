// ============================================================================
// KEYBOARD SHORTCUTS PROVIDER
// ============================================================================
//
// Thin client component that mounts the useKeyboardShortcuts hook.
// Exists because the dashboard page is a server component and can't
// use hooks directly. This renders nothing — it's a side-effect-only
// component (same pattern as ThemeToggle or CommandPalette).
// ============================================================================

"use client";

import { useKeyboardShortcuts } from "@/hooks/use-keyboard-shortcuts";

export default function KeyboardShortcuts() {
  useKeyboardShortcuts();
  return null; // Renders nothing — just registers the event listeners
}
