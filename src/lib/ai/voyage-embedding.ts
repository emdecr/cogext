// ============================================================================
// VOYAGE AI EMBEDDING PROVIDER
// ============================================================================
//
// Implements the EmbeddingProvider interface using Voyage AI's REST API.
// Voyage AI is Anthropic's recommended embedding partner.
//
// Model: voyage-3-lite
//   - 1024-dimensional vectors
//   - ~$0.02 per 1M tokens
//   - Good quality, low cost
//
// We use fetch() directly instead of the `voyageai` npm package because
// the SDK has broken ESM exports that cause ERR_UNSUPPORTED_DIR_IMPORT
// in Next.js. The API is a single endpoint — no SDK needed.
//
// API: POST https://api.voyageai.com/v1/embeddings
//   Request:  { input: ["text1", "text2"], model: "voyage-3-lite" }
//   Response: { data: [{ embedding: [0.12, -0.34, ...], index: 0 }] }
// ============================================================================

import type { EmbeddingProvider } from "./types";

const VOYAGE_API_URL = "https://api.voyageai.com/v1/embeddings";

// Shape of each item in the Voyage API response.
interface VoyageEmbeddingItem {
  embedding: number[];
  index: number;
}

interface VoyageAPIResponse {
  data: VoyageEmbeddingItem[];
}

export class VoyageEmbeddingProvider implements EmbeddingProvider {
  private apiKey: string;
  private model: string;

  // voyage-3-lite produces 512-dimensional vectors.
  // This MUST match the vector column size in the database.
  readonly dimensions = 512;

  constructor() {
    const apiKey = process.env.VOYAGE_API_KEY;
    if (!apiKey) {
      throw new Error(
        "VOYAGE_API_KEY is required for embeddings.\n" +
          "Get your key at https://dash.voyageai.com/ and add it to your .env file."
      );
    }

    this.apiKey = apiKey;
    this.model = process.env.EMBED_MODEL || "voyage-3-lite";
  }

  // ---- Single text embedding ----
  async embed(text: string): Promise<number[]> {
    const results = await this.embedBatch([text]);
    return results[0];
  }

  // ---- Batch embedding ----
  // Voyage supports batching up to 128 texts per request.
  async embedBatch(texts: string[]): Promise<number[][]> {
    const response = await fetch(VOYAGE_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        input: texts,
        model: this.model,
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(
        `Voyage AI API error (${response.status}): ${body}`
      );
    }

    const result: VoyageAPIResponse = await response.json();

    if (!result.data || result.data.length === 0) {
      throw new Error("Voyage embedding returned no data");
    }

    // Sort by index to ensure order matches input, then extract embeddings.
    const sorted = [...result.data].sort((a, b) => a.index - b.index);

    return sorted.map((item) => {
      if (!item.embedding) {
        throw new Error("Voyage embedding returned null embedding for an item");
      }
      return item.embedding;
    });
  }
}
