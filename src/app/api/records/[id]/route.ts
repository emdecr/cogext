// ============================================================================
// GET /api/records/[id] — compact record preview
// ============================================================================
//
// DELIBERATE EXCEPTION to CLAUDE.md's "API routes are reserved for auth, file
// uploads, and streaming" rule. This read-only endpoint backs the hover-card
// preview of inline `/records/<id>` links inside reflections (Phase 3 of
// plans/2026-07-24-record-urls-and-reflection-refs.md).
//
// Why a route and not a server action: it's fetched on hover-intent from the
// client and cached per-id in the browser — a cacheable GET is the natural fit,
// not a mutation. Auth + user-scoping come for free from getRecord(), which is
// session-scoped (returns null for another user's record → we 404).
// ============================================================================

import { NextResponse } from "next/server";
import { getRecord } from "@/lib/actions/records";
import { stripMarkdown } from "@/lib/strip-markdown";

const EXCERPT_LIMIT = 220;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const record = await getRecord(id);
  if (!record) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Content is authored as markdown — strip it so the preview shows plain text.
  const plain = stripMarkdown(record.content);
  const excerpt =
    plain.length > EXCERPT_LIMIT ? plain.slice(0, EXCERPT_LIMIT) + "…" : plain;

  return NextResponse.json({
    id: record.id,
    type: record.type,
    title: record.title,
    excerpt,
    imagePath: record.imagePath,
    sourceAuthor: record.sourceAuthor,
    tags: record.recordTags.map((rt) => rt.tag.name),
  });
}
