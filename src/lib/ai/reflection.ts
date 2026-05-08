// ============================================================================
// AI REFLECTION GENERATOR
// ============================================================================
//
// Generates a reflection by analyzing the user's records from a given period
// alongside their AI profile. In Step 6, this file also became the home of
// period-based media recommendations.
//
// The period defaults to the current Monday–Sunday week (driven by the cron),
// but callers can pass any date range — used both for backfilling missed weeks
// and for synthesizing across multi-week stretches when reflections are run
// less frequently.
//
// The high-level flow is:
//   1. Resolve the period boundaries
//   2. Check for an existing reflection (idempotency)
//   3. Fetch the period's records and tags
//   4. Fetch the user's AI profile
//   5. Generate the reflection markdown
//   6. Generate 3 media recommendations from the reflection + compact context
//   7. Save BOTH artifacts on one `reflections` row
//
// Why keep recommendations inside this file instead of the API route?
//   The route should stay thin — auth, rate limiting, transport concerns.
//   This file owns the business logic for "what a reflection is," and
//   recommendations are part of that reflection artifact.
//
// Why save both on one row?
//   The product goal is one digest, not two separate features. One row keeps
//   reads simple, keeps idempotency simple, and matches the detail page where
//   the reflection and recommendations appear together.
// ============================================================================

import { eq, and, gte, lte, lt, desc } from "drizzle-orm";
import { db } from "@/db";
import { records, reflections } from "@/db/schema";
import { getChatProvider } from "@/lib/ai";
import { getProfile, type UserProfile } from "@/lib/ai/profile";
import {
  generateRecommendations,
  type RecommendationSeedRecord,
} from "@/lib/ai/generate-recommendations";
import {
  normalizeStoredRecommendations,
  type Recommendation,
} from "@/lib/ai/recommendations";
import { logAiUsage, type TokenUsage } from "@/lib/ai/usage";

// ============================================================================
// RETURN TYPE
// ============================================================================
// We include recommendations in the return type so callers CAN inspect them if
// they want to later, but current callers still only use `id` and `content`.

export type GeneratedReflection = {
  id: string;
  content: string;
  recommendations: Recommendation[];
};

// ============================================================================
// DATE RANGE TYPE
// ============================================================================
// An explicit date range for the reflection period. Both values are ISO date
// strings (YYYY-MM-DD). Used to override the default current-week boundaries
// — e.g., for backfilling, or for spanning multiple weeks when the cron has
// been skipped or the user prefers a less frequent cadence.

export type ReflectionDateRange = {
  start: string; // inclusive, e.g. "2026-03-30"
  end: string;   // inclusive, e.g. "2026-04-05"
};

// ============================================================================
// GENERATE REFLECTION
// ============================================================================
// Main entry point. This is intentionally a step-by-step orchestration
// function so the feature is easy to follow in a teaching codebase.
//
// Accepts an optional `dateRange`. When omitted, defaults to the current
// Monday–Sunday boundaries (the cron's normal cadence).
//
// Returns:
//   - existing row if a reflection for this period already exists
//   - new row if generation succeeds
//   - null if the user saved nothing in the period

