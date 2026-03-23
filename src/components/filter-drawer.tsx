// ============================================================================
// FILTER DRAWER
// ============================================================================
//
// A slide-out panel from the right side of the screen. Houses tag filters
// and collections — things that would clutter the main filter bar if inline.
//
// The drawer overlays the grid with a semi-transparent backdrop.
// Clicking the backdrop or the close button dismisses it.
//
// Filter state is owned by RecordGrid (the parent). This component
// just renders the controls and calls callbacks — same pattern as FilterBar.
//
// Collections are shown as links to their detail pages. A "New collection"
// input lets you create one inline without leaving the drawer.
// ============================================================================

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createCollection } from "@/lib/actions/collections";

type CollectionSummary = {
  id: string;
  name: string;
  description: string | null;
  coverImage: string | null;
  recordCount: number;
  createdAt: Date;
};

type FilterDrawerProps = {
  isOpen: boolean;
  onClose: () => void;

  // Tag filtering
  activeTag: string | null;
  onTagChange: (tag: string | null) => void;
  availableTags: { name: string; count: number }[];

  // Collections
  collections: CollectionSummary[];
};

export default function FilterDrawer({
  isOpen,
  onClose,
  activeTag,
  onTagChange,
  availableTags,
  collections,
}: FilterDrawerProps) {
  const router = useRouter();

  // ---- New collection inline creation ----
  // Instead of a separate page/modal, we let you type a name and create
  // right here. Keeps the flow fast — you're already in the drawer.
  const [isCreating, setIsCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleCreateCollection(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;

    setCreateError(null);
    setIsSubmitting(true);

    // createCollection expects FormData (server action convention).
    const formData = new FormData();
    formData.append("name", newName.trim());

    const result = await createCollection(formData);
    setIsSubmitting(false);

    if (!result.success) {
      setCreateError(result.error || "Failed to create collection");
      return;
    }

    // Reset the form and navigate to the new collection
    setNewName("");
    setIsCreating(false);
    onClose();

    if (result.data?.id) {
      router.push(`/collections/${result.data.id}`);
    }
  }

  return (
    <>
      {/* ---- Backdrop ---- */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/30 animate-[fadeIn_150ms_ease-out]"
          onClick={onClose}
        />
      )}

      {/* ---- Drawer panel ---- */}
      <div
        className={`fixed right-0 top-0 z-50 flex h-full w-80 flex-col bg-white shadow-xl transition-transform duration-200 ease-in-out dark:bg-gray-900 ${
          isOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3 dark:border-gray-700">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
            Filters
          </h2>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800 dark:hover:text-gray-300"
          >
            ✕
          </button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto px-4 py-4">
          {/* ---- Tags section ---- */}
          <div className="mb-6">
            <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
              Tags
            </h3>

            {availableTags.length === 0 ? (
              <p className="text-sm text-gray-400 dark:text-gray-500">
                No tags yet. Tags appear as you create and tag records.
              </p>
            ) : (
              <div className="space-y-1">
                {availableTags.map(({ name, count }) => (
                  <button
                    key={name}
                    onClick={() => {
                      // Toggle: clicking active tag clears it
                      onTagChange(activeTag === name ? null : name);
                    }}
                    className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-sm transition-colors ${
                      activeTag === name
                        ? "bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900"
                        : "text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
                    }`}
                  >
                    <span>{name}</span>
                    <span
                      className={`text-xs ${
                        activeTag === name
                          ? "text-gray-300 dark:text-gray-600"
                          : "text-gray-400 dark:text-gray-500"
                      }`}
                    >
                      {count}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* ---- Collections section ---- */}
          <div className="mb-6">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                Collections
              </h3>
              {/* Toggle the inline creation form */}
              {!isCreating && (
                <button
                  onClick={() => setIsCreating(true)}
                  className="text-xs text-gray-400 transition-colors hover:text-gray-600 dark:hover:text-gray-300"
                >
                  + New
                </button>
              )}
            </div>

            {/* Inline create form — appears when "+ New" is clicked */}
            {isCreating && (
              <form onSubmit={handleCreateCollection} className="mb-3">
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Collection name..."
                  autoFocus
                  className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:placeholder:text-gray-500"
                />
                {createError && (
                  <p className="mt-1 text-xs text-red-500">{createError}</p>
                )}
                <div className="mt-1.5 flex gap-1.5">
                  <button
                    type="submit"
                    disabled={isSubmitting || !newName.trim()}
                    className="rounded-md bg-gray-900 px-2.5 py-1 text-xs text-white hover:bg-gray-700 disabled:opacity-50 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-gray-300"
                  >
                    {isSubmitting ? "Creating..." : "Create"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsCreating(false);
                      setNewName("");
                      setCreateError(null);
                    }}
                    className="rounded-md px-2.5 py-1 text-xs text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )}

            {/* Collection list */}
            {collections.length === 0 && !isCreating ? (
              <p className="text-sm text-gray-400 dark:text-gray-500">
                No collections yet. Create one to organize your records.
              </p>
            ) : (
              <div className="space-y-1">
                {collections.map((collection) => (
                  <button
                    key={collection.id}
                    onClick={() => {
                      onClose();
                      router.push(`/collections/${collection.id}`);
                    }}
                    className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-sm text-gray-700 transition-colors hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
                  >
                    <span className="truncate">{collection.name}</span>
                    <span className="ml-2 flex-shrink-0 text-xs text-gray-400 dark:text-gray-500">
                      {collection.recordCount}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer — clear all filters */}
        {activeTag && (
          <div className="border-t border-gray-200 px-4 py-3 dark:border-gray-700">
            <button
              onClick={() => {
                onTagChange(null);
              }}
              className="w-full rounded-md px-3 py-2 text-sm text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
            >
              Clear all filters
            </button>
          </div>
        )}
      </div>
    </>
  );
}
