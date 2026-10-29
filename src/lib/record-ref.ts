// ============================================================================
// RECORD REFS — shared helpers
// ============================================================================
//
// A "record ref" is an inline markdown link to another record:
//
//   [The Dispossessed](/records/<uuid> "book")
//
// The optional link title carries the target's record type so the chip can
// show the right icon without a fetch. Hand-typed links without it still work
// (generic icon). Used by the editor's recordRef node, the `[[` picker, and the
// read-mode renderer so all three agree on the format and the look.
// See plans/2026-10-28-inline-record-links.md.
// ============================================================================

import type { RecordType } from "@/lib/validations/records";

const RECORD_REF_RE =
  /^\/records\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/?(?:[?#].*)?$/i;

// Returns the record id if `href` points at a record page, else null.
export function parseRecordRefHref(href: string | null | undefined): string | null {
  if (!href) return null;
  const match = RECORD_REF_RE.exec(href);
  return match ? match[1].toLowerCase() : null;
}

export const RECORD_REF_ICONS: Record<RecordType, string> = {
  image: "🖼️",
  quote: "❝",
  article: "📰",
  link: "🔗",
  note: "📝",
  book: "📖",
};

export function recordRefIcon(type: string | null | undefined): string {
  return isRecordType(type) ? RECORD_REF_ICONS[type] : "↗";
}

export function isRecordType(value: string | null | undefined): value is RecordType {
  return !!value && Object.hasOwn(RECORD_REF_ICONS, value);
}

// Escapes a label for use inside markdown link text.
export function escapeRecordRefLabel(label: string): string {
  return label.replace(/[\\[\]]/g, (c) => `\\${c}`);
}

// Pill styling shared by the editor chip and the read-mode chip.
export const RECORD_REF_CHIP_CLASS =
  "not-prose inline-flex max-w-full items-baseline gap-1 rounded-md border border-violet-200 " +
  "bg-violet-50 px-1.5 py-px align-baseline text-[0.9em] font-medium leading-snug text-violet-700 " +
  "no-underline transition-colors hover:border-violet-300 hover:bg-violet-100 " +
  "dark:border-violet-800 dark:bg-violet-950/60 dark:text-violet-300 dark:hover:border-violet-700 dark:hover:bg-violet-900/60";

// Postgres regex (use with `~*`) matching any record ref to `id` inside
// markdown text — used for "Mentioned in" backlinks. The id must end at a
// boundary (`)`, space, `/`, `?`, `#`, end of text…) so `/records/<id>-extra`
// doesn't count. Callers pass a validated uuid (no regex metacharacters).
export function recordRefPgRegex(id: string): string {
  return `/records/${id.toLowerCase()}([^0-9a-z_-]|$)`;
}
