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
//
// Uses SVG icons instead of emoji for consistent rendering across platforms.
// Styled to match the other header buttons (bg, padding, hover).
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

  const label =
    theme === "dark"
      ? "Dark mode"
      : theme === "light"
        ? "Light mode"
        : "System theme";

  return (
    <button
      onClick={handleToggle}
      className="flex h-9 items-center rounded-md bg-gray-200 px-3 text-sm text-gray-700 hover:bg-gray-300 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
      aria-label={`Theme: ${label}. Click to change.`}
      title={label}
    >
      {/* Sun icon — shown in light mode */}
      {theme === "light" && (
        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M12 3v1m0 16v1m-8-9H3m18 0h-1m-2.636-6.364l-.707.707M6.343 17.657l-.707.707m12.728 0l-.707-.707M6.343 6.343l-.707-.707M12 8a4 4 0 100 8 4 4 0 000-8z"
          />
        </svg>
      )}

      {/* Moon icon — shown in dark mode */}
      {theme === "dark" && (
        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"
          />
        </svg>
      )}

      {/* Monitor icon — shown in system mode */}
      {theme === "system" && (
        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
          />
        </svg>
      )}
    </button>
  );
}
