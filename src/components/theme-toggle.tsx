// ============================================================================
// THEME TOGGLE
// ============================================================================
//
// Cycles through three states: system → light → dark → system...
//
// "System" means follow the OS preference (prefers-color-scheme).
// "Light" and "dark" are explicit overrides stored in localStorage.
//
// We need useEffect here because:
//   - localStorage is only available in the browser (not on the server)
//   - We need to read the current theme AFTER the component mounts
//   - The server render doesn't know the theme, so we start with a
//     placeholder and update on mount (this is a common pattern for
//     any browser-only state like localStorage, cookies read client-side, etc.)
// ============================================================================

"use client";

import { useState, useEffect } from "react";

type Theme = "system" | "light" | "dark";

export default function ThemeToggle() {
  // Start with undefined — we don't know the theme until we read localStorage
  const [theme, setTheme] = useState<Theme>("system");

  // On mount: read the saved preference from localStorage
  useEffect(() => {
    const saved = localStorage.getItem("theme") as Theme | null;
    if (saved === "light" || saved === "dark") {
      setTheme(saved);
    } else {
      setTheme("system");
    }
  }, []);

  // Apply the theme whenever it changes
  function applyTheme(newTheme: Theme) {
    setTheme(newTheme);

    if (newTheme === "dark") {
      document.documentElement.classList.add("dark");
      localStorage.setItem("theme", "dark");
    } else if (newTheme === "light") {
      document.documentElement.classList.remove("dark");
      localStorage.setItem("theme", "light");
    } else {
      // System: remove override, follow OS preference
      localStorage.removeItem("theme");
      const prefersDark = window.matchMedia(
        "(prefers-color-scheme: dark)",
      ).matches;
      if (prefersDark) {
        document.documentElement.classList.add("dark");
      } else {
        document.documentElement.classList.remove("dark");
      }
    }
  }

  // Cycle: system → light → dark → system
  function handleToggle() {
    const next: Theme =
      theme === "system" ? "light" : theme === "light" ? "dark" : "system";
    applyTheme(next);
  }

  // Icon changes based on current theme
  const icon = theme === "dark" ? "🌙" : theme === "light" ? "☀️" : "💻";
  const label =
    theme === "dark"
      ? "Dark mode"
      : theme === "light"
        ? "Light mode"
        : "System theme";

  return (
    <button
      onClick={handleToggle}
      className="rounded-md px-3 py-2 text-sm text-gray-600 hover:bg-gray-200 dark:text-gray-300 dark:hover:bg-gray-700"
      aria-label={`Theme: ${label}. Click to change.`}
      title={label}
    >
      {icon}
    </button>
  );
}
