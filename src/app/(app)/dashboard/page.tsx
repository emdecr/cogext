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
import RecordGrid from "@/components/record-grid";
import ThemeToggle from "@/components/theme-toggle";
import CommandPalette from "@/components/command-palette";
import ChatToggle from "@/components/chat-toggle";

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
    <div className="min-h-screen bg-gray-50 p-4 dark:bg-gray-950 md:p-8">
      <div className="mx-auto max-w-6xl">
        {/* ---- Header ---- */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Dashboard</h1>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
              Logged in as {user.email}
            </p>
          </div>

          <div className="flex items-center gap-4">
            {/* Search hint */}
            <kbd className="hidden rounded-md border border-gray-200 px-2 py-1 text-xs text-gray-400 sm:inline-block dark:border-gray-700">
              ⌘K to search
            </kbd>

            {/* Record count */}
            <span className="text-sm text-gray-500 dark:text-gray-400">
              {records.length} record{records.length !== 1 ? "s" : ""}
            </span>

            <ThemeToggle />

            {/* AI Chat — opens the conversation sidebar */}
            <ChatToggle />

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
                className="rounded-md bg-gray-200 px-4 py-2 text-sm text-gray-700 hover:bg-gray-300 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
              >
                Log out
              </button>
            </form>
          </div>
        </div>

        {/* ---- Command Palette (⌘K) ---- */}
        {/* Always mounted but hidden until ⌘K is pressed.
            Renders null when closed so it costs nothing. */}
        <CommandPalette />

        {/* ---- Create Record Form ---- */}
        {/* Fixed position in the bottom-right corner of the screen.
            Starts as a "+" button, expands into the full form on click. */}
        <div className="fixed bottom-4 right-4 z-50 md:bottom-8 md:right-8">
          <CreateRecordForm />
        </div>

        {/* ---- Filter Bar + Records Grid ---- */}
        {/* RecordGrid is a client component that handles filtering
            and rendering. The dashboard passes all records down,
            and RecordGrid filters them in the browser. */}
        <RecordGrid records={records} />
      </div>
    </div>
  );
}
