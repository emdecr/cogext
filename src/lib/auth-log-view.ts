// ============================================================================
// AUTH LOG VIEW — pure helpers for the admin Auth log tab
// ============================================================================
//
// URL-param parsing, labels, and display shaping for auth_events rows. Kept
// free of db/config imports so it's unit-testable without mocks. Data
// gathering lives in src/lib/actions/admin/auth-log.ts.
//
// Treat every stored value as UNTRUSTED. `email` on a login_failure is
// whatever the visitor typed, and `user_agent` is any header a client sends.
// React escapes text, so rendering is XSS-safe; these helpers additionally
// cap length so a hostile 10KB "email" can't wreck the layout.
// ============================================================================

import type { AuthEventType } from "@/lib/auth/auth-log";

export const AUTH_LOG_PAGE_SIZE = 50;

// The only accepted ?type= values (anything else → no filter).
export const AUTH_EVENT_TYPES: readonly AuthEventType[] = [
  "login_success",
  "login_failure",
  "register",
  "register_blocked",
  "logout",
];

export const AUTH_EVENT_LABELS: Record<
  AuthEventType,
  { label: string; color: "green" | "amber" | "red" | "gray" }
> = {
  login_success: { label: "Login", color: "green" },
  login_failure: { label: "Failed login", color: "red" },
  register: { label: "Registered", color: "green" },
  register_blocked: { label: "Blocked signup", color: "amber" },
  logout: { label: "Logout", color: "gray" },
};

export type AuthLogParams = { page: number; type: AuthEventType | null };

// A page cap keeps a hand-edited ?page=1e9 from becoming a huge OFFSET scan.
const MAX_PAGE = 1000;

/**
 * Parse ?page= and ?type= from the URL. Anything malformed falls back to the
 * default (page 1, no filter) rather than erroring.
 */
export function parseAuthLogParams(
  raw: Record<string, string | string[] | undefined>
): AuthLogParams {
  const first = (v: string | string[] | undefined) =>
    Array.isArray(v) ? v[0] : v;

  const pageRaw = first(raw.page);
  const pageNum = pageRaw && /^\d{1,4}$/.test(pageRaw) ? Number(pageRaw) : 1;
  const page = Math.min(Math.max(pageNum, 1), MAX_PAGE);

  const typeRaw = first(raw.type);
  const type = AUTH_EVENT_TYPES.find((t) => t === typeRaw) ?? null;

  return { page, type };
}

/**
 * Re-validate params that arrive at the server action. Actions are callable
 * by POST with any arguments, so they can't trust that the page parsed them.
 */
export function normalizeAuthLogParams(p: unknown): AuthLogParams {
  const o = (p && typeof p === "object" ? p : {}) as Record<string, unknown>;
  return parseAuthLogParams({
    page: typeof o.page === "number" ? String(o.page) : undefined,
    type: typeof o.type === "string" ? o.type : undefined,
  });
}

/** Build a tab URL for a given filter/page (page 1 and no filter are omitted). */
export function authLogHref(params: AuthLogParams): string {
  const qs = new URLSearchParams();
  if (params.type) qs.set("type", params.type);
  if (params.page > 1) qs.set("page", String(params.page));
  const s = qs.toString();
  return s ? `/admin/auth?${s}` : "/admin/auth";
}

/** Cap an untrusted string for display; the full value goes in a title. */
export function clip(value: string | null, max = 64): string {
  if (!value) return "—";
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

/**
 * A short, human label for a user agent: "Chrome · macOS", "curl", "bot".
 * Deliberately rough: it's for spotting scripts and scanners at a glance,
 * not analytics. Unrecognized agents return a clipped raw string.
 */
export function describeUserAgent(ua: string | null): string {
  if (!ua) return "—";
  const s = ua.toLowerCase();

  // Scripts and scanners first — the interesting ones in a security log.
  const tool = [
    "curl", "wget", "python-requests", "python", "go-http-client", "node-fetch",
    "axios", "okhttp", "java", "postman", "httpie", "libwww", "scrapy",
  ].find((t) => s.includes(t));
  if (tool) return tool;
  if (/bot|crawler|spider|scan/.test(s)) return "bot";

  const browser = s.includes("edg/")
    ? "Edge"
    : s.includes("firefox/")
      ? "Firefox"
      : s.includes("chrome/")
        ? "Chrome"
        : s.includes("safari/")
          ? "Safari"
          : null;
  const os = s.includes("iphone") || s.includes("ipad")
    ? "iOS"
    : s.includes("android")
      ? "Android"
      : s.includes("mac os x")
        ? "macOS"
        : s.includes("windows")
          ? "Windows"
          : s.includes("linux")
            ? "Linux"
            : null;

  if (browser || os) return [browser, os].filter(Boolean).join(" · ");
  return clip(ua, 32);
}
