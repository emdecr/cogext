// ============================================================================
// ADMIN GATE
// ============================================================================
//
// Server-side checks for the /admin area. Admins are the users whose email is
// in ADMIN_EMAILS (see admin-emails.ts and config.admin.emails).
//
// The JWT only carries userId, so checking admin status costs one user lookup.
// getAdminUser() is wrapped in React's cache() so a layout + page + several
// server actions in the same request share a single query.
//
// Where to call requireAdmin():
//   - The admin layout AND every admin page. On client-side navigation Next
//     re-renders only the changed segment, not the layout, so the layout check
//     alone doesn't cover a direct RSC request for a page.
//   - EVERY admin server action. Actions are callable by POST from anywhere;
//     the page that renders them being gated protects nothing.
//
// Non-admins get notFound() (404), not a 403 — consistent with the proxy's
// "don't advertise what's here" stance.
// ============================================================================

import { cache } from "react";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { config } from "@/lib/config";
import { getSession } from "./session";
import { isAdminEmail } from "./admin-emails";

export type AdminUser = { id: string; email: string };

/**
 * Return the current user if they're an admin, otherwise null.
 * Use for conditional UI (e.g. showing the Admin link). Never throws.
 */
export const getAdminUser = cache(async (): Promise<AdminUser | null> => {
  // Read the session (cookies) FIRST, unconditionally. cookies() is what tells
  // Next.js this render is per-request. If we returned early on an empty
  // allowlist before touching it, `next build` (where ADMIN_EMAILS is unset)
  // would see no dynamic API, prerender every /admin page as STATIC, and bake
  // the notFound() into a 404 that prod then serves to everyone — regardless
  // of the runtime ADMIN_EMAILS. (That shipped once; see admin.test.ts.)
  const session = await getSession();
  if (!session) return null;

  // No allowlist means no admins — skip the DB lookup.
  if (config.admin.emails.length === 0) return null;

  const user = await db.query.users.findFirst({
    where: eq(users.id, session.userId),
    columns: { id: true, email: true },
  });
  if (!user || !isAdminEmail(user.email, config.admin.emails)) return null;

  return user;
});

/**
 * Require an admin for the current request. Returns the admin user, or
 * triggers a 404 via notFound() for anyone else (including logged-out).
 *
 * @example
 *   export default async function AdminPage() {
 *     await requireAdmin();
 *     ...
 *   }
 */
export async function requireAdmin(): Promise<AdminUser> {
  const admin = await getAdminUser();
  if (!admin) notFound();
  return admin;
}
