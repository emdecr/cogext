// ============================================================================
// CONNECTION PICKER (create-form, deferred linking)
// ============================================================================
//
// Lets the user line up connections to other records WHILE creating a new one,
// before the new record exists. It mirrors how TagInput handles tags: it only
// collects selections into local state (`pendingConnections`); the create form
// attaches them with addRecordLink after the record is saved and has an id.
//
// This is the inline, form-friendly cousin of RecordConnections' AddConnection
// dialog. The dialog links immediately (both records already exist); this one
// defers, so it writes nothing and takes no recordId.
//
// The picker opens on recent records with BOOKS FIRST (getLinkSuggestions) so
// the common "note/quote orbiting a book" case is one tap away, then falls back
// to full search as the user types.
// ============================================================================

"use client";

import { useEffect, useRef, useState } from "react";
import { searchRecords } from "@/lib/actions/search";
import {
  getLinkSuggestions,
  type LinkCandidate,
} from "@/lib/actions/record-links";
import RecordImagePreview from "@/components/record-image-preview";

export type PendingConnection = {
  record: LinkCandidate;
  note: string;
};

// Narrow searchRecords' richer result down to what the picker renders.
function toCandidate(r: {
  id: string;
  type: LinkCandidate["type"];
  title: string | null;
  content: string;
  imagePath: string | null;
}): LinkCandidate {
  return {
    id: r.id,
    type: r.type,
    title: r.title,
    content: r.content,
    imagePath: r.imagePath,
  };
}

export default function ConnectionPicker({
  selected,
  onAdd,
  onRemove,
  onNoteChange,
  disabled = false,
}: {
  selected: PendingConnection[];
  onAdd: (record: LinkCandidate) => void;
  onRemove: (id: string) => void;
  onNoteChange: (id: string, note: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<LinkCandidate[]>([]);
  const [results, setResults] = useState<LinkCandidate[]>([]);
  const [searching, setSearching] = useState(false);
  const suggestionsLoaded = useRef(false);

  const selectedIds = new Set(selected.map((c) => c.record.id));

  // Lazily load the books-first suggestion list the first time the panel opens.
  useEffect(() => {
    if (!open || suggestionsLoaded.current) return;
    suggestionsLoaded.current = true;
    getLinkSuggestions()
      .then(setSuggestions)
      .catch(() => setSuggestions([]));
  }, [open]);

  // Debounced search while typing; empty query falls back to suggestions.
  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    // Track cancellation per effect run: if the query changes (or clears) while
    // a search is in flight, ignore its late resolution so stale hits can't
    // overwrite the current list or spinner state.
    let cancelled = false;
    const handle = setTimeout(async () => {
      try {
        const found = await searchRecords(q);
        if (cancelled) return;
        setResults(found.map(toCandidate));
      } catch {
        if (cancelled) return;
        setResults([]);
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [query]);

  function pick(record: LinkCandidate) {
    onAdd(record);
    // Close the panel on pick — the just-added connection shows above and the
    // user reopens via "+ Add connection" to add another. (Previously the panel
    // stayed open and had to be dismissed with a separate "Done" click.)
    setOpen(false);
    setQuery("");
    setResults([]);
  }

  const showList = query.trim() ? results : suggestions;
  const visibleList = showList.filter((r) => !selectedIds.has(r.id));

  return (
    <div>
      {/* ---- Selected connections ---- */}
      {selected.length > 0 && (
        <ul className="mb-2 space-y-2">
          {selected.map((c) => (
            <li
              key={c.record.id}
              className="rounded-md border border-gray-200 p-2 dark:border-gray-700"
            >
              <div className="flex items-center gap-2">
                {c.record.imagePath && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={c.record.imagePath}
                    alt=""
                    className="h-8 w-8 flex-shrink-0 rounded object-cover"
                  />
                )}
                <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium capitalize text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                  {c.record.type}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm text-gray-800 dark:text-gray-200">
                  {c.record.title || c.record.content.slice(0, 80)}
                </span>
                <button
                  type="button"
                  onClick={() => onRemove(c.record.id)}
                  disabled={disabled}
                  aria-label="Remove connection"
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-sm text-gray-400 hover:bg-gray-100 hover:text-gray-600 disabled:opacity-50 dark:hover:bg-gray-800"
                >
                  ✕
                </button>
              </div>
              <textarea
                value={c.note}
                onChange={(e) => onNoteChange(c.record.id, e.target.value)}
                disabled={disabled}
                rows={2}
                placeholder="Why do these connect? (optional)"
                className="mt-2 w-full rounded-md border border-gray-300 px-2 py-1.5 text-xs text-gray-900 focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
              />
            </li>
          ))}
        </ul>
      )}

      {/* ---- Add control / inline search panel ---- */}
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          disabled={disabled}
          className="rounded-md border border-gray-300 px-2.5 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
        >
          + Add connection
        </button>
      ) : (
        <div className="rounded-md border border-gray-200 p-2 dark:border-gray-700">
          <input
            autoFocus
            type="text"
            inputMode="search"
            autoCapitalize="none"
            autoCorrect="off"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search your records…"
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
          />
          <div className="mt-2 max-h-56 space-y-1 overflow-y-auto">
            {searching && (
              <p className="px-1 text-xs text-gray-400">Searching…</p>
            )}
            {!searching && query.trim() && visibleList.length === 0 && (
              <p className="px-1 text-xs text-gray-400">No matching records.</p>
            )}
            {!query.trim() && visibleList.length > 0 && (
              <p className="px-1 pb-1 text-[11px] uppercase tracking-wide text-gray-400">
                Recent
              </p>
            )}
            {visibleList.map((r) => (
              <RecordImagePreview key={r.id} src={r.imagePath} alt={r.title ?? ""}>
                <button
                  type="button"
                  onClick={() => pick(r)}
                  className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left hover:bg-gray-50 dark:hover:bg-gray-800"
                >
                  {r.imagePath && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={r.imagePath}
                      alt=""
                      className="h-9 w-9 flex-shrink-0 rounded object-cover"
                    />
                  )}
                  <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium capitalize text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                    {r.type}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm text-gray-800 dark:text-gray-200">
                    {r.title || r.content.slice(0, 80)}
                  </span>
                </button>
              </RecordImagePreview>
            ))}
          </div>
          {/* Escape hatch for opening the panel without picking anything.
              Picking a record closes the panel on its own. */}
          <div className="mt-1 flex justify-end">
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setQuery("");
              }}
              className="rounded-md px-3 py-1.5 text-xs text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
