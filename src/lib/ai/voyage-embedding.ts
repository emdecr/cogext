// ============================================================================
// VOYAGE AI EMBEDDING PROVIDER
// ============================================================================
//
// Implements the EmbeddingProvider interface using Voyage AI's REST API.
// Voyage AI is Anthropic's recommended embedding partner.
//
// Model: voyage-4-lite
//   - 1024-dimensional vectors
//   - ~$0.02 per 1M tokens
//   - Good quality, low cost
//
// We use fetch() directly instead of the `voyageai` npm package because
// the SDK has broken ESM exports that cause ERR_UNSUPPORTED_DIR_IMPORT
// in Next.js. The API is a single endpoint — no SDK needed.
//
// API: POST https://api.voyageai.com/v1/embeddings
//   Request:  { input: ["text1", "text2"], model: "voyage-4-lite" }
//   Response: { data: [{ embedding: [0.12, -0.34, ...], index: 0 }] }
// ============================================================================

import type { EmbeddingProvider, OutcomeCallback } from "./types";
import { reportOutcome } from "./outcome";
import { modelFor } from "./model-settings";
import { AiHttpError, AiInvalidResponseError } from "./errors";

const VOYAGE_API_URL = "https://api.voyageai.com/v1/embeddings";

// Shape of each item in the Voyage API response.
interface VoyageEmbeddingItem {
  embedding: number[];
  index: number;
}

interface VoyageAPIResponse {
  data: VoyageEmbeddingItem[];
  // Voyage bills embeddings per input token.
  usage?: { total_tokens: number };
}

export class VoyageEmbeddingProvider implements EmbeddingProvider {
  private apiKey: string;
  private model: string;

  // voyage-4-lite produces 1024-dimensional vectors.
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

    this.apiKey = apiKey;
    this.model = modelFor("EMBED_MODEL");
  }

  // ---- Single text embedding ----
  async embed(text: string, onOutcome?: OutcomeCallback): Promise<number[]> {
    const results = await this.embedBatch([text], onOutcome);
    return results[0];
  }

  // ---- Batch embedding ----
  // Voyage supports batching up to 128 texts per request.
  // Reports one outcome per request and rethrows failures (callers decide
  // whether an embedding failure is fatal).
  async embedBatch(texts: string[], onOutcome?: OutcomeCallback): Promise<number[][]> {
    const meta = { provider: "voyage" as const, model: this.model };
    try {
      const embeddings = await this.requestEmbeddings(texts);
      reportOutcome(onOutcome, {
        ...meta,
        status: "ok",
        usage: { inputTokens: embeddings.totalTokens, outputTokens: 0 },
      });
      return embeddings.vectors;
    } catch (error) {
      reportOutcome(onOutcome, { ...meta, status: "error", error });
      throw error;
    }
  }

  private async requestEmbeddings(
    texts: string[]
  ): Promise<{ vectors: number[][]; totalTokens: number }> {
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
      // Typed so classifyAiError() reads the status directly (message
      // format unchanged).
      throw new AiHttpError(
        "voyage",
        response.status,
        `Voyage AI API error (${response.status}): ${body}`
      );
    }

    const result: VoyageAPIResponse = await response.json();

    if (!result.data || result.data.length === 0) {
      throw new AiInvalidResponseError("Voyage embedding returned no data");
    }

    // Sort by index to ensure order matches input, then extract embeddings.
    const sorted = [...result.data].sort((a, b) => a.index - b.index);

    const vectors = sorted.map((item) => {
      if (!item.embedding) {
        throw new AiInvalidResponseError("Voyage embedding returned null embedding for an item");
      }
      return item.embedding;
    });
    return { vectors, totalTokens: result.usage?.total_tokens ?? 0 };
  }
}
