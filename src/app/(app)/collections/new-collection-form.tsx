// ============================================================================
// NEW COLLECTION FORM (Client Component)
// ============================================================================
//
// A compact inline form for creating a new collection from the collections
// index page. Starts as a "+ New" button, expands to a text input on click.
// Same pattern as the filter drawer's inline creation.
// ============================================================================

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createCollection } from "@/lib/actions/collections";

export default function NewCollectionForm() {
  const router = useRouter();
  const [isCreating, setIsCreating] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;

    setError(null);
    setIsSubmitting(true);

    const formData = new FormData();
    formData.append("name", name.trim());

    const result = await createCollection(formData);
    setIsSubmitting(false);

    if (!result.success) {
      setError(result.error || "Failed to create");
      return;
    }

    setName("");
    setIsCreating(false);

    if (result.data?.id) {
      router.push(`/collections/${result.data.id}`);
    }
  }

  if (!isCreating) {
    return (
      <button
        onClick={() => setIsCreating(true)}
        className="rounded-md bg-gray-900 px-4 py-2 text-sm text-white hover:bg-gray-700 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-gray-300"
      >
        + New
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-2">
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Collection name..."
        autoFocus
        className="rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
      />
      {error && <p className="text-xs text-red-500">{error}</p>}
      <button
        type="submit"
        disabled={isSubmitting || !name.trim()}
        className="rounded-md bg-gray-900 px-3 py-2 text-sm text-white hover:bg-gray-700 disabled:opacity-50 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-gray-300"
      >
        {isSubmitting ? "..." : "Create"}
      </button>
      <button
        type="button"
        onClick={() => {
          setIsCreating(false);
          setName("");
          setError(null);
        }}
        className="rounded-md px-3 py-2 text-sm text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"
      >
        Cancel
      </button>
    </form>
  );
}
