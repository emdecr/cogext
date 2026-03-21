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
// ============================================================================

import type { EmbeddingProvider, LLMProvider } from "./types";

// We cache provider instances so they're only created once (singleton pattern).
// The same provider is reused across all requests.
let embeddingProvider: EmbeddingProvider | null = null;
let llmProvider: LLMProvider | null = null;

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
// GET LLM PROVIDER
// ============================================================================

export async function getLLMProvider(): Promise<LLMProvider> {
  if (!llmProvider) {
    // -------------------------------------------------------------------
    // SWAP POINT: Change this block to use a different LLM.
    //
    // Example for Claude:
    //   const { ClaudeLLMProvider } = await import("./claude-llm");
    //   llmProvider = new ClaudeLLMProvider();
    // -------------------------------------------------------------------
    const { OllamaLLMProvider } = await import("./ollama-llm");
    llmProvider = new OllamaLLMProvider();
  }

  return llmProvider;
}

// Re-export types so consumers can import everything from "@/lib/ai"
export type { EmbeddingProvider, LLMProvider } from "./types";
