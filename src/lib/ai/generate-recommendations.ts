// ============================================================================
// WEEKLY REFLECTION RECOMMENDATIONS
// ============================================================================
//
// This module asks Claude for 3 media recommendations that connect to a
// weekly reflection's themes. The recommendations are meant to feel like
// thoughtful "next steps" rather than algorithmic feed content.
//
// Why is this a provider-specific helper instead of going through the shared
// LLMProvider interface in src/lib/ai/types.ts?
//
// Short answer: this feature needs Anthropic's web search tool.
//
// The current provider abstraction models plain text chat and tag generation.
// If we forced web-search tool support through that interface, we'd also have
// to change the Ollama provider and the factory just to satisfy a capability
// only THIS feature needs. That extra abstraction work would make the teaching
// codebase harder to follow for little benefit right now.
//
// So this file intentionally talks to Anthropic directly. It's a deliberate
// tradeoff:
//   - Pro: keeps the existing provider interface simple
//   - Pro: keeps the recommendation logic self-contained
//   - Con: this one feature is Anthropic-specific
//
// That's acceptable here because plan.md explicitly calls for Anthropic web
// search, and because recommendation failure is non-fatal.
// ============================================================================

import Anthropic from "@anthropic-ai/sdk";
import { logAiUsage } from "@/lib/ai/usage";
import type { UserProfile } from "@/lib/ai/profile";
import {
  ALLOWED_TYPES,
  type Recommendation,
  type RecommendationType,
} from "@/lib/ai/recommendations";

// ============================================================================
// INPUT TYPES
// ============================================================================
// We keep the input compact on purpose. The reflection text already distills
// the week's themes, so we avoid re-sending every record's full content.

export type RecommendationSeedRecord = {
  title: string;
  tags: string[];
};

export type GenerateRecommendationsInput = {
  reflectionContent: string;
  userProfile: UserProfile | null;
  recordSummaries: RecommendationSeedRecord[];
  // Titles from the last few weeks of recommendations. Passed in so Claude can
  // avoid repeating itself across weeks. The orchestrator in reflection.ts
  // fetches these from recent reflection rows.
  previousRecommendationTitles: string[];
  // Optional userId for token usage logging. When provided, the function
  // logs input/output tokens to the ai_usage table.
  userId?: string;
};

// ============================================================================
// MAIN ENTRY POINT
// ============================================================================
//
// Returns a parsed Recommendation[] on success.
// Returns [] on any failure:
//   - no API key
//   - API/tool failure
//   - Claude returns non-JSON
//   - Claude returns only invalid objects
//
// This helper must NEVER throw for expected runtime failures because the
// weekly reflection itself is the primary artifact. Recommendations enhance
// the reflection; they should not block it from being saved.

export async function generateRecommendations(
  input: GenerateRecommendationsInput
): Promise<Recommendation[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.warn(
      "[generate-recommendations] ANTHROPIC_API_KEY not set, skipping recommendations"
    );
    return [];
  }

  try {
    const client = new Anthropic({ apiKey });

    // We reuse the chat model env var so recommendations stay aligned with the
    // rest of the app's Claude usage. If unset, we fall back to the repo's
    // default Sonnet model.
    const model = process.env.CHAT_MODEL || "claude-sonnet-4-6";

    const response = await client.messages.create({
      model,
      // 2000 gives comfortable headroom for web search tool turns + the final
      // JSON array. With 1200, multiple search calls before the answer could
      // squeeze the output and cause a truncated/unparseable response. We now
      // only ask for 3 recommendations (down from 4-6), so 2000 is still
      // conservative — a 3-item JSON array is roughly 300-400 tokens.
      max_tokens: 2000,
      system:
        "You are a thoughtful cultural guide. Recommend books, films, shows, essays, podcasts, and articles that connect specifically to the user's weekly reflection. Return only valid JSON.",
      messages: [
        {
          role: "user",
          content: buildRecommendationsPrompt(input),
        },
      ],
      // Anthropic's web search tool lets Claude look up timely context when
      // needed, but the prompt still pushes it toward deep, non-generic picks.
      // The SDK (0.80.0+) natively types WebSearchTool20250305, so no casts
      // are needed here — the compiler validates the full request shape.
      tools: [
        {
          type: "web_search_20250305",
          name: "web_search",
        },
      ],
    });

    // Log token usage. Recommendation calls with web search tend to have
    // higher input token counts because search results get injected as
    // context — this is visible in the usage data without needing a
    // separate web search counter.
    if (input.userId) {
      logAiUsage({
        userId: input.userId,
        feature: "recommendation",
        provider: "claude",
        model,
        usage: {
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens,
        },
      });
    }

    const text = extractTextFromAnthropicResponse(response);
    if (!text) return [];

    return parseRecommendationsResponse(text);
  } catch (error) {
    console.warn(
      "[generate-recommendations] Recommendation generation failed:",
      error
    );
    return [];
  }
}

