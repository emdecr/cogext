// ============================================================================
// OLLAMA EMBEDDING PROVIDER
// ============================================================================
//
// Implements the EmbeddingProvider interface using a local Ollama server.
// Ollama runs in Docker and serves models via a REST API.
//
// Model: nomic-embed-text
//   - 768-dimensional vectors
//   - ~300MB download
//   - Good quality for a local model
//   - ~100-500ms per embedding on CPU (fast enough for our use case)
//
// API endpoint: POST http://localhost:11434/api/embed
// Request body: { model: "nomic-embed-text", input: "some text" }
// Response: { embeddings: [[0.12, -0.34, ...]] }
//
// Ollama's /api/embed endpoint supports batching natively — you can pass
// an array of strings and get back an array of embeddings in one call.
// This is faster than making separate requests for each text.
// ============================================================================

import type { EmbeddingProvider } from "./types";

export class OllamaEmbeddingProvider implements EmbeddingProvider {
  // The Ollama server URL. In dev, Ollama runs in Docker on port 11434.
  // We read from env so it's easy to change in production.
  private baseUrl: string;
  private model: string;

  // nomic-embed-text produces 768-dimensional vectors.
  // This MUST match the vector column size in the database.
  readonly dimensions = 768;

  constructor() {
    this.baseUrl = process.env.OLLAMA_URL || "http://localhost:11434";
    this.model = process.env.OLLAMA_EMBED_MODEL || "nomic-embed-text";
  }

  // ---- Single text embedding ----
  async embed(text: string): Promise<number[]> {
    const results = await this.embedBatch([text]);
    return results[0];
  }

  // ---- Batch embedding ----
  // Ollama's /api/embed accepts `input` as a string or array of strings.
  // Batching is more efficient because:
  //   1. One HTTP request instead of N
  //   2. The model can process texts in parallel internally
  async embedBatch(texts: string[]): Promise<number[][]> {
    const response = await fetch(`${this.baseUrl}/api/embed`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: this.model,
        input: texts,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Ollama embedding failed: ${error}`);
    }

    const data = await response.json();

    // Ollama returns { embeddings: [[...], [...], ...] }
    return data.embeddings;
  }
}
