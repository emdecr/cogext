// ============================================================================
// AI PROVIDER FACTORY
// ============================================================================
//
// This is the ONLY file that knows about specific provider implementations.
// Every other file in the app imports from HERE, never from a specific
// provider file.
//
// To swap providers:
//   1. Create a new implementation (e.g., openai-embedding.ts)
//   2. Change the function below to return the new class
//   3. Done. No other file needs to change.
//
// Why functions instead of just exporting instances?
//   - Lazy initialization: the provider is only created when first needed
//   - Avoids errors if env vars aren't set (e.g., in test environments)
//   - Makes it easy to add logic like "use OpenAI if API key is set,
//     otherwise throw an error"
//
// PROVIDER STRATEGY:
//   All AI tasks use cloud APIs:
//     - Embeddings:  Voyage AI (voyage-3-lite) — 1024-dim vectors
//     - Tagging:     Claude (haiku) — fast, cheap, good enough for tags
//     - Chat:        Claude (sonnet) — high quality, streaming, great at synthesis
// ============================================================================

import type { EmbeddingProvider, LLMProvider } from "./types";

// We cache provider instances so they're only created once (singleton pattern).
// The same provider is reused across all requests.
//
// Note: we have TWO LLM singletons — one for tagging, one for chat.
// Both use Claude now, but could use different models (e.g., Haiku for
// tagging, Sonnet for chat).
let embeddingProvider: EmbeddingProvider | null = null;
let llmProvider: LLMProvider | null = null;
let chatProvider: LLMProvider | null = null;

// ============================================================================
// GET EMBEDDING PROVIDER
// ============================================================================
// Returns a singleton Voyage AI embedding provider.
// Lazy-loaded via dynamic import so the module (and its SDK) aren't loaded
// until first use — avoids errors in test environments where VOYAGE_API_KEY
// isn't set.

export async function getEmbeddingProvider(): Promise<EmbeddingProvider> {
  if (!embeddingProvider) {
    const { VoyageEmbeddingProvider } = await import("./voyage-embedding");
    embeddingProvider = new VoyageEmbeddingProvider();
  }

  return embeddingProvider;
}

// ============================================================================
// GET LLM PROVIDER (for tagging)
// ============================================================================
// Returns the provider used for AUTO-TAGGING. Uses Claude (same provider
// as chat, but callers only use generateTags()).

export async function getLLMProvider(): Promise<LLMProvider> {
  if (!llmProvider) {
    const { ClaudeLLMProvider } = await import("./claude-llm");
    llmProvider = new ClaudeLLMProvider();
  }

  return llmProvider;
}

// ============================================================================
// GET CHAT PROVIDER (for conversations)
// ============================================================================
// Returns the provider used for CONVERSATIONAL CHAT.
// Uses Claude — high-quality model for synthesizing across multiple
// records, following citation instructions, multi-turn reasoning.

export async function getChatProvider(): Promise<LLMProvider> {
  if (!chatProvider) {
    const { ClaudeLLMProvider } = await import("./claude-llm");
    chatProvider = new ClaudeLLMProvider();
  }

  return chatProvider;
}

// Re-export types so consumers can import everything from "@/lib/ai"
export type { EmbeddingProvider, LLMProvider, ChatMessage } from "./types";
