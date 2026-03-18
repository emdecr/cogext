// ============================================================================
// DASHBOARD PAGE (Protected)
// ============================================================================
//
// This is a SERVER component — it fetches data on the server before
// sending HTML to the browser. The flow:
//   1. Middleware verifies the session cookie
//   2. This page reads the session to get the userId
//   3. It queries the database for the user's records
//   4. It renders the HTML with records data
//   5. The browser receives ready-to-display HTML
//
// Server components are great for data fetching because:
//   - No loading spinners — data is ready before the page arrives
//   - No client-side fetch waterfall
//   - Database queries run on the server (never exposed to the browser)
//
// Interactive parts (the form, delete buttons) are client components
// imported here. Server and client components can be mixed — the server
// component passes data down as props.
// ============================================================================

import { redirect } from "next/navigation";
import { getSession, clearSession } from "@/lib/auth/session";
import { getRecords } from "@/lib/actions/records";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import CreateRecordForm from "@/components/create-record-form";
import RecordCard from "@/components/record-card";

export default async function DashboardPage() {
  // Auth check (defense in depth — middleware already verified this)
  const session = await getSession();
  if (!session) redirect("/login");

  // Fetch user and records in parallel using Promise.all.
  // This runs both queries at the same time instead of one after the other.
  // If each takes 50ms, sequential = 100ms, parallel = ~50ms.
  const [user, records] = await Promise.all([
    db.query.users.findFirst({
      where: eq(users.id, session.userId),
    }),
    getRecords(),
  ]);

  if (!user) redirect("/login");

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="mx-auto max-w-6xl">
        {/* ---- Header ---- */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
            <p className="mt-1 text-sm text-gray-600">
              Logged in as {user.email}
            </p>
          </div>

          <div className="flex items-center gap-4">
            {/* Record count */}
            <span className="text-sm text-gray-500">
              {records.length} record{records.length !== 1 ? "s" : ""}
            </span>

            {/* Logout — using a server action inline */}
            <form
              action={async () => {
                "use server";
                await clearSession();
                redirect("/login");
              }}
            >
              <button
                type="submit"
                className="rounded-md bg-gray-200 px-4 py-2 text-sm text-gray-700 hover:bg-gray-300"
              >
                Log out
              </button>
            </form>
          </div>
        </div>

        {/* ---- Create Record Form ---- */}
        {/* Fixed position in the bottom-right corner of the screen.
            Starts as a "+" button, expands into the full form on click. */}
        <div className="fixed bottom-8 right-8 z-50">
          <CreateRecordForm />
        </div>

        {/* ---- Records Grid ---- */}
        {records.length === 0 ? (
          // Empty state — shown when user has no records yet
          <div className="mt-8 rounded-lg border-2 border-dashed border-gray-300 p-12 text-center text-gray-500">
            <p className="text-lg">No records yet</p>
            <p className="mt-2 text-sm">
              Click the + button to save your first note, quote, link, or
              article.
            </p>
          </div>
        ) : (
          // Record grid — simple CSS grid for now.
          // We'll replace this with a proper masonry layout later
          // (masonry needs JS for variable-height cards).
          <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {records.map((record) => (
              <RecordCard key={record.id} record={record} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
