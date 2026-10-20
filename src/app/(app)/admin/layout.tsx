// ============================================================================
// ADMIN LAYOUT
// ============================================================================
//
// Shell for /admin/*: header + tab nav. Gated by requireAdmin() — non-admins
// get a 404. Each page ALSO calls requireAdmin(), because on client-side
// navigation Next only re-renders the changed page segment, not this layout
// (see src/lib/auth/admin.ts). The lookup is cache()d per request, so the
// double call costs one query.
// ============================================================================

import Link from "next/link";
import { requireAdmin } from "@/lib/auth/admin";
import AdminTabNav from "./admin-tab-nav";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireAdmin();

  return (
    <div className="min-h-screen bg-gray-50 p-4 dark:bg-gray-950 md:p-8">
      <div className="mx-auto max-w-5xl">
        <div className="mb-6">
          <Link
            href="/dashboard"
            className="text-sm text-gray-500 transition-colors hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          >
            ← Back to dashboard
          </Link>
          <h1 className="mt-2 text-2xl font-bold text-gray-900 dark:text-gray-100">
            Admin
          </h1>
        </div>

        <AdminTabNav />

        <div className="pt-6">{children}</div>
      </div>
    </div>
  );
}
