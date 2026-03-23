// ============================================================================
// COLLECTIONS INDEX PAGE
// ============================================================================
//
// Lists all collections for the current user. Each collection card shows
// the name, description, record count, and cover image (if set).
// Clicking a card navigates to the collection detail page.
//
// Also includes a "New collection" form at the top for quick creation.
// Server component — data fetched before rendering, no loading spinners.
// ============================================================================

import { redirect } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/auth/session";
import { getCollections } from "@/lib/actions/collections";
import EmptyState from "@/components/empty-state";
import NewCollectionForm from "./new-collection-form";

export default async function CollectionsPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const collections = await getCollections();

  return (
    <div className="min-h-screen bg-gray-50 p-4 dark:bg-gray-950 md:p-8">
      <div className="mx-auto max-w-4xl">
        {/* Header */}
        <div className="mb-6">
          <Link
            href="/dashboard"
            className="text-sm text-gray-500 transition-colors hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          >
            ← Back to dashboard
          </Link>
          <div className="mt-2 flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                Collections
              </h1>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                Organize your records into curated groups.
              </p>
            </div>

            {/* Inline new collection form */}
            <NewCollectionForm />
          </div>
        </div>

        {/* Collection grid */}
        {collections.length === 0 ? (
          <EmptyState
            icon="collections"
            title="No collections yet"
            description="Create your first collection to start organizing records."
          />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {collections.map((collection) => (
              <Link
                key={collection.id}
                href={`/collections/${collection.id}`}
                className="group overflow-hidden rounded-lg border border-gray-200 bg-white transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md dark:border-gray-800 dark:bg-gray-900"
              >
                {/* Cover image or gradient placeholder */}
                {collection.coverImage ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={collection.coverImage}
                    alt=""
                    className="h-32 w-full object-cover"
                  />
                ) : (
                  <div className="flex h-32 items-center justify-center bg-gradient-to-br from-gray-100 to-gray-50 dark:from-gray-800 dark:to-gray-900">
                    {/* Collection icon */}
                    <svg
                      className="h-10 w-10 text-gray-300 dark:text-gray-600"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                      strokeWidth={1}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
                      />
                    </svg>
                  </div>
                )}

                <div className="p-4">
                  <h2 className="font-medium text-gray-900 dark:text-gray-100">
                    {collection.name}
                  </h2>
                  {collection.description && (
                    <p className="mt-1 line-clamp-2 text-sm text-gray-500 dark:text-gray-400">
                      {collection.description}
                    </p>
                  )}
                  <p className="mt-2 text-xs text-gray-400 dark:text-gray-500">
                    {collection.recordCount} record
                    {collection.recordCount !== 1 ? "s" : ""}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
