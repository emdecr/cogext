// ============================================================================
// RECORD CONNECTIONS (manual links + inline-ref mentions, one list)
// ============================================================================
//
// Phase 5 UI. Shows the deliberate connections a user has drawn from this
// record, each with its "why" note, and an "Add connection" flow that searches
// the user's other records and links one (with an optional note).
//
// Records related through inline refs share the list (mergeConnections): one
// card per record, badged Linked / Mentions this / Mentioned here. Mention-only
// cards can't be removed here (the ref lives in prose) but offer "+ Connect" to
// promote them to a link. See plans/2026-11-01-unified-connections.md.
//
// Visually distinct from the emergent "Related" list: connections are the
// curated, intentional graph, so they get a note and edit/remove controls.
//
// Data comes from the server (getRecordConnections, passed in as a prop). After
// any mutation we router.refresh() so the server re-reads — no local list state
// to drift.
// ============================================================================

"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import * as Dialog from "@radix-ui/react-dialog";
import RecordMiniCard from "@/components/record-mini-card";
import RecordImagePreview from "@/components/record-image-preview";
import ConfirmDialog from "@/components/confirm-dialog";
import { searchRecords } from "@/lib/actions/search";
import {
  addRecordLink,
  removeRecordLink,
  updateRecordLinkNote,
} from "@/lib/actions/record-links";
import { mergeConnections, type UnifiedConnection } from "@/lib/connections";
import type {
  RecordConnection,
  RelatedRecord,
} from "@/lib/validations/records";

type SearchResult = Awaited<ReturnType<typeof searchRecords>>[number];

// The record chosen in the add dialog — from search, or pre-filled by a
// mention-only card's "+ Connect".
type PickedRecord = { id: string; type: string; label: string };

