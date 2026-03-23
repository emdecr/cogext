// ============================================================================
// COLLECTION DETAIL PAGE
// ============================================================================
//
// Displays a single collection with all its records in a grid.
// Server component — fetches collection data before rendering.
//
// Features:
//   - Editable name (inline rename)
//   - Description display
//   - Record grid showing all records in the collection
//   - Remove record from collection
//   - Delete collection
//   - Back link to dashboard
// ============================================================================

import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/auth/session";
import { getCollection } from "@/lib/actions/collections";
import CollectionHeader from "./collection-header";
import SortableRecordGrid from "./sortable-record-grid";
import EmptyState from "@/components/empty-state";

type Props = {
  params: Promise<{ id: string }>;
};

export default async function CollectionDetailPage({ params }: Props) {
  const session = await getSession();
  if (!session) redirect("/login");

  const { id } = await params;
  const collection = await getCollection(id);

  if (!collection) notFound();

  return (
    <div className="min-h-screen bg-gray-50 p-4 dark:bg-gray-950 md:p-8">
      <div className="mx-auto max-w-6xl">
        {/* Back link */}
        <Link
          href="/dashboard"
          className="text-sm text-gray-500 transition-colors hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
        >
          ← Back to dashboard
        </Link>

        {/* Collection header — client component for rename/delete interactivity */}
        <CollectionHeader
          id={collection.id}
          name={collection.name}
          description={collection.description}
          recordCount={collection.records.length}
        />

        {/* Record grid */}
        {collection.records.length === 0 ? (
          <div className="mt-8">
            <EmptyState
              icon="collections"
              title="No records in this collection"
              description="Open a record on the dashboard and use the + Collection button to add it here."
            />
          </div>
        ) : (
          /* SortableRecordGrid is a client component that wraps each card
             with dnd-kit's sortable hooks. It manages local order state
             and persists reorder via server action on drop. */
          <SortableRecordGrid
            collectionId={collection.id}
            initialRecords={collection.records}
          />
        )}
      </div>
    </div>
  );
}
