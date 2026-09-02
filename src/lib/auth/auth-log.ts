// ============================================================================
// AUTH EVENT LOG
// ============================================================================
//
// Append-only audit log of authentication activity — logins (success +
// failure), registrations, blocked-registration attempts, and logouts. Writes
// to the auth_events table.
//
// Design rules:
//   - NEVER throw. Audit logging is best-effort; a logging failure must not
//     break login/register/logout. Every write is wrapped in try/catch.
//   - Works from both route handlers (which have a NextRequest) and server
//     actions / server components (which read request context via
//     next/headers). Both funnel through the same writer.
//
// Read it with SQL (this is the "DB table only" consumption model):
//   SELECT event_type, email, ip, created_at
//   FROM auth_events ORDER BY created_at DESC LIMIT 50;
// ============================================================================

import type { NextRequest } from "next/server";
import { headers as nextHeaders } from "next/headers";
import { db } from "@/db";
import { authEvents } from "@/db/schema";
import { logger } from "@/lib/logger";

export type AuthEventType =
  | "login_success"
  | "login_failure"
  | "register"
  | "register_blocked"
  | "logout";

type EventDetails = {
  // The email involved. For login_failure this is the ATTEMPTED email, which
  // may not match any user.
  email?: string | null;
  // The user, when known. Null for failed logins against a non-existent email
  // and for register_blocked.
  userId?: string | null;
};

// Same precedence as getClientIp() in rate-limit.ts, but reads from any Headers
// so it works in server actions too (where there's no NextRequest).
function ipFromHeaders(h: Headers): string {
  return (
    h.get("cf-connecting-ip") ||
    h.get("x-real-ip") ||
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown"
  );
}

// The single writer. Best-effort — swallows all errors.
async function record(
  reqHeaders: Headers,
  eventType: AuthEventType,
  details: EventDetails
): Promise<void> {
  try {
    await db.insert(authEvents).values({
      eventType,
      email: details.email?.toLowerCase() ?? null,
      userId: details.userId ?? null,
      ip: ipFromHeaders(reqHeaders),
      userAgent: reqHeaders.get("user-agent"),
    });
  } catch (error) {
    logger.error("Failed to write auth event", { eventType, error });
  }
}

/**
 * Log an auth event from a route handler (login, register), which has the
 * incoming NextRequest.
 */
export function logAuthEvent(
  request: NextRequest,
  eventType: AuthEventType,
  details: EventDetails = {}
): Promise<void> {
  return record(request.headers, eventType, details);
}

/**
 * Log an auth event from a server action / server component (logout), where
 * request context comes from next/headers instead of a NextRequest.
 */
export async function logAuthEventFromHeaders(
  eventType: AuthEventType,
  details: EventDetails = {}
): Promise<void> {
  return record(await nextHeaders(), eventType, details);
}