export async function generateReflection(
  userId: string,
  dateRange?: ReflectionDateRange
): Promise<GeneratedReflection | null> {
  // ---- Step 1: Resolve the period boundaries ----
  // Use the provided date range if given, otherwise default to the current week.
  const { periodStart, periodEnd } = dateRange
    ? { periodStart: dateRange.start, periodEnd: dateRange.end }
    : getWeekBoundaries();

  // ---- Step 2: Prevent duplicates ----
  // Reflections are idempotent: one row per user per (periodStart, periodEnd).
  const existing = await db.query.reflections.findFirst({
    where: and(
      eq(reflections.userId, userId),
      eq(reflections.periodStart, periodStart),
      eq(reflections.periodEnd, periodEnd)
    ),
  });

  if (existing) {
    return {
      id: existing.id,
      content: existing.content,
      // Older rows may have null recommendations because the column was added
      // after reflections already existed. Normalize to an empty array so
      // callers never have to care about the migration boundary.
      recommendations: normalizeStoredRecommendations(existing.recommendations),
    };
  }

  // ---- Step 3: Fetch the records saved during this period ----
  const periodRecords = await db.query.records.findMany({
    where: and(
      eq(records.userId, userId),
      gte(records.createdAt, new Date(`${periodStart}T00:00:00Z`)),
      lte(records.createdAt, new Date(`${periodEnd}T23:59:59Z`))
    ),
    orderBy: desc(records.createdAt),
    with: {
      recordTags: {
        with: {
          tag: true,
        },
      },
    },
  });

  // No saves in the period means nothing to reflect on.
  if (periodRecords.length === 0) {
    return null;
  }

  // ---- Step 4: Fetch the long-term AI profile ----
  // The reflection works without it, but the profile helps connect the period
  // to broader interests and recurring patterns.
  const userProfile = await getProfile(userId);

  // ---- Step 5: Build the compact summary sent to the reflection model ----
  const recordSummaries = buildReflectionRecordSummaries(periodRecords);

  // ---- Step 6: Generate the reflection markdown ----
  const reflectionPrompt = buildReflectionPrompt(
    recordSummaries,
    periodRecords.length,
    periodStart,
    periodEnd,
    userProfile
  );

  try {
    const chatProvider = await getChatProvider();
    const chatModel = process.env.CHAT_MODEL || "claude-sonnet-4-6";

    // Capture token usage via the callback so we can log it after the
    // reflection row is saved (we need the reflectionId for context).
    let reflectionUsage: TokenUsage | null = null;

    const content = await chatProvider.chat(
      [{ role: "user", content: reflectionPrompt }],
      "You are a thoughtful personal assistant helping someone reflect on what they saved to their knowledge base over a given period. Write in a warm, observant tone. Use markdown formatting. The period may be a single week or span several weeks — let the prompt's stated range and record count guide your framing.",
      (usage) => { reflectionUsage = usage; }
    );

    // ---- Step 7: Build compact recommendation input ----
    // Important token-saving choice: we do NOT resend raw record content here.
    // The reflection text already distilled the period, so recommendations
    // only get the reflection, the AI profile, and titles/tags for duplicate
    // checks.
    //
    // We extend the seed pool beyond just this period's records. A user might
    // have saved a book before the period that Claude could re-recommend if
    // it only sees the current period. Fetching the last 4 weeks of titled
    // records before the period catches most recent saves cheaply.
    const recentRecords = await getRecentTitledRecords(userId, periodStart);
    const recommendationSeeds = buildRecommendationSeedRecords([
      ...periodRecords,
      ...recentRecords,
    ]);

    // ---- Step 8: Fetch previous recommendation titles for dedup ----
    // Without this, Claude might recommend the same book across consecutive
    // periods. We look back ~4 prior reflections and extract the titles from
    // their stored JSONB recommendations. Cheap query, big quality-of-life win.
    const previousRecommendationTitles =
      await getPreviousRecommendationTitles(userId, periodStart);

    // ---- Step 9: Generate recommendations ----
    // This call is intentionally non-fatal. If it fails, we still save the
    // reflection — recommendations are a bonus layer, not the core artifact.
    const recommendations = await generateRecommendations({
      reflectionContent: content,
      userProfile,
      recordSummaries: recommendationSeeds,
      previousRecommendationTitles,
      userId,
    });

    // ---- Step 10: Save one combined digest row ----
    const [saved] = await db
      .insert(reflections)
      .values({
        userId,
        content,
        recommendations,
        periodStart,
        periodEnd,
      })
      .returning({ id: reflections.id });

    // Log token usage now that we have the reflectionId.
    // Fire-and-forget — don't block the return on logging.
    if (reflectionUsage) {
      logAiUsage({
        userId,
        feature: "reflection",
        provider: "claude",
        model: chatModel,
        usage: reflectionUsage,
        reflectionId: saved.id,
      });
    }

    return {
      id: saved.id,
      content,
      recommendations,
    };
  } catch (error) {
    console.error("Reflection generation failed:", error);
    throw error;
  }
}