// ============================================================================
// PROMPT BUILDER
// ============================================================================
// The prompt is intentionally explicit. Recommendation tasks are subjective,
// so strong constraints help the output stay useful and structured.

function buildRecommendationsPrompt(
  input: GenerateRecommendationsInput
): string {
  const profileSummary = input.userProfile
    ? [
        `Summary: ${input.userProfile.summary}`,
        input.userProfile.topInterests.length > 0
          ? `Top interests: ${input.userProfile.topInterests.join(", ")}`
          : "",
        // The content breakdown shows what media types the user already engages
        // with heavily. This helps Claude diversify — e.g. if someone saves
        // mostly articles, lean toward books or films for variety.
        Object.keys(input.userProfile.contentBreakdown).length > 0
          ? `Content they save most: ${formatContentBreakdown(input.userProfile.contentBreakdown)}`
          : "",
        input.userProfile.patterns.length > 0
          ? `Patterns: ${input.userProfile.patterns.join("; ")}`
          : "",
      ]
        .filter(Boolean)
        .join("\n")
    : "No long-term AI profile is available yet.";

  const recentTitles =
    input.recordSummaries.length > 0
      ? input.recordSummaries
          .map((record, index) => {
            const tags =
              record.tags.length > 0 ? ` (tags: ${record.tags.join(", ")})` : "";
            return `${index + 1}. ${record.title}${tags}`;
          })
          .join("\n")
      : "No recent titles/tags available.";

  // Previous recommendation titles help Claude avoid repeating itself across
  // weeks. We only include this section when there are titles to show.
  const previousRecs =
    input.previousRecommendationTitles.length > 0
      ? `\nPREVIOUSLY RECOMMENDED (do NOT repeat these):\n${input.previousRecommendationTitles.map((t) => `- ${t}`).join("\n")}\n`
      : "";

  return `You are generating recommendations for a personal knowledge base weekly reflection.

WEEKLY REFLECTION:
${input.reflectionContent}

AI PROFILE:
${profileSummary}

RECENT TITLES AND TAGS:
${recentTitles}
${previousRecs}
Return a JSON array of exactly 3 recommendations. Each item must have this shape:
{
  "type": "book" | "film" | "show" | "essay" | "podcast" | "article",
  "title": "string",
  "creator": "string",
  "year": "optional string",
  "url": "optional string — a direct https:// link to the work (publisher page, streaming platform, podcast feed, etc.) when one exists",
  "reason": "1-2 sentences explaining exactly how this connects to the reflection's themes"
}

Requirements:
- Ground each recommendation in the reflection's specific themes, tensions, curiosities, or patterns.
- Mix media types when possible instead of recommending three items from the same category. If the user's profile shows they save mostly one type (e.g. articles), lean toward other formats for variety.
- Prefer depth, resonance, and timelessness over generic popularity.
- Use web search when helpful for recency or accuracy, but do not turn this into a list of trending items.
- Avoid duplicates of things the user has already saved (see titles/tags above) or been recommended before (see previously recommended above).
- Keep reasons concrete and personal to the reflection, not generic blurbs.
- Include a url when you can find a reliable one — articles and essays almost always have one; books can link to a publisher or bookshop.org page.

Return ONLY the JSON array. No prose before or after it.`;
}

