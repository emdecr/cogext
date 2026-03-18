// ============================================================================
// DASHBOARD PAGE (Protected)
// ============================================================================
//
// This is a SERVER component (no "use client" — the default).
// It renders on the server and sends HTML to the browser.
//
// Since it's a server component, we can call getSession() directly —
// it reads the cookie from the incoming request, which is only available
// server-side. The middleware already verified the session before this
// page loads, but we read it again here to get the userId for
// data fetching.
//
// This is a minimal placeholder — just proves auth is working.
// We'll build the real dashboard (masonry grid, records, etc.) later.
// ============================================================================

import { redirect } from "next/navigation";
import { getSession, clearSession } from "@/lib/auth/session";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";

export default async function DashboardPage() {
  // Get the current session. Middleware should have already verified
  // this, but we check again as a safety net (defense in depth).
  const session = await getSession();

  if (!session) {
    redirect("/login");
  }

  // Fetch the user from the database so we can display their email.
  // In a real app you might put this in a shared helper or context.
  const user = await db.query.users.findFirst({
    where: eq(users.id, session.userId),
  });

  if (!user) {
    redirect("/login");
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="mx-auto max-w-4xl">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
            <p className="mt-1 text-sm text-gray-600">
              Logged in as {user.email}
            </p>
          </div>

          {/* Logout form. We use a server action (form with action)
              instead of a client-side fetch. Server actions are functions
              that run on the server when the form is submitted — no API
              route needed.

              The "use server" directive inside the function marks it as
              a server action. Next.js handles the form submission
              automatically: serializes the form data, sends it to the
              server, runs the function, then handles the redirect. */}
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

        {/* Placeholder for the future masonry grid */}
        <div className="mt-8 rounded-lg border-2 border-dashed border-gray-300 p-12 text-center text-gray-500">
          <p className="text-lg">Your records will appear here</p>
          <p className="mt-2 text-sm">
            This is where the masonry grid will live in the next phase.
          </p>
        </div>
      </div>
    </div>
  );
}