// ============================================================================
// BUILD REFLECTION RECORD SUMMARIES
// ============================================================================
// The reflection model needs a little more context than the recommendation
// model, so we include a content preview here.
//
// We spell this type out instead of deriving it from Drizzle query helpers
// because explicit shapes are easier to read in a teaching codebase.

type RecordWithTags = {
  type: string;
  title: string | null;
  content: string;
  note: string | null;
  sourceAuthor: string | null;
  createdAt: Date;
  recordTags: Array<{ tag: { name: string } }>;
};

function buildReflectionRecordSummaries(
  periodRecords: RecordWithTags[]
): string[] {
  return periodRecords.map((record) => {
    const tagNames = record.recordTags.map((rt) => rt.tag.name);
    const preview = record.content.slice(0, 200);
    const date = record.createdAt.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
    });

    return [
      `- [${record.type}] (${date})`,
      record.title ? `"${record.title}"` : "",
      `${preview}${record.content.length > 200 ? "..." : ""}`,
      record.sourceAuthor ? `— ${record.sourceAuthor}` : "",
      record.note ? `[User note: ${record.note}]` : "",
      tagNames.length > 0 ? `(tags: ${tagNames.join(", ")})` : "",
    ]
      .filter(Boolean)
      .join(" ");
  });
}

// ============================================================================
// BUILD RECOMMENDATION SEED RECORDS
// ============================================================================
// The recommendation model gets only titles + tags. This supports duplicate
// avoidance without paying to resend full record text.
//
// The input may contain records from multiple periods (current + recent), so
// we deduplicate by title to avoid sending the same entry twice.

