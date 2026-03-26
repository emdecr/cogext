// ============================================================================
// AI PROFILE GENERATOR
// ============================================================================
//
// Analyzes a user's saved records and builds a JSONB profile of their
// interests, patterns, and themes. This profile is then used as system
// context in conversations so the AI "knows" the user without needing
// to retrieve records for every question.
//
// Think of it like a friend who knows you well:
//   - Without a profile: "Based on your records, you seem interested in..."
//     (has to search and figure it out every time)
//   - With a profile: "Since you're into systems design and cooking..."
//     (already knows, can jump straight to helpful answers)
//
// How it works:
//   1. Fetch the user's recent records (last 100)
//   2. Summarize them into a compact text (titles, types, tags)
//   3. Send to Claude with a prompt asking it to extract patterns
//   4. Parse the structured JSON response
//   5. Save to the ai_profile table
//
// When to regenerate:
//   - After a significant number of new records (e.g., every 20 records)
//   - Periodically (e.g., weekly, via a cron job in Phase 5)
//   - Manually triggered by the user
//   - First conversation (if no profile exists yet)
//
// Token efficiency:
//   The profile is typically 200-500 tokens — much cheaper than including
//   all records in every conversation. It captures the "forest" while
//   RAG retrieval handles the "trees."
// ============================================================================

import { eq, desc } from "drizzle-orm";
import { db } from "@/db";
import { records, aiProfile, recordTags, tags } from "@/db/schema";
import { getChatProvider } from "@/lib/ai";
import { logAiUsage } from "@/lib/ai/usage";

// ============================================================================
// PROFILE SHAPE
// ============================================================================
// The structure stored in ai_profile.profileData (JSONB).
// We define it explicitly so the rest of the app knows what to expect,
// even though JSONB is schemaless in Postgres.
//
// This shape will evolve — JSONB makes that easy. Adding new fields
// doesn't require a migration.

export type UserProfile = {
  // High-level summary of who this person is based on what they save
  summary: string;

  // Recurring topics/interests, ranked by frequency
  // e.g., ["software architecture", "Italian cooking", "stoic philosophy"]
  topInterests: string[];

  // Content types the user favors
  // e.g., { quote: 45, article: 30, note: 20, link: 5 }
  contentBreakdown: Record<string, number>;

  // Themes or patterns the AI noticed across records
  // e.g., ["Frequently saves content about simplicity in design",
  //         "Interest in both Eastern and Western philosophy"]
  patterns: string[];

  // When this profile was last generated
  generatedAt: string;

  // How many records were analyzed to build this profile
  recordCount: number;
};

// ============================================================================
// GENERATE PROFILE
// ============================================================================
// The main function. Fetches records, sends them to the LLM, parses
// the response, and saves the profile.
//
// This is a "background" operation — it's not time-sensitive and doesn't
// need streaming. We use chat() (not chatStream()) for simplicity.

export async function generateProfile(userId: string): Promise<UserProfile> {
  // ---- Step 1: Fetch recent records with their tags ----
  // We limit to 100 records to keep the prompt manageable.
  // For a personal tool, 100 records gives a strong signal about
  // the user's interests without overwhelming the LLM.
  const userRecords = await db.query.records.findMany({
    where: eq(records.userId, userId),
    orderBy: desc(records.createdAt),
    limit: 100,
    with: {
      recordTags: {
        with: {
          tag: true,
        },
      },
    },
  });

  if (userRecords.length === 0) {
    // No records = no profile to generate
    const emptyProfile: UserProfile = {
      summary: "New user — no records saved yet.",
      topInterests: [],
      contentBreakdown: {},
      patterns: [],
      generatedAt: new Date().toISOString(),
      recordCount: 0,
    };

    await saveProfile(userId, emptyProfile);
    return emptyProfile;
  }

  // ---- Step 2: Build a compact summary of the records ----
  // We don't send full record content to the LLM (too many tokens).
  // Instead, we create a condensed summary: type, title, first 150
  // chars of content, and tags. This gives the LLM enough signal
  // to identify patterns without costing a fortune.
  const contentBreakdown: Record<string, number> = {};

  const recordSummaries = userRecords.map((record) => {
    // Count content types
    contentBreakdown[record.type] =
      (contentBreakdown[record.type] || 0) + 1;

    const tagNames = record.recordTags.map((rt) => rt.tag.name);
    const preview = record.content.slice(0, 150);

    return [
      `- [${record.type}]`,
      record.title ? `"${record.title}"` : "",
      `${preview}${record.content.length > 150 ? "..." : ""}`,
      tagNames.length > 0 ? `(tags: ${tagNames.join(", ")})` : "",
    ]
      .filter(Boolean)
      .join(" ");
  });

  // ---- Step 3: Ask the LLM to extract patterns ----
  const prompt = `Analyze these ${userRecords.length} records from a personal knowledge base and extract a user profile. The records are listed newest-first.

RECORDS:
${recordSummaries.join("\n")}

Return a JSON object with these fields:
{
  "summary": "A 2-3 sentence description of this person based on what they save. Focus on their interests, profession/role if apparent, and intellectual style.",
  "topInterests": ["list", "of", "5-8", "main interests/topics"],
  "patterns": ["List 3-5 interesting patterns you notice across their saved content. Look for connections between different topics, recurring themes, or notable preferences."]
}

Return ONLY the JSON object, no other text.`;

  try {
    const chatProvider = await getChatProvider();
    const chatModel = process.env.CHAT_MODEL || "claude-sonnet-4-6";

    const response = await chatProvider.chat(
      [{ role: "user", content: prompt }],
      "You are a data analyst. Analyze the provided records and extract a structured user profile. Return only valid JSON.",
      (usage) => {
        logAiUsage({
          userId,
          feature: "profile",
          provider: "claude",
          model: chatModel,
          usage,
        });
      }
    );

    // ---- Step 4: Parse the LLM response ----
    // The LLM should return JSON, but it might wrap it in markdown
    // code blocks or add extra text. We try to extract the JSON.
    const profile = parseProfileResponse(response, contentBreakdown, userRecords.length);

    // ---- Step 5: Save to database ----
    await saveProfile(userId, profile);

    return profile;
  } catch (error) {
    console.error("Profile generation failed:", error);

    // Return a basic profile derived from the data we have,
    // even if the LLM call failed. Better than nothing.
    const fallbackProfile: UserProfile = {
      summary: `User with ${userRecords.length} saved records.`,
      topInterests: extractTopTags(userRecords),
      contentBreakdown,
      patterns: [],
      generatedAt: new Date().toISOString(),
      recordCount: userRecords.length,
    };

    await saveProfile(userId, fallbackProfile);
    return fallbackProfile;
  }
}

