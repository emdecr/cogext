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
//     - Embeddings:  Voyage AI (voyage-4-lite) — 1024-dim vectors
//     - Tagging:     Claude (haiku) — fast, cheap, good enough for tags
//     - Chat:        Claude (sonnet) — high quality, streaming, great at synthesis
// ============================================================================

import type { EmbeddingProvider, LLMProvider } from "./types";
import { modelFor, ollamaModelFor, settingSource } from "./model-settings";
import type { ModelSetting, OllamaModelSetting } from "./models";

// ============================================================================
// ACTIVE PROVIDERS
// ============================================================================
// Which concrete providers the factories below construct. Not read by the
// factories (they name their classes directly); it labels the admin System
// tab's model table. KEEP IN SYNC when swapping providers in this file (the
// swap-ai-provider skill updates both).
export const ACTIVE_PROVIDERS: {
  llm: "claude" | "ollama";
  embedding: "voyage" | "ollama";
} = { llm: "claude", embedding: "voyage" };

// We cache provider instances so they're only created once (singleton pattern).
// The same provider is reused across all requests.
//
// Note: we have TWO LLM singletons — one for tagging, one for chat.
// Both use Claude, on different models: TAGGING_MODEL (Haiku) for tagging,
// CHAT_MODEL (Sonnet) for chat.
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
// Returns the provider used for AUTO-TAGGING. Same Claude provider class as
// chat, but on its own model: TAGGING_MODEL, default Haiku 5.5. Tagging runs
// on every save and is simple classification, so it doesn't need Sonnet.
// The model name and its default come from ./models.ts.

export async function getLLMProvider(): Promise<LLMProvider> {
  if (!llmProvider) {
    const { ClaudeLLMProvider } = await import("./claude-llm");
    llmProvider = new ClaudeLLMProvider(modelFor("TAGGING_MODEL"));
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

// ============================================================================
// MODEL ASSIGNMENTS (admin System tab)
// ============================================================================
// Which model runs which feature, resolved the same way the code above and
// the feature modules resolve it (./models.ts). `feature` matches the
// ai_usage.feature enum where a feature logs usage, so the tab can show the
// last-used model next to the configured one.

export type ModelAssignment = {
  feature:
    | "chat"
    | "reflection"
    | "profile"
    | "tagging"
    | "recommendation"
    | "image_analysis"
    | "embedding";
  label: string;
  setting: string; // env var name
  model: string; // effective value
  source: "env" | "default";
  provider: "claude" | "ollama" | "voyage";
  note?: string;
};

export function getModelAssignments(): ModelAssignment[] {
  const onOllama = ACTIVE_PROVIDERS.llm === "ollama";

  // Features served by the swappable LLM provider (chat + tagging factories).
  const llmRow = (
    feature: ModelAssignment["feature"],
    label: string,
    cloudSetting: ModelSetting
  ): ModelAssignment => {
    const setting: ModelSetting | OllamaModelSetting = onOllama
      ? "LLM_MODEL"
      : cloudSetting;
    return {
      feature,
      label,
      setting,
      model: onOllama ? ollamaModelFor("LLM_MODEL") : modelFor(cloudSetting),
      source: settingSource(setting),
      provider: ACTIVE_PROVIDERS.llm,
    };
  };

  // Features that call the Anthropic SDK directly — always Claude.
  const claudeRow = (
    feature: ModelAssignment["feature"],
    label: string,
    setting: ModelSetting,
    note?: string
  ): ModelAssignment => ({
    feature,
    label,
    setting,
    model: modelFor(setting),
    source: settingSource(setting),
    provider: "claude",
    ...(note ? { note } : {}),
  });

  const embeddingOnOllama = ACTIVE_PROVIDERS.embedding === "ollama";

  return [
    llmRow("chat", "Chat (RAG)", "CHAT_MODEL"),
    llmRow("reflection", "Weekly reflections", "CHAT_MODEL"),
    llmRow("profile", "AI profile", "CHAT_MODEL"),
    llmRow("tagging", "Auto-tagging", "TAGGING_MODEL"),
    claudeRow(
      "recommendation",
      "Recommendations",
      "RECOMMENDATIONS_MODEL",
      `web search: ${modelFor("WEB_SEARCH_TOOL_VERSION")}`
    ),
    claudeRow("image_analysis", "Image analysis", "IMAGE_ANALYSIS_MODEL"),
    {
      feature: "embedding",
      label: "Embeddings",
      setting: "EMBED_MODEL",
      model: embeddingOnOllama
        ? ollamaModelFor("EMBED_MODEL")
        : modelFor("EMBED_MODEL"),
      source: settingSource("EMBED_MODEL"),
      provider: ACTIVE_PROVIDERS.embedding,
    },
  ];
}

// Re-export types so consumers can import everything from "@/lib/ai"
export type { EmbeddingProvider, LLMProvider, ChatMessage } from "./types";
export { modelFor } from "./model-settings";
