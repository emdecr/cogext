"use client";
// =============================================================================
// GLOBAL ERROR BOUNDARY
// =============================================================================
//
// This catches errors in the ROOT LAYOUT (src/app/layout.tsx) itself.
// That's rare — layout errors usually mean fonts didn't load, the theme
// script broke, or a provider at the top level threw.
//
// Key difference from error.tsx:
//   error.tsx     — catches errors INSIDE the root layout (pages, nested layouts)
//   global-error.tsx — catches errors IN the root layout component itself
//
// Because the root layout is broken, we can't use its HTML/CSS structure.
// This component must include its own <html> and <body> tags.
//
// This is the "last resort" error boundary — if this fires, something
// fundamental is broken. Keep the UI dead simple and functional.
// =============================================================================

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[GlobalError]", error.message, error.digest ?? "");
  }, [error]);

  // Must provide our own <html> and <body> — the root layout is broken.
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#FAFAF9",
          fontFamily:
            "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        }}
      >
        <div style={{ maxWidth: 400, padding: "0 24px", textAlign: "center" }}>
          <h1
            style={{
              fontSize: 20,
              fontWeight: 500,
              color: "#1A1A1A",
              marginBottom: 8,
            }}
          >
            Application error
          </h1>
          <p
            style={{
              fontSize: 14,
              color: "#6B6B6B",
              marginBottom: 24,
              lineHeight: 1.6,
            }}
          >
            The application encountered a critical error. Please try refreshing
            the page.
          </p>
          <button
            onClick={reset}
            style={{
              padding: "10px 24px",
              background: "#1A1A1A",
              color: "#fff",
              border: "none",
              borderRadius: 8,
              fontSize: 14,
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            Refresh
          </button>
        </div>
      </body>
    </html>
  );
}
