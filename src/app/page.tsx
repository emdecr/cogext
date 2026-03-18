// ============================================================================
// HOME PAGE ( / )
// ============================================================================
//
// For now, the root page just redirects:
//   - Logged in → /dashboard
//   - Not logged in → /login
//
// Later this could become a landing page if we want one.
// ============================================================================

import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";

export default async function Home() {
  const session = await getSession();

  if (session) {
    redirect("/dashboard");
  } else {
    redirect("/login");
  }
}
