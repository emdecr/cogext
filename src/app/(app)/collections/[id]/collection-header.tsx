// ============================================================================
// COLLECTION HEADER (Client Component)
// ============================================================================
//
// Displays the collection name, description, and record count.
// Supports inline renaming (click the name to edit) and deletion.
//
// Client component because it needs:
//   - useState for edit mode and form values
//   - onClick handlers for rename/delete
//   - useRouter for navigation after delete
// ============================================================================

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  renameCollection,
  deleteCollection,
} from "@/lib/actions/collections";
import ConfirmDialog from "@/components/confirm-dialog";

type Props = {
  id: string;
  name: string;
  description: string | null;
  recordCount: number;
};

export default function CollectionHeader({
  id,
  name,
  description,
  recordCount,
}: Props) {
  const router = useRouter();
  const [isRenaming, setIsRenaming] = useState(false);
  const [editName, setEditName] = useState(name);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  async function handleRename(e: React.FormEvent) {
    e.preventDefault();
    if (!editName.trim() || editName.trim() === name) {
      setIsRenaming(false);
      setEditName(name);
      return;
    }

    const result = await renameCollection(id, editName.trim());
    if (result.success) {
      setIsRenaming(false);
      // Page data will refresh via revalidatePath
    }
  }

  async function handleDelete() {
    setIsDeleting(true);
    const result = await deleteCollection(id);
    if (result.success) {
      router.push("/dashboard");
    } else {
      alert(result.error || "Failed to delete collection");
      setIsDeleting(false);
      setShowDeleteConfirm(false);
    }
  }

  return (
    <div className="mt-4 mb-2">
      {/* Name — click to edit, or show an input when renaming */}
      {isRenaming ? (
        <form onSubmit={handleRename} className="flex items-center gap-2">
          <input
            type="text"
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            autoFocus
            // Submit on blur too — feels natural, like renaming a file
            onBlur={handleRename}
            className="rounded-md border border-gray-300 px-2 py-1 text-2xl font-bold text-gray-900 focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
          />
        </form>
      ) : (
        <div className="flex items-center gap-3">
          <h1
            onClick={() => setIsRenaming(true)}
            className="cursor-pointer text-2xl font-bold text-gray-900 hover:text-gray-600 dark:text-gray-100 dark:hover:text-gray-300"
            title="Click to rename"
          >
            {name}
          </h1>

          {/* Delete button — opens confirm dialog */}
          <button
            onClick={() => setShowDeleteConfirm(true)}
            disabled={isDeleting}
            className="rounded-md px-2 py-1 text-xs text-red-500 hover:bg-red-50 disabled:opacity-50 dark:hover:bg-red-950"
            title="Delete collection"
          >
            {isDeleting ? "Deleting..." : "Delete"}
          </button>
        </div>
      )}

      {/* Description */}
      {description && (
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          {description}
        </p>
      )}

      {/* Record count */}
      <p className="mt-1 text-sm text-gray-400 dark:text-gray-500">
        {recordCount} record{recordCount !== 1 ? "s" : ""}
      </p>

      {/* Delete confirmation */}
      <ConfirmDialog
        open={showDeleteConfirm}
        onOpenChange={setShowDeleteConfirm}
        title="Delete this collection?"
        description="The collection will be removed. Records inside it won't be deleted."
        confirmLabel="Delete"
        variant="danger"
        onConfirm={handleDelete}
        isConfirming={isDeleting}
      />
    </div>
  );
}