// ============================================================================
// PARSE PROFILE RESPONSE
// ============================================================================
// Extracts and validates the JSON from the LLM's response.
// LLMs sometimes wrap JSON in markdown code blocks (```json ... ```)
// or add commentary before/after. We handle both cases.

function parseProfileResponse(
  response: string,
  contentBreakdown: Record<string, number>,
  recordCount: number
): UserProfile {
  // Try to extract JSON from markdown code blocks first
  const jsonMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/);
  const jsonStr = jsonMatch ? jsonMatch[1].trim() : response.trim();

  try {
    const parsed = JSON.parse(jsonStr);

    return {
      summary: parsed.summary || "Profile generated.",
      topInterests: Array.isArray(parsed.topInterests)
        ? parsed.topInterests.slice(0, 10)
        : [],
      contentBreakdown,
      patterns: Array.isArray(parsed.patterns)
        ? parsed.patterns.slice(0, 8)
        : [],
      generatedAt: new Date().toISOString(),
      recordCount,
    };
  } catch {
    // If JSON parsing fails, create a minimal profile
    console.warn("Failed to parse profile JSON:", jsonStr.slice(0, 200));
    return {
      summary: "Profile generation partially succeeded.",
      topInterests: [],
      contentBreakdown,
      patterns: [],
      generatedAt: new Date().toISOString(),
      recordCount,
    };
  }
}

// ============================================================================
// EXTRACT TOP TAGS (fallback)
// ============================================================================
// If the LLM call fails, we can still extract basic interests from
// the user's most-used tags. Not as insightful as LLM analysis,
// but better than an empty profile.

function extractTopTags(
  userRecords: Array<{
    recordTags: Array<{ tag: { name: string } }>;
  }>
): string[] {
  const tagCounts = new Map<string, number>();

  for (const record of userRecords) {
    for (const rt of record.recordTags) {
      const count = tagCounts.get(rt.tag.name) || 0;
      tagCounts.set(rt.tag.name, count + 1);
    }
  }

  // Sort by frequency and take top 8
  return Array.from(tagCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([name]) => name);
}

// ============================================================================
// SAVE PROFILE TO DB
// ============================================================================
// Upserts the profile — creates a new row if none exists for this user,
// or updates the existing one.
//
// We use a raw INSERT ... ON CONFLICT pattern because Drizzle's upsert
// API requires a unique constraint. The ai_profile table doesn't have a
// unique constraint on user_id (it probably should — that's a future
// schema fix). For now, we check-then-insert/update.

async function saveProfile(
  userId: string,
  profile: UserProfile
): Promise<void> {
  const existing = await db.query.aiProfile.findFirst({
    where: eq(aiProfile.userId, userId),
  });

  if (existing) {
    await db
      .update(aiProfile)
      .set({
        profileData: profile,
        updatedAt: new Date(),
      })
      .where(eq(aiProfile.id, existing.id));
  } else {
    await db.insert(aiProfile).values({
      userId,
      profileData: profile,
    });
  }
}

// ============================================================================
// GET PROFILE
// ============================================================================
// Retrieves the current profile for a user. Returns null if none exists.
// Used by the chat route to include profile context in conversations.

export async function getProfile(
  userId: string
): Promise<UserProfile | null> {
  const result = await db.query.aiProfile.findFirst({
    where: eq(aiProfile.userId, userId),
  });

  if (!result) return null;

  // profileData is stored as JSONB, which Drizzle returns as `unknown`.
  // We cast it to our known shape.
  return result.profileData as UserProfile;
}
