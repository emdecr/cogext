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
import Link from "next/link";
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
import ReflectionIndicator from "@/components/reflection-indicator";
import { getReflections } from "@/lib/actions/reflections";
import { getCollections } from "@/lib/actions/collections";
import KeyboardShortcuts from "@/components/keyboard-shortcuts";

export default async function DashboardPage() {
  // Auth check (defense in depth — middleware already verified this)
  const session = await getSession();
  if (!session) redirect("/login");

  // Fetch user and records in parallel using Promise.all.
  // This runs both queries at the same time instead of one after the other.
  // If each takes 50ms, sequential = 100ms, parallel = ~50ms.
  // Fetch user, records, and reflections in parallel.
  // getReflections() returns all reflections; we filter to unread client-side
  // for the indicator. This single query also powers "View all" later.
  const [user, records, allReflections, collections] = await Promise.all([
    db.query.users.findFirst({
      where: eq(users.id, session.userId),
    }),
    getRecords(),
    getReflections(),
    getCollections(),
  ]);

  // Filter to unread for the notification popover
  const unreadReflections = allReflections.filter((r) => !r.isRead);

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
            {/* Keyboard shortcut hints */}
            <div className="hidden items-center gap-2 sm:flex">
              <kbd className="rounded-md border border-gray-200 px-2 py-1 text-xs text-gray-400 dark:border-gray-700">
                ⌘K
              </kbd>
              <span className="text-xs text-gray-400">search</span>
              <kbd className="ml-1 rounded-md border border-gray-200 px-2 py-1 text-xs text-gray-400 dark:border-gray-700">
                N
              </kbd>
              <span className="text-xs text-gray-400">new</span>
            </div>

            {/* Record count */}
            <span className="text-sm text-gray-500 dark:text-gray-400">
              {records.length} record{records.length !== 1 ? "s" : ""}
            </span>

            <ThemeToggle />

            {/* Collections — quick link to the collections index page */}
            <Link
              href="/collections"
              className="rounded-md bg-gray-200 px-3 py-2 text-sm text-gray-700 hover:bg-gray-300 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
              title="Collections"
            >
              <span className="flex items-center gap-1.5">
                {/* Folder/stack icon */}
                <svg
                  className="h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
                  />
                </svg>
                <span className="hidden sm:inline">Collections</span>
              </span>
            </Link>

            {/* Reflections — sparkle icon with unread notification dot */}
            <ReflectionIndicator unreadReflections={unreadReflections} />

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

        {/* ---- Keyboard Shortcuts ---- */}
        {/* Mounts the global shortcut listener. Renders nothing.
            N → open create form, Esc → close open panels. */}
        <KeyboardShortcuts />

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
        <RecordGrid records={records} collections={collections} />
      </div>
    </div>
  );
}
