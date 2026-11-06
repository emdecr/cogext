// ============================================================================
// EMBEDDING TEXT — pure, no DB/provider imports
// ============================================================================
// Lives apart from embed-record.ts so scripts/re-embed-all.ts can import it
// without pulling in the app's DB connection. One copy, no drift.
// ============================================================================

// We combine all meaningful text fields into one string for embedding.
// Why combine instead of embedding each field separately?
//   - One embedding per record is simpler and cheaper
//   - The embedding captures the OVERALL meaning of the record
//   - Individual fields alone might lack context ("Untitled" tells us nothing,
//     but "Untitled" + content about pasta recipes does)
//
// We prefix each section so the model understands the structure.
// "Title: Quick Pasta" gives more signal than just "Quick Pasta".

// Exported so unit tests can verify the text preparation logic directly.
// This function is pure — no side effects, no I/O — making it ideal to
// test in isolation without mocking the database or embedding provider.
export function prepareTextForEmbedding(record: {
  title: string | null;
  content: string;
  sourceAuthor: string | null;
  note: string | null;
  type: string;
  releaseYear?: number | null;
}): string {
  const parts: string[] = [];

  // Include the record type for context
  parts.push(`Type: ${record.type}`);

  if (record.title) {
    parts.push(`Title: ${record.title}`);
  }

  parts.push(`Content: ${record.content}`);

  // Movies and shows label the creator by role; everything else (books,
  // quotes, links…) keeps "Author" so existing embedding text is unchanged.
  if (record.sourceAuthor) {
    const creatorLabel =
      record.type === "movie"
        ? "Director"
        : record.type === "show"
          ? "Creator"
          : "Author";
    parts.push(`${creatorLabel}: ${record.sourceAuthor}`);
  }

  if (record.releaseYear) {
    parts.push(`Year: ${record.releaseYear}`);
  }

  if (record.note) {
    parts.push(`Note: ${record.note}`);
  }

  return parts.join("\n");
}
