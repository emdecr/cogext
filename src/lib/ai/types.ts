// ============================================================================
// AI PROVIDER INTERFACES
// ============================================================================
//
// These interfaces define the CONTRACT that any AI provider must follow.
// The rest of the app only imports these interfaces — it never imports
// a specific provider directly. This is the "abstraction" that lets us
// swap providers without changing app code.
//
// Think of it like a power outlet: your lamp doesn't care if the
// electricity comes from solar, wind, or coal. It just needs 120V AC
// from a standard outlet. The interface IS the outlet shape.
//
// To swap providers, you change ONE file (the factory in ./index.ts)
// and everything else keeps working.
// ============================================================================

// ============================================================================
// EMBEDDING PROVIDER
// ============================================================================
// Converts text into a vector (array of numbers) that captures its meaning.
// Two texts with similar meanings produce vectors that are close together
// in vector space — this is how semantic search works.
//
// Example:
//   embed("delicious pasta recipe") → [0.12, -0.34, 0.56, ...]
//   embed("how to cook spaghetti")  → [0.11, -0.33, 0.55, ...]  ← very similar!
//   embed("quantum physics theory") → [-0.78, 0.23, -0.91, ...]  ← very different

export interface EmbeddingProvider {
  // Convert a single text into a vector
  embed(text: string): Promise<number[]>;

  // Convert multiple texts at once (more efficient than calling embed()
  // in a loop — providers can batch the work internally)
  embedBatch(texts: string[]): Promise<number[][]>;

  // The size of vectors this provider produces. Must match the database
  // column size. nomic-embed-text = 768, OpenAI small = 1536.
  // Changing providers with different dimensions requires re-embedding
  // all existing records.
  dimensions: number;
}

// ============================================================================
// LLM PROVIDER
// ============================================================================
// A language model that can analyze content and generate structured output.
// Used for auto-tagging and (later) conversations.
//
// We keep this interface narrow on purpose — each method does ONE thing.
// Adding new capabilities means adding new methods, not changing existing ones.

export interface LLMProvider {
  // Analyze a record's content and suggest relevant tags.
  // Returns an array of tag name strings (e.g., ["recipes", "italian", "pasta"]).
  // The `type` parameter helps the LLM understand context
  // (a "quote" gets different tags than a "link").
  generateTags(content: string, type: string): Promise<string[]>;
}
