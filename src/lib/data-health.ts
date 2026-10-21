// ============================================================================
// DATA HEALTH — pure helpers for the admin Data tab
// ============================================================================
//
// Turns raw counts into the tab's "is anything silently broken?" signals.
// Embedding and auto-tagging run in the background after a save and never
// block it, so when they fail the only trace is a record with no embedding
// (invisible to search and chat) or no tags. This surfaces those.
//
// No db/config imports, so it's unit-testable without mocks. Data gathering
// lives in src/lib/actions/admin/data.ts.
// ============================================================================

export type EmbeddingModelRow = { model: string | null; count: number };

export type EmbeddingModelStatus = EmbeddingModelRow & {
  status: "current" | "stale" | "unlabeled";
};

/**
 * Label each embedding_model group against the configured EMBED_MODEL.
 * "stale" = embedded by a different model. Vectors from different models
 * aren't comparable, so those records rank poorly (or wrongly) in search
 * until re-embedded. "unlabeled" = has a vector but no recorded model
 * (records embedded before embedding_model existed).
 * Sorted: current first, then by count.
 */
export function classifyEmbeddingModels(
  rows: EmbeddingModelRow[],
  currentModel: string
): EmbeddingModelStatus[] {
  const rank = { current: 0, stale: 1, unlabeled: 2 } as const;
  return rows
    .map((r): EmbeddingModelStatus => ({
      ...r,
      status:
        r.model === null ? "unlabeled" : r.model === currentModel ? "current" : "stale",
    }))
    .sort((a, b) => rank[a.status] - rank[b.status] || b.count - a.count);
}

export type DataWarning = { level: "error" | "warning"; message: string };

const plural = (n: number, one: string, many = `${one}s`) =>
  `${n} ${n === 1 ? one : many}`;

/** The banners shown at the top of the Data tab. Empty = all healthy. */
export function deriveDataWarnings(input: {
  missingEmbedding: number;
  untagged: number;
  staleEmbedding: number;
  currentModel: string;
}): DataWarning[] {
  const w: DataWarning[] = [];
  if (input.missingEmbedding > 0) {
    w.push({
      level: "error",
      message: `${plural(input.missingEmbedding, "record")} ${
        input.missingEmbedding === 1 ? "has" : "have"
      } no embedding, so search and chat can't find ${
        input.missingEmbedding === 1 ? "it" : "them"
      }. Run the re-embed script to fill them in.`,
    });
  }
  if (input.staleEmbedding > 0) {
    w.push({
      level: "warning",
      message: `${plural(input.staleEmbedding, "record")} ${
        input.staleEmbedding === 1 ? "was" : "were"
      } embedded with a different model than ${input.currentModel}. Search ranks them poorly until they're re-embedded.`,
    });
  }
  if (input.untagged > 0) {
    w.push({
      level: "warning",
      message: `${plural(input.untagged, "record")} ${
        input.untagged === 1 ? "has" : "have"
      } no tags. Auto-tagging may have failed for ${
        input.untagged === 1 ? "it" : "them"
      }.`,
    });
  }
  return w;
}

/** "42%" share of total, or "—" when there's nothing to divide by. */
export function percentOf(part: number, total: number): string {
  if (total <= 0) return "—";
  const pct = (part / total) * 100;
  return `${pct > 0 && pct < 1 ? "<1" : Math.round(pct)}%`;
}
