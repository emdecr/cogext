// ============================================================================
// COMMAND PALETTE
// ============================================================================
//
// A ⌘K (Cmd+K / Ctrl+K) modal for searching records. Combines semantic
// search (meaning-based via embeddings) with keyword search (exact matches).
//
// UX pattern inspired by VS Code, Linear, GitHub, etc.:
//   - ⌘K to open
//   - Type to search (debounced — waits for you to stop typing)
//   - Results appear below the input
//   - Click a result to open the record
//   - Escape or click backdrop to close
//
// Debouncing: We wait 300ms after the user stops typing before searching.
// Without this, every keystroke would trigger an embedding + DB query.
// "healthy" would fire 7 searches (h, he, hea, heal, ...) instead of 1.
// ============================================================================

"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { searchRecords } from "@/lib/actions/search";
import Skeleton from "@/components/skeleton";

// Type for search results (matches what the server action returns)
type SearchResult = {
  id: string;
  type: "image" | "quote" | "article" | "link" | "note";
  title: string | null;
  content: string;
  sourceUrl: string | null;
  sourceAuthor: string | null;
  imagePath: string | null;
  note: string | null;
  createdAt: Date;
  score: number;
  matchType: "semantic" | "keyword" | "both";
};

// Color mapping for type badges (same as record-card)
const TYPE_COLORS: Record<string, string> = {
  note: "bg-blue-100 text-blue-700",
  quote: "bg-amber-100 text-amber-700",
  article: "bg-green-100 text-green-700",
  link: "bg-purple-100 text-purple-700",
  image: "bg-pink-100 text-pink-700",
};

// Match type labels for showing which search method found the result
const MATCH_LABELS: Record<string, string> = {
  semantic: "meaning",
  keyword: "keyword",
  both: "meaning + keyword",
};

export default function CommandPalette() {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // ---- Keyboard shortcut: ⌘K / Ctrl+K ----
  // We listen for the key combo globally and toggle the palette.
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // ⌘K on Mac, Ctrl+K on Windows/Linux
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault(); // Prevent browser's default (e.g., Chrome address bar)
        setIsOpen((prev) => !prev);
      }

      // Escape closes the palette
      if (e.key === "Escape" && isOpen) {
        setIsOpen(false);
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  // ---- Auto-focus input when palette opens ----
  useEffect(() => {
    if (isOpen) {
      // Small timeout to let the DOM render before focusing.
      // Without this, focus can race with the mount animation.
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      // Clear state when closing so it's fresh next time
      setQuery("");
      setResults([]);
    }
  }, [isOpen]);

  // ---- Debounced search ----
  // useCallback memoizes the search function so it doesn't change on
  // every render (which would break the useEffect dependency array).
  const performSearch = useCallback(async (searchQuery: string) => {
    if (!searchQuery.trim()) {
      setResults([]);
      return;
    }

    setIsSearching(true);
    const searchResults = await searchRecords(searchQuery);
    setResults(searchResults);
    setIsSearching(false);
  }, []);

  // Debounce: wait 300ms after the user stops typing
  useEffect(() => {
    // Set a timer. If the user types again before 300ms, we clear
    // the old timer and start a new one. Only the final keystroke
    // (after 300ms of silence) triggers the search.
    const timer = setTimeout(() => {
      performSearch(query);
    }, 300);

    // Cleanup: clear the timer if the query changes before 300ms
    return () => clearTimeout(timer);
  }, [query, performSearch]);

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop — fades in for a smooth appearance */}
      <div
        className="fixed inset-0 z-50 bg-black/50 animate-[fadeIn_150ms_ease-out]"
        onClick={() => setIsOpen(false)}
      />

      {/* Palette — slides down from slightly above its resting position */}
      <div className="fixed left-1/2 top-[15%] z-50 w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 overflow-hidden rounded-xl bg-white shadow-2xl animate-[slideDownFadeIn_200ms_ease-out] dark:bg-gray-900">
        {/* Search input */}
        <div className="flex items-center border-b border-gray-200 px-4 dark:border-gray-700">
          {/* Search icon */}
          <svg
            className="h-4 w-4 text-gray-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search your records..."
            className="w-full bg-transparent px-3 py-3 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none dark:text-gray-100 dark:placeholder:text-gray-500"
          />
          {/* Keyboard shortcut hint */}
          <kbd className="rounded border border-gray-200 px-1.5 py-0.5 text-[10px] text-gray-400 dark:border-gray-700">
            ESC
          </kbd>
        </div>

        {/* Results */}
        <div className="max-h-[60vh] overflow-y-auto">
          {/* Loading state — skeleton placeholders instead of "Searching..." text.
              Shows the shape of results so the layout doesn't jump when they arrive. */}
          {isSearching && (
            <div className="space-y-1 p-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex items-start gap-3 px-2 py-2.5">
                  <Skeleton className="h-5 w-14 rounded-full" />
                  <div className="flex-1 space-y-1.5">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-3 w-full" />
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* No results */}
          {!isSearching && query.trim() && results.length === 0 && (
            <div className="px-4 py-6 text-center text-sm text-gray-400 dark:text-gray-500">
              No results found for &ldquo;{query}&rdquo;
            </div>
          )}

          {/* Empty state (no query yet) */}
          {!query.trim() && !isSearching && (
            <div className="px-4 py-6 text-center text-sm text-gray-400 dark:text-gray-500">
              Type to search by meaning or keywords
            </div>
          )}

          {/* Result list */}
          {!isSearching &&
            results.map((result) => (
              <button
                key={result.id}
                onClick={() => {
                  // Close palette — in a future pass, this could scroll
                  // to the record or open the detail modal directly
                  setIsOpen(false);
                }}
                className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-800"
              >
                {/* Image thumbnail (if applicable) */}
                {result.imagePath && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={result.imagePath}
                    alt=""
                    className="h-10 w-10 flex-shrink-0 rounded object-cover"
                  />
                )}

                <div className="min-w-0 flex-1">
                  {/* Title + type badge */}
                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-block rounded-full px-1.5 py-0.5 text-[10px] font-medium capitalize ${TYPE_COLORS[result.type] || "bg-gray-100 text-gray-700"}`}
                    >
                      {result.type}
                    </span>
                    <span className="truncate text-sm font-medium text-gray-900 dark:text-gray-100">
                      {result.title ||
                        result.content.slice(0, 50) +
                          (result.content.length > 50 ? "..." : "")}
                    </span>
                  </div>

                  {/* Content preview */}
                  <p className="mt-0.5 truncate text-xs text-gray-500 dark:text-gray-400">
                    {result.content.slice(0, 100)}
                    {result.content.length > 100 ? "..." : ""}
                  </p>

                  {/* Match type indicator */}
                  <p className="mt-0.5 text-[10px] text-gray-400 dark:text-gray-500">
                    matched by {MATCH_LABELS[result.matchType]}
                  </p>
                </div>
              </button>
            ))}
        </div>
      </div>
    </>
  );
}
