// ============================================================================
// ADD TO COLLECTION
// ============================================================================
//
// A small dropdown component that appears inside the record detail modal.
// Shows a list of the user's collections with checkboxes to add/remove
// the current record.
//
// Uses Radix Popover for the dropdown — same library as the reflection
// indicator. The parent passes in the collections list (fetched from server)
// so this component doesn't need its own data fetching.
//
// Design: a simple "Add to collection" button that opens a popover with
// a checklist. Toggling a checkbox immediately calls the server action
// (no separate save step). Same instant-feedback pattern as tag management.
// ============================================================================

"use client";

import { useState, useEffect } from "react";
import * as Popover from "@radix-ui/react-popover";
import {
  addRecordToCollection,
  removeRecordFromCollection,
  getCollections,
  type CollectionSummary,
} from "@/lib/actions/collections";

type Props = {
  recordId: string;
  // IDs of collections this record is already in.
  // We'll fetch this when the popover opens.
  initialCollectionIds?: string[];
};

export default function AddToCollection({
  recordId,
  initialCollectionIds = [],
}: Props) {
  const [collections, setCollections] = useState<CollectionSummary[]>([]);
  const [memberOf, setMemberOf] = useState<Set<string>>(
    new Set(initialCollectionIds)
  );
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  // Fetch collections when the popover opens.
  // We fetch fresh each time to get the latest list.
  useEffect(() => {
    if (!isOpen) return;

    setIsLoading(true);
    getCollections().then((data) => {
      setCollections(data);
      setIsLoading(false);
    });
  }, [isOpen]);

  async function handleToggle(collectionId: string) {
    const isCurrentlyMember = memberOf.has(collectionId);

    // Optimistic update — update the UI immediately, then send the request.
    // If the request fails, we'd ideally revert, but for a personal app
    // this level of optimism is fine.
    const updated = new Set(memberOf);
    if (isCurrentlyMember) {
      updated.delete(collectionId);
    } else {
      updated.add(collectionId);
    }
    setMemberOf(updated);

    // Fire the server action
    if (isCurrentlyMember) {
      await removeRecordFromCollection(collectionId, recordId);
    } else {
      await addRecordToCollection(collectionId, recordId);
    }
  }

  return (
    <Popover.Root open={isOpen} onOpenChange={setIsOpen}>
      <Popover.Trigger asChild>
        <button className="rounded-md px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800">
          + Collection
        </button>
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={4}
          className="z-[60] w-56 rounded-lg border border-gray-200 bg-white p-2 shadow-lg dark:border-gray-700 dark:bg-gray-900"
        >
          <p className="mb-1.5 px-1 text-xs font-medium text-gray-500 dark:text-gray-400">
            Add to collection
          </p>

          {isLoading ? (
            <p className="px-1 py-2 text-xs text-gray-400">Loading...</p>
          ) : collections.length === 0 ? (
            <p className="px-1 py-2 text-xs text-gray-400">
              No collections yet. Create one from the Filters drawer.
            </p>
          ) : (
            <div className="max-h-48 space-y-0.5 overflow-y-auto">
              {collections.map((c) => (
                <button
                  key={c.id}
                  onClick={() => handleToggle(c.id)}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-gray-700 transition-colors hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
                >
                  {/* Checkbox indicator */}
                  <span
                    className={`flex h-4 w-4 items-center justify-center rounded border text-xs ${
                      memberOf.has(c.id)
                        ? "border-gray-900 bg-gray-900 text-white dark:border-gray-100 dark:bg-gray-100 dark:text-gray-900"
                        : "border-gray-300 dark:border-gray-600"
                    }`}
                  >
                    {memberOf.has(c.id) && "✓"}
                  </span>
                  <span className="truncate">{c.name}</span>
                </button>
              ))}
            </div>
          )}

          <Popover.Arrow className="fill-white dark:fill-gray-900" />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
