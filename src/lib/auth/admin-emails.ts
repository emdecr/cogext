// ============================================================================
// ADMIN EMAIL ALLOWLIST (pure helpers)
// ============================================================================
//
// Admins are defined by the ADMIN_EMAILS env var — a comma-separated list of
// emails. There is no role column on purpose: admin rights can't be granted
// from inside the app, only by whoever controls the server's .env.
//
// These helpers live in their own module (no db / config imports) so they
// can be unit-tested without mocks and imported by config.ts.
//
// Fail-closed: an empty or missing ADMIN_EMAILS means NOBODY is an admin.
// ============================================================================

/**
 * Parse a comma-separated email list into a normalized array.
 * Trims whitespace, lowercases, and drops empty entries.
 *
 * @example
 *   parseEmailList(" Me@Example.com, ,you@example.com ")
 *   // → ["me@example.com", "you@example.com"]
 */
export function parseEmailList(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Is this email on the (already-normalized) admin allowlist?
 * Case-insensitive; an empty allowlist always returns false.
 */
export function isAdminEmail(
  email: string | null | undefined,
  allowlist: readonly string[]
): boolean {
  if (!email || allowlist.length === 0) return false;
  return allowlist.includes(email.trim().toLowerCase());
}