// ============================================================================
// RESPONSE EXTRACTION
// ============================================================================
// Anthropic returns an array of content blocks. We only care about text blocks;
// tool use blocks are internal steps on the way to the final answer.

function extractTextFromAnthropicResponse(response: {
  content?: Array<{ type: string; text?: string }>;
}): string {
  const textBlocks = (response.content || []).filter(
    (block): block is { type: "text"; text: string } =>
      block.type === "text" && typeof block.text === "string"
  );

  return textBlocks.map((block) => block.text).join("\n").trim();
}

// ============================================================================
// RESPONSE PARSING
// ============================================================================
// LLMs are good at structured output, but not perfect. They might:
//   - return raw JSON
//   - wrap the JSON in ```json fences
//   - include one malformed item in an otherwise good array
//
// We take a tolerant approach:
//   1. Try to extract JSON
//   2. Parse it
//   3. Validate each object
//   4. Keep the valid ones and drop the rest
//
// This "partial success" approach is important because recommendations are
// additive. If Claude gives us 2 valid items and 1 malformed one, the user is
// still better off seeing the 2 good recommendations.

export function parseRecommendationsResponse(
  response: string
): Recommendation[] {
  const jsonStr = extractJsonString(response);

  try {
    const parsed = JSON.parse(jsonStr);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .map((item) => normalizeRecommendation(item))
      .filter((item): item is Recommendation => item !== null)
      .slice(0, 3);
  } catch {
    console.warn(
      "[generate-recommendations] Failed to parse recommendation JSON:",
      jsonStr.slice(0, 200)
    );
    return [];
  }
}

// Pull JSON out of a fenced markdown block if present. If not, assume the
// whole response is meant to be JSON already.
function extractJsonString(response: string): string {
  const jsonMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/);
  return jsonMatch ? jsonMatch[1].trim() : response.trim();
}

// ============================================================================
// OBJECT VALIDATION
// ============================================================================
// Converts unknown JSON values into a trusted Recommendation or null.
// Returning null instead of throwing keeps parsing robust and easy to teach:
// "invalid item in, item dropped out".

export function normalizeRecommendation(
  value: unknown
): Recommendation | null {
  if (!value || typeof value !== "object") return null;

  const candidate = value as Record<string, unknown>;

  const type = normalizeType(candidate.type);
  const title = normalizeRequiredString(candidate.title);
  const creator = normalizeRequiredString(candidate.creator);
  const reason = normalizeRequiredString(candidate.reason);

  if (!type || !title || !creator || !reason) {
    return null;
  }

  const year = normalizeOptionalString(candidate.year);
  // Only accept https:// URLs. This guards against javascript: URIs and other
  // unexpected schemes that could reach the UI as a clickable href.
  const url = normalizeHttpsUrl(candidate.url);

  return {
    type,
    title,
    creator,
    ...(year ? { year } : {}),
    ...(url ? { url } : {}),
    reason,
  };
}

function normalizeType(value: unknown): RecommendationType | null {
  if (typeof value !== "string") return null;

  const normalized = value.trim().toLowerCase() as RecommendationType;
  return ALLOWED_TYPES.includes(normalized) ? normalized : null;
}

function normalizeRequiredString(value: unknown): string | null {
  if (typeof value !== "string") return null;

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeOptionalString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

// Only allow https:// URLs so we never render a javascript: or data: href in
// the UI. Returns undefined for anything that doesn't start with https://.
function normalizeHttpsUrl(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;

  const trimmed = value.trim();
  return trimmed.startsWith("https://") ? trimmed : undefined;
}

// Turns { article: 30, note: 20, quote: 5 } into "article (30), note (20),
// quote (5)" — a compact string for the prompt that tells Claude what media
// types the user already engages with, sorted by frequency.
function formatContentBreakdown(breakdown: Record<string, number>): string {
  return Object.entries(breakdown)
    .sort((a, b) => b[1] - a[1])
    .map(([type, count]) => `${type} (${count})`)
    .join(", ");
}
