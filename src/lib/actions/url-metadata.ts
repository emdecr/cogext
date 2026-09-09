// ============================================================================
// URL METADATA SERVER ACTION
// ============================================================================
//
// A read-only lookup that fetches a user-supplied URL server-side and pulls its
// title and description out of the HTML. Used by the create form to auto-fill
// the Title (and, for link records, the Content) when a source URL is pasted.
//
// This is NOT CRUD, so per CLAUDE.md it's a server action rather than an API
// route (routes are reserved for auth, uploads, and streaming).
//
// Because it fetches an arbitrary URL from the server, it is an SSRF lever. We
// defend by:
//   - allowing only http(s) schemes,
//   - resolving the hostname and rejecting private / loopback / link-local IPs,
//   - capping the response size and the request time,
//   - only reading text/html.
// The result is best-effort: on any failure we return empty fields rather than
// throwing, so the form degrades to manual entry.
// ============================================================================

"use server";

import dns from "node:dns/promises";
import net from "node:net";

import { getSession } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import { parseHtmlMetadata } from "@/lib/url-metadata-parse";
import type { UrlMetadata } from "@/lib/url-metadata-parse";
import { getYouTubeVideoId } from "@/lib/youtube";

// Cap how much HTML we read — the <head> (where the metadata lives) is near the
// top, so 512KB is plenty and bounds memory / bandwidth for a hostile target.
const MAX_BYTES = 512 * 1024;
const TIMEOUT_MS = 5000;

// ============================================================================
// SSRF GUARD
// ============================================================================

// Reject IPs that could reach the host's own network. Covers the common
// private/loopback/link-local ranges for both IPv4 and IPv6.
function isPrivateIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    if (a === 10) return true; // 10.0.0.0/8
    if (a === 127) return true; // loopback
    if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
    if (a === 192 && b === 168) return true; // 192.168.0.0/16
    if (a === 169 && b === 254) return true; // link-local
    if (a === 0) return true; // 0.0.0.0/8
    return false;
  }

  if (net.isIPv6(ip)) {
    const lower = ip.toLowerCase();
    if (lower === "::1") return true; // loopback
    if (lower.startsWith("fe80")) return true; // link-local
    if (lower.startsWith("fc") || lower.startsWith("fd")) return true; // unique local
    // IPv4-mapped (::ffff:a.b.c.d) — re-check the embedded v4 address.
    const mapped = lower.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateIp(mapped[1]);
    if (lower === "::") return true;
    return false;
  }

  // Unknown format — treat as unsafe.
  return true;
}

// Validate the URL and confirm every resolved address is public. Returns the
// parsed URL on success, or null if it should not be fetched.
async function assertSafeUrl(rawUrl: string): Promise<URL | null> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") return null;

  try {
    // Resolve ALL addresses and reject if any is private — a hostname can map
    // to several records, and checking only the first leaves a bypass.
    const addresses = await dns.lookup(url.hostname, { all: true });
    if (addresses.length === 0) return null;
    if (addresses.some((a) => isPrivateIp(a.address))) return null;
  } catch {
    return null;
  }

  return url;
}

// ============================================================================
// YOUTUBE (oEmbed)
// ============================================================================
// YouTube's watch page is ~1.3MB and its og:title sits hundreds of KB in —
// past any reasonable read cap. Its oEmbed endpoint returns the title in a
// tiny JSON response instead, so we special-case YouTube video links. oEmbed
// carries no description, so content autofill simply stays empty for these.

async function fetchYouTubeMetadata(rawUrl: string): Promise<UrlMetadata | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const endpoint =
      "https://www.youtube.com/oembed?format=json&url=" +
      encodeURIComponent(rawUrl);
    const res = await fetch(endpoint, { signal: controller.signal });
    if (!res.ok) return null;
    const data = (await res.json()) as { title?: unknown };
    const title = typeof data.title === "string" ? data.title : null;
    return { title: title || null, description: null };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// ============================================================================
// FETCH
// ============================================================================

async function fetchHtml(url: URL): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      // Don't follow redirects blindly to a private target — a public URL could
      // 302 to http://169.254.169.254. "manual" lets us stop at the first hop.
      redirect: "manual",
      headers: {
        // Some sites serve minimal or bot-blocked markup without a UA.
        "user-agent": "Mozilla/5.0 (compatible; cogext-linkpreview/1.0)",
        accept: "text/html,application/xhtml+xml",
      },
    });

    const contentType = res.headers.get("content-type") ?? "";
    if (!res.ok || !contentType.includes("text/html") || !res.body) {
      return null;
    }

    // Read up to MAX_BYTES, then stop — we only need the <head>.
    const reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    let received = 0;
    while (received < MAX_BYTES) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        chunks.push(value);
        received += value.length;
      }
    }
    await reader.cancel().catch(() => {});

    const merged = new Uint8Array(received);
    let offset = 0;
    for (const chunk of chunks) {
      merged.set(chunk.subarray(0, Math.min(chunk.length, received - offset)), offset);
      offset += chunk.length;
      if (offset >= received) break;
    }
    return new TextDecoder("utf-8").decode(merged);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// ============================================================================
// PUBLIC ACTION
// ============================================================================

// Best-effort: always resolves. On any problem (bad URL, private target,
// non-HTML, timeout) it returns empty fields so the caller falls back to
// manual entry.
export async function fetchUrlMetadata(rawUrl: string): Promise<UrlMetadata> {
  const session = await getSession();
  if (!session) redirect("/login");

  const empty: UrlMetadata = { title: null, description: null };

  // YouTube video links: use oEmbed (the og tags live too deep in the page).
  // The endpoint host is our own fixed youtube.com, not the user's URL, so it
  // needs no SSRF check; the user's URL only rides along as a query param.
  if (getYouTubeVideoId(rawUrl)) {
    const yt = await fetchYouTubeMetadata(rawUrl);
    if (yt?.title) return yt;
    // Fall through to the generic path if oEmbed came back empty.
  }

  const safeUrl = await assertSafeUrl(rawUrl);
  if (!safeUrl) return empty;

  const html = await fetchHtml(safeUrl);
  if (!html) return empty;

  return parseHtmlMetadata(html);
}
