// ============================================================================
// RECOMMENDATION TYPES
// ============================================================================
//
// Weekly reflection recommendations are stored as JSONB on the `reflections`
// table. We keep the TypeScript shape in one small shared file so:
//   1. The database layer, AI generator, server actions, and UI all agree
//      on the same structure
//   2. Future changes only need to update one type definition
//   3. The rest of the codebase can import the recommendation shape without
//      pulling in a provider-specific helper
//
// Why a dedicated file instead of declaring the type inline everywhere?
//   Inline types are fine when data only lives in one place. Here the same
//   structure crosses several layers of the app, so a shared home keeps the
//   code easier to teach from and easier to maintain.
// ============================================================================

// The allowed recommendation categories. Keeping them as a string union gives
// us both autocomplete in the editor and runtime validation targets when we
// parse Claude's JSON response.
//
// This array is exported so generate-recommendations.ts can use it for runtime
// validation without duplicating the list. The type and the array stay in sync
// in one place.
export type RecommendationType =
  | "book"
  | "film"
  | "show"
  | "essay"
  | "podcast"
  | "article";

// The structured shape stored in the reflections.recommendations JSONB column.
// `year` stays optional because the model may recommend timeless essays,
// podcast episodes, or hard-to-date works where a year is unavailable.
export type Recommendation = {
  type: RecommendationType;
  title: string;
  creator: string;
  year?: string;
  reason: string;
};

// ============================================================================
// STORED JSONB NORMALIZATION
// ============================================================================
//
// Postgres JSONB comes back from Drizzle as `unknown`. This helper converts the
// stored value into a safe Recommendation[] shape for the rest of the app.
//
// We keep it intentionally forgiving:
//   - null / malformed data -> []
//   - valid-looking objects -> passed through
//
// The AI parser in generate-recommendations.ts is stricter. This helper's job
// is different: safely reading already-stored data, including older rows.

export const ALLOWED_TYPES: RecommendationType[] = [
  "book",
  "film",
  "show",
  "essay",
  "podcast",
  "article",
];

export function normalizeStoredRecommendations(
  value: unknown
): Recommendation[] {
  if (!Array.isArray(value)) return [];

  return value
    .filter((item): item is Recommendation => {
      if (!item || typeof item !== "object") return false;

      const candidate = item as Record<string, unknown>;
      return (
        typeof candidate.type === "string" &&
        ALLOWED_TYPES.includes(candidate.type as RecommendationType) &&
        typeof candidate.title === "string" &&
        typeof candidate.creator === "string" &&
        typeof candidate.reason === "string"
      );
    })
    .map((item) => ({
      type: item.type,
      title: item.title,
      creator: item.creator,
      ...(typeof item.year === "string" && item.year.trim().length > 0
        ? { year: item.year }
        : {}),
      reason: item.reason,
    }));
}
