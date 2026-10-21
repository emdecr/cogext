// ============================================================================
// MODEL DEFAULTS — single source of truth for model names
// ============================================================================
//
// Every AI model setting the app has, and its default. Pure constants, no
// imports and no env reads: src/lib/config.ts imports these to resolve the
// env vars (config.ts is the only place env vars are read), and
// ./model-settings.ts exposes the resolved values to the rest of the app.
//
// Before this module, each feature read process.env with its own copy of the
// default, so a default changed in one spot could silently disagree with
// another. The admin System tab renders from the same resolved values, so it
// can't show a model that isn't the one running.
// ============================================================================

// Cloud defaults (Claude + Voyage), the providers wired in ./index.ts today.
export const MODEL_DEFAULTS = {
  CHAT_MODEL: "claude-sonnet-5-5",
  TAGGING_MODEL: "claude-haiku-5-5",
  RECOMMENDATIONS_MODEL: "claude-haiku-5-5",
  IMAGE_ANALYSIS_MODEL: "claude-haiku-5-5",
  WEB_SEARCH_TOOL_VERSION: "web_search_20250305",
  EMBED_MODEL: "voyage-4-lite",
} as const;

// Local defaults, used only when ./index.ts is switched to the Ollama providers
// (see the swap-ai-provider skill). EMBED_MODEL is the same env var as above
// with a different default.
export const OLLAMA_MODEL_DEFAULTS = {
  LLM_MODEL: "llama3.2:1b",
  EMBED_MODEL: "nomic-embed-text",
} as const;

export type ModelSetting = keyof typeof MODEL_DEFAULTS;
export type OllamaModelSetting = keyof typeof OLLAMA_MODEL_DEFAULTS;
