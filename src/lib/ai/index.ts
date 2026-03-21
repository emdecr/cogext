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
//     otherwise fall back to Ollama"
//
// SPLIT PROVIDER STRATEGY (Phase 3):
//   We use DIFFERENT providers for different tasks:
//     - Embeddings:  Ollama (nomic-embed-text) — free, local, good quality
//     - Tagging:     Ollama (llama3.2:1b) — free, local, good enough for tags
//     - Chat:        Claude (sonnet) — high quality, streaming, great at synthesis
//
//   This split is intentional: tagging is a simple, high-volume task where
//   local models save cost. Chat requires nuanced reasoning across multiple
//   records, where a frontier model shines.
//
//   To use Claude for everything: change getLLMProvider() to return Claude.
//   To use Ollama for everything: implement chat methods in ollama-llm.ts.
// ============================================================================

import type { EmbeddingProvider, LLMProvider } from "./types";

// We cache provider instances so they're only created once (singleton pattern).
// The same provider is reused across all requests.
//
// Note: we have TWO LLM singletons now — one for tagging (Ollama),
// one for chat (Claude). This is because they serve different purposes
// and may use different models/providers.
let embeddingProvider: EmbeddingProvider | null = null;
let llmProvider: LLMProvider | null = null;
let chatProvider: LLMProvider | null = null;

// ============================================================================
// GET EMBEDDING PROVIDER
// ============================================================================
// Returns a singleton instance. Now async because we use dynamic import()
// instead of require() — dynamic import is the ESM-friendly way to load
// modules lazily.
//
// Dynamic import() vs static import:
//   - Static: `import { Foo } from "./foo"` — loaded immediately when
//     this file is first imported, even if never used
//   - Dynamic: `await import("./foo")` — loaded only when this line runs
//
// This matters because:
//   1. In test environments, Ollama might not be running — lazy loading
//      means the provider code (which tries to connect) isn't loaded
//      unless a test actually needs it
//   2. If you add multiple providers, only the active one gets loaded

export async function getEmbeddingProvider(): Promise<EmbeddingProvider> {
  if (!embeddingProvider) {
    // -------------------------------------------------------------------
    // SWAP POINT: Change this block to use a different provider.
    //
    // Example for OpenAI:
    //   const { OpenAIEmbeddingProvider } = await import("./openai-embedding");
    //   embeddingProvider = new OpenAIEmbeddingProvider();
    //
    // Example for conditional selection:
    //   if (process.env.OPENAI_API_KEY) {
    //     const { OpenAIEmbeddingProvider } = await import("./openai-embedding");
    //     embeddingProvider = new OpenAIEmbeddingProvider();
    //   } else {
    //     const { OllamaEmbeddingProvider } = await import("./ollama-embedding");
    //     embeddingProvider = new OllamaEmbeddingProvider();
    //   }
    // -------------------------------------------------------------------
    const { OllamaEmbeddingProvider } = await import("./ollama-embedding");
    embeddingProvider = new OllamaEmbeddingProvider();
  }

  return embeddingProvider;
}

// ============================================================================
// GET LLM PROVIDER (for tagging)
// ============================================================================
// Returns the provider used for AUTO-TAGGING. This is the high-volume,
// simple task — we use Ollama (local, free) by default.
//
// Existing code that calls getLLMProvider() (e.g., embed-record.ts for
// auto-tagging) continues to work unchanged.

export async function getLLMProvider(): Promise<LLMProvider> {
  if (!llmProvider) {
    // -------------------------------------------------------------------
    // SWAP POINT: Change this to use Claude or another provider for tags.
    // -------------------------------------------------------------------
    const { OllamaLLMProvider } = await import("./ollama-llm");
    llmProvider = new OllamaLLMProvider();
  }

  return llmProvider;
}

// ============================================================================
// GET CHAT PROVIDER (for conversations)
// ============================================================================
// Returns the provider used for CONVERSATIONAL CHAT (Phase 3).
// This is the task that needs a high-quality model — synthesizing across
// multiple records, following citation instructions, multi-turn reasoning.
//
// Uses Claude by default. Falls back to the tagging LLM provider if no
// API key is set (useful for development/testing without an API key,
// though chat quality will be limited with a 1B model).

export async function getChatProvider(): Promise<LLMProvider> {
  if (!chatProvider) {
    // -------------------------------------------------------------------
    // SWAP POINT: Change this to use a different chat provider.
    //
    // Example for OpenAI:
    //   const { OpenAILLMProvider } = await import("./openai-llm");
    //   chatProvider = new OpenAILLMProvider();
    // -------------------------------------------------------------------
    if (process.env.ANTHROPIC_API_KEY) {
      const { ClaudeLLMProvider } = await import("./claude-llm");
      chatProvider = new ClaudeLLMProvider();
    } else {
      // Fallback: use the same provider as tagging. Chat quality will
      // be limited, but at least nothing crashes during development.
      console.warn(
        "ANTHROPIC_API_KEY not set — falling back to Ollama for chat. " +
          "Chat quality will be limited. Set ANTHROPIC_API_KEY in .env " +
          "for production-quality conversations."
      );
      chatProvider = await getLLMProvider();
    }
  }

  return chatProvider;
}

// Re-export types so consumers can import everything from "@/lib/ai"
export type { EmbeddingProvider, LLMProvider, ChatMessage } from "./types";
