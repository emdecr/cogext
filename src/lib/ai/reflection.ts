// ============================================================================
// AI WEEKLY REFLECTION GENERATOR
// ============================================================================
//
// Generates a weekly "reflection" by analyzing the user's records from the
// past week alongside their AI profile. The reflection is a thoughtful,
// markdown-formatted piece that surfaces:
//   - Themes and patterns from the week's saves
//   - Connections between records the user might not have noticed
//   - Gentle prompts for deeper exploration
//
// This follows the same architecture as profile.ts:
//   1. Fetch data (records from the past week + existing profile)
//   2. Summarize the data into a compact prompt
//   3. Send to the LLM via the provider-agnostic interface
//   4. Save the result to the database
//
// Why a separate file from profile.ts?
//   Profile = "who is this user?" (stable, updated infrequently)
//   Reflection = "what happened this week?" (ephemeral, one per week)
//   Different data, different prompts, different output shapes.
//
// The reflection is stored as markdown in the `reflections` table.
// The UI renders it with react-markdown (same as chat messages).
// ============================================================================

import { eq, and, gte, lte, desc } from "drizzle-orm";
import { db } from "@/db";
import { records, reflections, recordTags, tags } from "@/db/schema";
import { getChatProvider } from "@/lib/ai";
import { getProfile } from "@/lib/ai/profile";

// ============================================================================
// GENERATE WEEKLY REFLECTION
// ============================================================================
// Main entry point. Call this with a userId and it will:
//   1. Determine the current week's boundaries (Monday → Sunday)
//   2. Check for an existing reflection (prevent duplicates)
//   3. Fetch that week's records
//   4. Build a prompt with records + profile context
//   5. Call the LLM and save the result
//
// Returns the reflection content, or null if:
//   - A reflection already exists for this week
//   - No records were saved this week (nothing to reflect on)

