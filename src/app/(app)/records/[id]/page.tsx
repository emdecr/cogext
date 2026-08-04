// ============================================================================
// RECORD DETAIL PAGE (standalone, canonical URL)
// ============================================================================
//
// The real page for a single record at /records/[id]. Rendered on a direct
// visit, refresh, or shared link (the intercepting @modal route handles
// soft navigations from within the app).
//
// Server component: verifies the session, fetches the record (user-scoped —
// getRecord returns null for another user's id, so we notFound()), and renders
// the shared RecordDetail. No `onClose` is passed, so RecordDetail shows no
// close button and post-delete navigates to the dashboard.
// ============================================================================

import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/auth/session";
import { getRecord } from "@/lib/actions/records";
import RecordDetail from "@/components/record-detail";

type Props = {
  params: Promise<{ id: string }>;
};

export default async function RecordDetailPage({ params }: Props) {
  const session = await getSession();
  if (!session) redirect("/login");

  const { id } = await params;
  const record = await getRecord(id);

  if (!record) notFound();

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

        <div className="mt-4 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-900">
          <RecordDetail record={record} />
        </div>
      </div>
    </div>
  );
}
