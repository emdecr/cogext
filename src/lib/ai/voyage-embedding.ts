// ============================================================================
// VOYAGE AI EMBEDDING PROVIDER
// ============================================================================
//
// Implements the EmbeddingProvider interface using Voyage AI's API.
// Voyage AI is Anthropic's recommended embedding partner.
//
// Model: voyage-3-lite
//   - 1024-dimensional vectors
//   - ~$0.02 per 1M tokens
//   - Good quality, low cost
//
// SDK: The `voyageai` npm package provides a typed client.
//   client.embed({ input: "text" | ["text1", "text2"], model: "voyage-3-lite" })
//   → { data: [{ embedding: [0.12, -0.34, ...], index: 0 }] }
// ============================================================================

import { VoyageAIClient } from "voyageai";
import type { EmbeddingProvider } from "./types";

export class VoyageEmbeddingProvider implements EmbeddingProvider {
  private client: VoyageAIClient;
  private model: string;

  // voyage-3-lite produces 1024-dimensional vectors.
  // This MUST match the vector column size in the database.
  readonly dimensions = 1024;

  constructor() {
    const apiKey = process.env.VOYAGE_API_KEY;
    if (!apiKey) {
      throw new Error(
        "VOYAGE_API_KEY is required for embeddings.\n" +
          "Get your key at https://dash.voyageai.com/ and add it to your .env file."
      );
    }

    this.client = new VoyageAIClient({ apiKey });
    this.model = process.env.EMBED_MODEL || "voyage-3-lite";
  }

  // ---- Single text embedding ----
  async embed(text: string): Promise<number[]> {
    const results = await this.embedBatch([text]);
    return results[0];
  }

  // ---- Batch embedding ----
  // Voyage supports batching up to 128 texts per request.
  // The SDK accepts `input` as a string or array of strings.
  async embedBatch(texts: string[]): Promise<number[][]> {
    const response = await this.client.embed({
      input: texts,
      model: this.model,
    });

    if (!response.data) {
      throw new Error("Voyage embedding returned no data");
    }

    // Sort by index to ensure order matches input, then extract embeddings.
    const sorted = [...response.data].sort(
      (a, b) => (a.index ?? 0) - (b.index ?? 0)
    );

    return sorted.map((item) => {
      if (!item.embedding) {
        throw new Error("Voyage embedding returned null embedding for an item");
      }
      return item.embedding;
    });
  }
}