function buildRecommendationSeedRecords(
  allRecords: RecordWithTags[]
): RecommendationSeedRecord[] {
  const seen = new Set<string>();

  return allRecords
    .filter((record) => {
      // Records without a title are harder to use for duplicate avoidance.
      // We skip them rather than sending placeholder strings.
      if (typeof record.title !== "string" || record.title.trim().length === 0) {
        return false;
      }
      // Deduplicate by normalized title so the same save from multiple periods
      // doesn't waste a slot in the seed list.
      const key = record.title.trim().toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 20)
    .map((record) => ({
      title: record.title!.trim(),
      tags: record.recordTags.map((rt) => rt.tag.name),
    }));
}

// ============================================================================
// RECENT TITLED RECORDS
// ============================================================================
// Fetches records from the 4 weeks before the current reflection period. These
// supplement the current period's records for duplicate avoidance — a user who
// saved a book 2 weeks ago shouldn't get it recommended back.
//
// We only fetch records with titles and only select the columns needed for seed
// records (title + tags), keeping the query lightweight.

async function getRecentTitledRecords(
  userId: string,
  currentPeriodStart: string
): Promise<RecordWithTags[]> {
  // 4 weeks before the current period start
  const lookbackDate = new Date(`${currentPeriodStart}T00:00:00Z`);
  lookbackDate.setDate(lookbackDate.getDate() - 28);

  return db.query.records.findMany({
    where: and(
      eq(records.userId, userId),
      gte(records.createdAt, lookbackDate),
      lt(records.createdAt, new Date(`${currentPeriodStart}T00:00:00Z`))
    ),
    orderBy: desc(records.createdAt),
    limit: 50,
    with: {
      recordTags: {
        with: {
          tag: true,
        },
      },
    },
  });
}

// ============================================================================
// PREVIOUS RECOMMENDATION TITLES
// ============================================================================
// Fetches titles from the last 4 reflections so the generator can avoid
// repeating itself. We query reflections older than the current period, grab
// the JSONB recommendations column, and extract just the title strings.
//
// This is a lightweight query: we only need a handful of rows and only read
// one JSONB column from each.

async function getPreviousRecommendationTitles(
  userId: string,
  currentPeriodStart: string
): Promise<string[]> {
  const recentReflections = await db.query.reflections.findMany({
    where: and(
      eq(reflections.userId, userId),
      lt(reflections.periodStart, currentPeriodStart)
    ),
    orderBy: desc(reflections.periodStart),
    limit: 4,
    columns: {
      recommendations: true,
    },
  });

  return recentReflections.flatMap((row) => {
    const recs = normalizeStoredRecommendations(row.recommendations);
    return recs.map((rec) => rec.title);
  });
}

// ============================================================================
// BUILD REFLECTION PROMPT
// ============================================================================
// Constructs the prompt sent to the reflection model. Includes:
//   - the period's records (summarized)
//   - the user's long-term profile, if available
//   - instructions for tone and format, including range-aware framing

function buildReflectionPrompt(
  recordSummaries: string[],
  recordCount: number,
  periodStart: string,
  periodEnd: string,
  userProfile: UserProfile | null
): string {
  const spanDays = computeInclusiveSpanDays(periodStart, periodEnd);
  const spanLabel = describeSpan(spanDays);

  let prompt = `Here are ${recordCount} record${recordCount === 1 ? "" : "s"} saved to a personal knowledge base between ${periodStart} and ${periodEnd} (${spanLabel}):\n\n`;
  prompt += recordSummaries.join("\n");

  if (userProfile && userProfile.topInterests.length > 0) {
    prompt += `\n\nFor context, here's what we know about this person:\n`;
    prompt += `${userProfile.summary}\n`;
    prompt += `Key interests: ${userProfile.topInterests.join(", ")}\n`;
    if (userProfile.patterns.length > 0) {
      prompt += `Known patterns: ${userProfile.patterns.join("; ")}`;
    }
  }

  prompt += `\n\nWrite a reflection (3-5 short paragraphs in markdown) covering this period that:

1. **Grounds the reader in the period** — Early on, naturally acknowledge how much was saved and over what span (e.g. "${recordCount} save${recordCount === 1 ? "" : "s"} across ${spanLabel}"). Don't make it feel like a stat block — weave it in.
2. **Identifies themes** — What topics or ideas dominated? Were there any surprising clusters?
3. **Draws connections** — Find links between records that might not be obvious. A quote that echoes an article's thesis, a link that builds on a note, etc.
4. **Notes what's new vs. recurring** — Is the user exploring a new interest, or deepening a familiar one?
5. **Ends with a gentle prompt** — Suggest something to explore, revisit, or think about based on these saves.

Important framing rules:
- Do NOT assume the period is one week. The actual span is ${spanLabel}; phrasing like "this week" is only appropriate when ${spanDays} is around 7. For longer spans, prefer "over the past ${spanLabel}", "across these ${spanLabel}", or similar.
- Do NOT start with "This week", "Here's your reflection", or any meta opener — jump straight into the observations.

Keep the tone warm and observant — like a thoughtful friend reviewing a stretch of your saves, not a corporate summary. Use **bold** for emphasis and keep paragraphs short. Don't use headers — write it as flowing prose paragraphs.`;

  return prompt;
}

// ---- Span helpers ----
// Inclusive day count between two YYYY-MM-DD strings. We work in UTC so the
// math doesn't drift around DST or local-timezone boundaries.

function computeInclusiveSpanDays(start: string, end: string): number {
  const startMs = Date.parse(`${start}T00:00:00Z`);
  const endMs = Date.parse(`${end}T00:00:00Z`);
  const days = Math.round((endMs - startMs) / 86_400_000) + 1;
  return Math.max(1, days);
}

function describeSpan(days: number): string {
  if (days <= 1) return "a single day";
  if (days <= 10) return `${days} days`;
  const weeks = Math.round(days / 7);
  if (weeks <= 1) return `${days} days`;
  return `${weeks} weeks`;
}

// ============================================================================
// WEEK BOUNDARIES
// ============================================================================
// Returns the Monday and Sunday of the current week as ISO date strings
// (YYYY-MM-DD). Used as the default period when no explicit range is supplied
// — the weekly cron's normal cadence.

export function getWeekBoundaries(referenceDate?: Date): {
  periodStart: string;
  periodEnd: string;
} {
  const now = referenceDate || new Date();
  const dayOfWeek = now.getDay();
  const mondayOffset = dayOfWeek === 0 ? 6 : dayOfWeek - 1;

  const monday = new Date(now);
  monday.setDate(now.getDate() - mondayOffset);

  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);

  const formatDate = (d: Date) => d.toISOString().split("T")[0];

  return {
    periodStart: formatDate(monday),
    periodEnd: formatDate(sunday),
  };
}