export default function RecordConnections({
  recordId,
  connections,
  mentionsIn,
  mentionsOut,
}: {
  recordId: string;
  connections: RecordConnection[];
  mentionsIn: RelatedRecord[];
  mentionsOut: RelatedRecord[];
}) {
  const router = useRouter();
  const [addOpen, setAddOpen] = useState(false);
  const [addTarget, setAddTarget] = useState<PickedRecord | null>(null);

  const items = mergeConnections({ connections, mentionsIn, mentionsOut });

  // Ids already linked (plus self) — excluded from the add picker. Mention-only
  // records stay pickable.
  const excludedIds = new Set<string>([
    recordId,
    ...connections.map((c) => c.record.id),
  ]);

  function openAdd(target: PickedRecord | null) {
    setAddTarget(target);
    setAddOpen(true);
  }

  return (
    <div className="mt-8 border-t border-gray-100 pt-6 dark:border-gray-800">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
          Connections
        </p>
        <button
          type="button"
          onClick={() => openAdd(null)}
          className="rounded-md border border-gray-300 px-2.5 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
        >
          + Add connection
        </button>
      </div>

      {items.length === 0 ? (
        <p className="text-xs text-gray-400 dark:text-gray-500">
          No connections yet. Link this to another record and note why they
          connect, or mention one inline with [[.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {items.map((c) => (
            <ConnectionItem
              // Keyed on the link too: adding/replacing a link remounts the
              // item so its note draft starts from the current note.
              key={`${c.record.id}:${c.link?.linkId ?? "mention"}`}
              connection={c}
              onConnect={() =>
                openAdd({
                  id: c.record.id,
                  type: c.record.type,
                  label: c.record.title || c.record.preview.slice(0, 80),
                })
              }
              onChanged={() => router.refresh()}
            />
          ))}
        </div>
      )}

      <AddConnectionDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        recordId={recordId}
        initialSelected={addTarget}
        excludedIds={excludedIds}
        onAdded={() => {
          setAddOpen(false);
          router.refresh();
        }}
      />
    </div>
  );
}

// ============================================================================
// One connection: the record's card, its badges, and — when linked — its note
// and edit/remove controls; when mention-only, a "+ Connect" button
// ============================================================================

const BADGE_CLASS =
  "rounded-full px-1.5 py-px text-[10px] font-medium leading-tight";
const LINKED_BADGE_CLASS = `${BADGE_CLASS} bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300`;
// Violet matches the inline record-ref chip, tying mentions to the prose.
const MENTION_BADGE_CLASS = `${BADGE_CLASS} bg-violet-50 text-violet-700 dark:bg-violet-950/60 dark:text-violet-300`;

function ConnectionItem({
  connection,
  onConnect,
  onChanged,
}: {
  connection: UnifiedConnection;
  onConnect: () => void;
  onChanged: () => void;
}) {
  const { link, mentionsThis, mentionedHere } = connection;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(link?.note ?? "");
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [pending, startTransition] = useTransition();

  function saveNote() {
    if (!link) return;
    startTransition(async () => {
      const result = await updateRecordLinkNote(link.linkId, draft);
      if (!result.success) {
        alert(result.error || "Failed to save note");
        return;
      }
      setEditing(false);
      onChanged();
    });
  }

  function remove() {
    if (!link) return;
    startTransition(async () => {
      const result = await removeRecordLink(link.linkId);
      setConfirmRemove(false);
      if (!result.success) {
        alert(result.error || "Failed to remove connection");
        return;
      }
      onChanged();
    });
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="relative">
        <RecordMiniCard record={connection.record} />
        {/* Remove sits over the card corner; it's outside the card's <Link>.
            Only links can be removed here — a mention lives in prose. */}
        {link && (
          <button
            type="button"
            onClick={() => setConfirmRemove(true)}
            disabled={pending}
            aria-label="Remove connection"
            className="absolute right-1.5 top-1.5 rounded-full bg-black/50 px-1.5 py-0.5 text-xs leading-none text-white hover:bg-black/70 disabled:opacity-50"
          >
            ✕
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-1">
        {link && <span className={LINKED_BADGE_CLASS}>Linked</span>}
        {mentionsThis && (
          <span
            className={MENTION_BADGE_CLASS}
            title="That record links to this one in its text"
          >
            Mentions this
          </span>
        )}
        {mentionedHere && (
          <span
            className={MENTION_BADGE_CLASS}
            title="This record links to it in its text"
          >
            Mentioned here
          </span>
        )}
      </div>

      {!link ? (
        <button
          type="button"
          onClick={onConnect}
          className="w-fit text-[11px] font-medium text-blue-600 hover:underline dark:text-blue-400"
        >
          + Connect
        </button>
      ) : editing ? (
        <div className="flex flex-col gap-1">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={2}
            placeholder="Why do these connect?"
            className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-xs text-gray-900 focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={saveNote}
              disabled={pending}
              className="text-xs font-medium text-blue-600 hover:underline disabled:opacity-50 dark:text-blue-400"
            >
              {pending ? "Saving…" : "Save"}
            </button>
            <button
              type="button"
              onClick={() => {
                setDraft(link.note ?? "");
                setEditing(false);
              }}
              className="text-xs text-gray-400 hover:underline"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : link.note ? (
        <div className="flex flex-col gap-0.5">
          <p className="text-xs italic text-gray-600 dark:text-gray-400">
            {link.note}
          </p>
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="w-fit text-[11px] font-medium text-blue-600 hover:underline dark:text-blue-400"
          >
            Edit note
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="w-fit text-[11px] font-medium text-blue-600 hover:underline dark:text-blue-400"
        >
          + Add a note
        </button>
      )}

      {/* Removing drops the link and its note — confirm first. */}
      <ConfirmDialog
        open={confirmRemove}
        onOpenChange={setConfirmRemove}
        title="Remove connection?"
        description={
          (link?.note
            ? "This unlinks the records and deletes the note on this connection. The records themselves are kept."
            : "This unlinks the records. The records themselves are kept.") +
          (mentionsThis || mentionedHere
            ? " It stays listed here because one mentions the other in its text."
            : "")
        }
        confirmLabel="Remove"
        variant="danger"
        onConfirm={remove}
        isConfirming={pending}
      />
    </div>
  );
}

// ============================================================================
// Add-connection dialog: search the user's records, pick one, note why
// ============================================================================

function AddConnectionDialog({
  open,
  onOpenChange,
  recordId,
  initialSelected,
  excludedIds,
  onAdded,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  recordId: string;
  // Pre-selected record (from "+ Connect") — skips straight to the note step.
  initialSelected: PickedRecord | null;
  excludedIds: Set<string>;
  onAdded: () => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<PickedRecord | null>(null);
  const [note, setNote] = useState("");
  const [pending, startTransition] = useTransition();

  // Reset everything whenever the dialog opens/closes; on open, start from the
  // pre-selected record if there is one.
  useEffect(() => {
    if (open) {
      setSelected(initialSelected);
    } else {
      setQuery("");
      setResults([]);
      setSelected(null);
      setNote("");
    }
  }, [open, initialSelected]);

  // Debounced search on the query (skip while a record is selected).
  useEffect(() => {
    if (selected) return;
    const q = query.trim();
    if (!q) {
      setResults([]);
      return;
    }
    setSearching(true);
    const handle = setTimeout(async () => {
      try {
        const found = await searchRecords(q);
        setResults(found.filter((r) => !excludedIds.has(r.id)));
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 250);
    return () => clearTimeout(handle);
    // excludedIds is derived fresh each render; intentionally not a dep.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, selected]);

  function confirm() {
    if (!selected) return;
    startTransition(async () => {
      const result = await addRecordLink({
        recordId,
        relatedRecordId: selected.id,
        note,
      });
      if (!result.success) {
        alert(result.error || "Failed to add connection");
        return;
      }
      onAdded();
    });
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[60] bg-black/50 animate-[fadeIn_150ms_ease-out]" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[60] flex max-h-[80vh] w-[92vw] max-w-lg -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-xl bg-white shadow-xl focus:outline-none dark:bg-gray-900">
          <div className="flex items-center justify-between border-b border-gray-200 px-5 py-3 dark:border-gray-700">
            <Dialog.Title className="text-sm font-semibold text-gray-900 dark:text-gray-100">
              {selected ? "Add a note (optional)" : "Link another record"}
            </Dialog.Title>
            <Dialog.Close
              className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800"
              aria-label="Close"
            >
              ✕
            </Dialog.Close>
          </div>

          <div className="flex-1 overflow-y-auto p-5">
            {!selected ? (
              <>
                <input
                  autoFocus
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search your records…"
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                />
                <div className="mt-3 space-y-1">
                  {searching && (
                    <p className="px-1 text-xs text-gray-400">Searching…</p>
                  )}
                  {!searching && query.trim() && results.length === 0 && (
                    <p className="px-1 text-xs text-gray-400">
                      No matching records.
                    </p>
                  )}
                  {results.map((r) => (
                    // Hovering an image record's row pops a larger preview,
                    // so image records are identifiable in the picker.
                    <RecordImagePreview
                      key={r.id}
                      src={r.imagePath}
                      alt={r.title ?? ""}
                    >
                      <button
                        type="button"
                        onClick={() =>
                          setSelected({
                            id: r.id,
                            type: r.type,
                            label: r.title || r.content.slice(0, 80),
                          })
                        }
                        className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left hover:bg-gray-50 dark:hover:bg-gray-800"
                      >
                        {/* Inline thumbnail anchor (larger preview on row hover) */}
                        {r.imagePath && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={r.imagePath}
                            alt=""
                            className="h-10 w-10 flex-shrink-0 rounded object-cover"
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
              </>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center gap-3 rounded-md border border-gray-200 px-3 py-2 dark:border-gray-700">
                  <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium capitalize text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                    {selected.type}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm text-gray-800 dark:text-gray-200">
                    {selected.label}
                  </span>
                  <button
                    type="button"
                    onClick={() => setSelected(null)}
                    className="shrink-0 text-xs text-gray-400 hover:underline"
                  >
                    change
                  </button>
                </div>
                <textarea
                  autoFocus
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={3}
                  placeholder="Why do these connect? (optional)"
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                />
              </div>
            )}
          </div>

          {selected && (
            <div className="flex justify-end gap-2 border-t border-gray-200 px-5 py-3 dark:border-gray-700">
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                className="rounded-md px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirm}
                disabled={pending}
                className="rounded-md bg-gray-900 px-4 py-1.5 text-sm text-white hover:bg-gray-700 disabled:opacity-50 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-gray-300"
              >
                {pending ? "Linking…" : "Link records"}
              </button>
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
