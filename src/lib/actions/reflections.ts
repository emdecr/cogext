// ============================================================================
// REFLECTION SERVER ACTIONS
// ============================================================================
//
// Server actions for reading and managing AI-generated weekly reflections.
// These are consumed by the UI components in Phase 4:
//   - getReflections()  → list view (most recent first)
//   - getReflection()   → detail view
//   - markAsRead()      → dismiss the notification indicator
//   - getUnreadCount()  → badge count for the notification dot
//
// Generation is NOT a server action — it's an API route (POST /api/reflections/generate)
// because it's triggered externally (cron job) rather than from a UI interaction.
// Server actions are for client → server calls within the app.
// ============================================================================

"use server";

import { eq, and, desc } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { reflections } from "@/db/schema";
import { getSession } from "@/lib/auth/session";
import {
  normalizeStoredRecommendations,
  type Recommendation,
} from "@/lib/ai/recommendations";

// ============================================================================
// AUTH HELPER
// ============================================================================
// Same pattern as records.ts — extract userId from session or redirect.

async function requireUserId(): Promise<string> {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }
  return session.userId;
}

// ============================================================================
// GET ALL REFLECTIONS
// ============================================================================
// Returns all reflections for the current user, newest first.
// Used for the reflection list view and checking for new reflections.

export type ReflectionSummary = {
  id: string;
  periodStart: string;
  periodEnd: string;
  isRead: boolean;
  createdAt: Date;
  // First 200 chars of content for preview in list view
  preview: string;
};

export async function getReflections(): Promise<ReflectionSummary[]> {
  const userId = await requireUserId();

  const results = await db.query.reflections.findMany({
    where: eq(reflections.userId, userId),
    orderBy: desc(reflections.createdAt),
  });

  return results.map((r) => ({
    id: r.id,
    periodStart: r.periodStart,
    periodEnd: r.periodEnd,
    isRead: r.isRead,
    createdAt: r.createdAt,
    preview: r.content.slice(0, 200) + (r.content.length > 200 ? "..." : ""),
  }));
}

// ============================================================================ 
// GET SINGLE REFLECTION
// ============================================================================
// Returns the full reflection content for the detail view.
//
// Unlike the list view, the detail view needs the structured recommendation
// payload too. We intentionally keep the summary and detail shapes different:
//   - Summary view: optimized for lightweight lists and badges
//   - Detail view: optimized for rendering the full digest experience

export type ReflectionDetail = {
  id: string;
  content: string;
  recommendations: Recommendation[];
  periodStart: string;
  periodEnd: string;
  isRead: boolean;
  createdAt: Date;
};

export async function getReflection(
  id: string
): Promise<ReflectionDetail | null> {
  const userId = await requireUserId();

  const result = await db.query.reflections.findFirst({
    where: and(eq(reflections.id, id), eq(reflections.userId, userId)),
  });

  if (!result) return null;

  return {
    id: result.id,
    content: result.content,
    // recommendations is stored as JSONB, so older rows may be null and
    // Drizzle returns the value as unknown. Normalize immediately so the UI
    // always receives a plain Recommendation[].
    recommendations: normalizeStoredRecommendations(result.recommendations),
    periodStart: result.periodStart,
    periodEnd: result.periodEnd,
    isRead: result.isRead,
    createdAt: result.createdAt,
  };
}

// ============================================================================
// MARK AS READ
// ============================================================================
// Sets is_read = true for a reflection. Called when the user views
// a reflection detail, clearing the notification indicator.

export async function markReflectionAsRead(id: string): Promise<void> {
  const userId = await requireUserId();

  await db
    .update(reflections)
    .set({ isRead: true })
    .where(and(eq(reflections.id, id), eq(reflections.userId, userId)));
}

// ============================================================================
// GET UNREAD COUNT
// ============================================================================
// Returns the number of unread reflections. Used for the notification
// badge — a small dot or number indicating new reflections are available.
//
// We use a count query instead of fetching all reflections and filtering,
// because this will be called on every page load (for the badge) and
// should be as lightweight as possible.

export async function getUnreadReflectionCount(): Promise<number> {
  const userId = await requireUserId();

  const results = await db.query.reflections.findMany({
    where: and(
      eq(reflections.userId, userId),
      eq(reflections.isRead, false)
    ),
    columns: { id: true },
  });

  return results.length;
}
