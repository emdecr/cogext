// ============================================================================
// SEARCH SERVER ACTION
// ============================================================================
//
// Hybrid search: combines semantic search (pgvector cosine similarity)
// with keyword search (Postgres full-text search) for the best of both:
//
//   Semantic: "healthy dinner ideas" finds "Mediterranean diet recipes"
//             (different words, similar meaning)
//
//   Keyword:  "PostgreSQL" finds records with that exact word
//             (semantic models sometimes miss proper nouns and jargon)
//
// The two result sets are merged using Reciprocal Rank Fusion (RRF),
// which combines rankings from different sources into a single score.
// Records that rank highly in BOTH searches get the best combined score.
//
// Flow:
//   1. User types query
//   2. Embed the query → vector
//   3. Run semantic search (cosine distance via pgvector)
//   4. Run keyword search (Postgres ts_vector full-text search)
//   5. Merge results with RRF
//   6. Return top results
// ============================================================================

"use server";

import { eq, sql, desc, and, isNotNull } from "drizzle-orm";

import { db } from "@/db";
import { records } from "@/db/schema";
import { getSession } from "@/lib/auth/session";
import { getEmbeddingProvider } from "@/lib/ai";
import { redirect } from "next/navigation";

// ============================================================================
// TYPES
// ============================================================================

type SearchResult = {
  id: string;
  type: "image" | "quote" | "article" | "link" | "note";
  title: string | null;
  content: string;
  sourceUrl: string | null;
  sourceAuthor: string | null;
  imagePath: string | null;
  note: string | null;
  createdAt: Date;
  // Combined relevance score (higher = more relevant)
  score: number;
  // Which search method(s) found this result
  matchType: "semantic" | "keyword" | "both";
};

// ============================================================================
// SEARCH
// ============================================================================

export async function searchRecords(query: string): Promise<SearchResult[]> {
  const session = await getSession();
  if (!session) redirect("/login");

  const userId = session.userId;
  const trimmed = query.trim();

  if (!trimmed) return [];

  // Run semantic and keyword searches in parallel
  const [semanticResults, keywordResults] = await Promise.all([
    semanticSearch(userId, trimmed),
    keywordSearch(userId, trimmed),
  ]);

  // Merge results using Reciprocal Rank Fusion
  return mergeResults(semanticResults, keywordResults);
}

// ============================================================================
// SEMANTIC SEARCH
// ============================================================================
// Embeds the query and finds records with the closest embeddings.
// Uses pgvector's <=> operator (cosine distance).
//
// Cosine distance: 0 = identical, 1 = orthogonal, 2 = opposite
// We convert to a similarity score: 1 - distance (so 1 = best match)

async function semanticSearch(
  userId: string,
  query: string,
): Promise<{ id: string; score: number }[]> {
  try {
    const provider = await getEmbeddingProvider();
    const queryEmbedding = await provider.embed(query);

    // Convert the embedding array to a pgvector-compatible string
    // format: '[0.12, -0.34, 0.56, ...]'
    const embeddingStr = `[${queryEmbedding.join(",")}]`;

    // Query Postgres for the closest embeddings.
    //
    // The <=> operator computes cosine distance between two vectors.
    // We ORDER BY distance ascending (closest first) and LIMIT to 20.
    //
    // The HNSW index we created makes this fast — without it, Postgres
    // would scan every row and compute distance for each one.
    const results = await db
      .select({
        id: records.id,
        // 1 - distance = similarity score (1 = identical, 0 = unrelated)
        score: sql<number>`1 - (${records.embedding} <=> ${embeddingStr}::vector)`,
      })
      .from(records)
      .where(
        and(
          eq(records.userId, userId),
          isNotNull(records.embedding),
        ),
      )
      .orderBy(sql`${records.embedding} <=> ${embeddingStr}::vector`)
      .limit(20);

    return results;
  } catch (error) {
    // If embedding fails (Ollama down, etc.), fall back to keyword-only
    console.error("Semantic search failed:", error);
    return [];
  }
}

// ============================================================================
// KEYWORD SEARCH
// ============================================================================
// Uses Postgres full-text search. This converts text into "tsvector"
// (a list of normalized words) and queries against it with "tsquery".
//
// Example:
//   text: "Quick brown foxes jumped" → tsvector: 'brown' 'fox' 'jump' 'quick'
//   query: "jumping fox" → tsquery: 'jump' & 'fox'
//   Result: MATCH (stems match even though exact words differ)
//
// plainto_tsquery handles the conversion automatically — we don't need
// to write tsquery syntax ourselves.
//
// ts_rank returns a relevance score based on how well the document matches.