export async function generateWeeklyReflection(
  userId: string
): Promise<{ content: string; id: string } | null> {
  // ---- Step 1: Calculate the current week boundaries ----
  // We use Monday–Sunday as the week. getWeekBoundaries() returns
  // the most recent Monday and the following Sunday.
  const { periodStart, periodEnd } = getWeekBoundaries();

  // ---- Step 2: Check for existing reflection ----
  // One reflection per week per user. If we already generated one
  // for this period, don't duplicate it.
  const existing = await db.query.reflections.findFirst({
    where: and(
      eq(reflections.userId, userId),
      eq(reflections.periodStart, periodStart),
      eq(reflections.periodEnd, periodEnd)
    ),
  });

  if (existing) {
    return { content: existing.content, id: existing.id };
  }

  // ---- Step 3: Fetch this week's records with tags ----
  // We grab everything the user saved between Monday and Sunday.
  // Unlike profile generation (which uses the last 100 records),
  // reflections are time-bounded — we only look at this week.
  const weekRecords = await db.query.records.findMany({
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

  // Nothing saved this week? Skip reflection.
  if (weekRecords.length === 0) {
    return null;
  }

  // ---- Step 4: Fetch the user's AI profile for additional context ----
  // The profile gives the LLM background on who this user is, so the
  // reflection can connect this week's records to broader interests.
  // If no profile exists, the reflection still works — it just won't
  // reference long-term patterns.
  const userProfile = await getProfile(userId);

  // ---- Step 5: Build record summaries ----
  // Same compact format as profile.ts — type, title, content preview,
  // tags. We include a bit more content here (200 chars) since we're
  // looking at fewer records (one week vs. 100 records).
  const recordSummaries = weekRecords.map((record) => {
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
      tagNames.length > 0 ? `(tags: ${tagNames.join(", ")})` : "",
    ]
      .filter(Boolean)
      .join(" ");
  });

  // ---- Step 6: Build the prompt ----
  // The prompt asks for a warm, thoughtful reflection — not a dry summary.
  // We want it to feel like a knowledgeable friend reviewing your week.
  const prompt = buildReflectionPrompt(
    recordSummaries,
    weekRecords.length,
    periodStart,
    periodEnd,
    userProfile
  );

  // ---- Step 7: Call the LLM ----
  // We use chat() (non-streaming) because reflections are generated
  // in the background — no one is watching the response stream in.
  try {
    const chatProvider = await getChatProvider();
    const content = await chatProvider.chat(
      [{ role: "user", content: prompt }],
      "You are a thoughtful personal assistant helping someone reflect on what they saved to their knowledge base this week. Write in a warm, observant tone. Use markdown formatting."
    );

    // ---- Step 8: Save to database ----
    const [saved] = await db
      .insert(reflections)
      .values({
        userId,
        content,
        periodStart,
        periodEnd,
      })
      .returning({ id: reflections.id });

    return { content, id: saved.id };
  } catch (error) {
    console.error("Reflection generation failed:", error);
    throw error;
  }
}

// ============================================================================
// BUILD REFLECTION PROMPT
// ============================================================================
// Constructs the prompt sent to the LLM. Includes:
//   - The week's records (summarized)
//   - The user's profile (if available) for broader context
//   - Instructions for tone and format
//
// The output should be markdown that reads well in a card-style UI.

function buildReflectionPrompt(
  recordSummaries: string[],
  recordCount: number,
  periodStart: string,
  periodEnd: string,
  userProfile: { summary: string; topInterests: string[]; patterns: string[] } | null
): string {
  let prompt = `Here are ${recordCount} records saved to a personal knowledge base during the week of ${periodStart} to ${periodEnd}:\n\n`;
  prompt += recordSummaries.join("\n");

  // Include profile context if available
  if (userProfile && userProfile.topInterests.length > 0) {
    prompt += `\n\nFor context, here's what we know about this person:\n`;
    prompt += `${userProfile.summary}\n`;
    prompt += `Key interests: ${userProfile.topInterests.join(", ")}\n`;
    if (userProfile.patterns.length > 0) {
      prompt += `Known patterns: ${userProfile.patterns.join("; ")}`;
    }
  }

  prompt += `\n\nWrite a weekly reflection (3-5 short paragraphs in markdown) that:

1. **Identifies themes** — What topics or ideas dominated this week? Were there any surprising clusters?
2. **Draws connections** — Find links between records that might not be obvious. A quote that echoes an article's thesis, a link that builds on a note, etc.
3. **Notes what's new vs. recurring** — Is the user exploring a new interest, or deepening a familiar one?
4. **Ends with a gentle prompt** — Suggest something to explore, revisit, or think about based on the week's saves.

Keep the tone warm and observant — like a thoughtful friend reviewing your week, not a corporate summary. Use **bold** for emphasis and keep paragraphs short. Don't use headers — write it as flowing prose paragraphs.

Do NOT start with "This week" or "Here's your reflection" — jump straight into the observations.`;

  return prompt;
}

// ============================================================================
// WEEK BOUNDARIES
// ============================================================================
// Returns the Monday and Sunday of the current week as ISO date strings
// (YYYY-MM-DD). We use Monday as the start because most people think of
// weeks that way, and it aligns with ISO 8601.
//
// Example: if today is Wednesday 2026-03-18, returns:
//   periodStart: "2026-03-16" (Monday)
//   periodEnd: "2026-03-22" (Sunday)

export function getWeekBoundaries(referenceDate?: Date): {
  periodStart: string;
  periodEnd: string;
} {
  const now = referenceDate || new Date();

  // getDay() returns 0 for Sunday, 1 for Monday, ..., 6 for Saturday.
  // We want Monday = 0, so we shift: (day + 6) % 7
  // This makes Monday=0, Tuesday=1, ..., Sunday=6
  const dayOfWeek = now.getDay();
  const mondayOffset = dayOfWeek === 0 ? 6 : dayOfWeek - 1;

  // Calculate Monday (start of week)
  const monday = new Date(now);
  monday.setDate(now.getDate() - mondayOffset);

  // Calculate Sunday (end of week)
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);

  // Format as YYYY-MM-DD for the date column
  const formatDate = (d: Date) => d.toISOString().split("T")[0];

  return {
    periodStart: formatDate(monday),
    periodEnd: formatDate(sunday),
  };
}