async function keywordSearch(
  userId: string,
  query: string,
): Promise<{ id: string; score: number }[]> {
  try {
    // Search across title, content, note, and sourceAuthor.
    // We concatenate them with coalesce() to handle nulls, and
    // use || ' ' || to join them with spaces.
    //
    // 'english' tells Postgres to use English stemming rules
    // (so "running" matches "run", "better" matches "good", etc.)
    const results = await db
      .select({
        id: records.id,
        score: sql<number>`ts_rank(
          to_tsvector('english',
            coalesce(${records.title}, '') || ' ' ||
            ${records.content} || ' ' ||
            coalesce(${records.note}, '') || ' ' ||
            coalesce(${records.sourceAuthor}, '')
          ),
          plainto_tsquery('english', ${query})
        )`,
      })
      .from(records)
      .where(
        and(
          eq(records.userId, userId),
          // Only include rows where there's actually a match.
          // The @@ operator returns true if the tsvector matches the tsquery.
          sql`to_tsvector('english',
            coalesce(${records.title}, '') || ' ' ||
            ${records.content} || ' ' ||
            coalesce(${records.note}, '') || ' ' ||
            coalesce(${records.sourceAuthor}, '')
          ) @@ plainto_tsquery('english', ${query})`,
        ),
      )
      .orderBy(
        desc(
          sql`ts_rank(
            to_tsvector('english',
              coalesce(${records.title}, '') || ' ' ||
              ${records.content} || ' ' ||
              coalesce(${records.note}, '') || ' ' ||
              coalesce(${records.sourceAuthor}, '')
            ),
            plainto_tsquery('english', ${query})
          )`,
        ),
      )
      .limit(20);

    return results;
  } catch (error) {
    console.error("Keyword search failed:", error);
    return [];
  }
}

// ============================================================================
// RECIPROCAL RANK FUSION (RRF)
// ============================================================================
// Combines rankings from semantic and keyword search into one score.
//
// The formula: score = 1 / (k + rank)
// where k is a constant (typically 60) that prevents high ranks from
// dominating too much.
//
// Example with k=60:
//   Rank 1 → 1/61 = 0.0164
//   Rank 2 → 1/62 = 0.0161
//   Rank 10 → 1/70 = 0.0143
//
// If a record is rank 1 in semantic AND rank 3 in keyword:
//   combined = 1/61 + 1/63 = 0.0323  (high — found by both!)
//
// If a record is rank 1 in semantic but not found by keyword:
//   combined = 1/61 + 0 = 0.0164  (lower — only one method found it)

const RRF_K = 60;

async function mergeResults(
  semanticResults: { id: string; score: number }[],
  keywordResults: { id: string; score: number }[],
): Promise<SearchResult[]> {
  // Build a map of id → combined RRF score
  const scoreMap = new Map<
    string,
    { score: number; inSemantic: boolean; inKeyword: boolean }
  >();

  // Add semantic scores
  semanticResults.forEach((result, index) => {
    const rrfScore = 1 / (RRF_K + index + 1);
    scoreMap.set(result.id, {
      score: rrfScore,
      inSemantic: true,
      inKeyword: false,
    });
  });

  // Add keyword scores (combine if already present from semantic)
  keywordResults.forEach((result, index) => {
    const rrfScore = 1 / (RRF_K + index + 1);
    const existing = scoreMap.get(result.id);

    if (existing) {
      existing.score += rrfScore;
      existing.inKeyword = true;
    } else {
      scoreMap.set(result.id, {
        score: rrfScore,
        inSemantic: false,
        inKeyword: true,
      });
    }
  });

  if (scoreMap.size === 0) return [];

  // Fetch full record data for the results
  const resultIds = Array.from(scoreMap.keys());

  const fullRecords = await db.query.records.findMany({
    where: sql`${records.id} IN (${sql.join(
      resultIds.map((id) => sql`${id}`),
      sql`, `,
    )})`,
    with: {
      recordTags: {
        with: {
          tag: true,
        },
      },
    },
  });

  // Combine record data with scores and sort by score descending
  return fullRecords
    .map((record) => {
      const scoreData = scoreMap.get(record.id)!;
      return {
        id: record.id,
        type: record.type,
        title: record.title,
        content: record.content,
        sourceUrl: record.sourceUrl,
        sourceAuthor: record.sourceAuthor,
        imagePath: record.imagePath,
        note: record.note,
        createdAt: record.createdAt,
        score: scoreData.score,
        matchType: (scoreData.inSemantic && scoreData.inKeyword
          ? "both"
          : scoreData.inSemantic
            ? "semantic"
            : "keyword") as "semantic" | "keyword" | "both",
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 15);
}
