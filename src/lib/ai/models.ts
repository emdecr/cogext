// ============================================================================
// MODEL SETTINGS — single source of truth
// ============================================================================
//
// Every AI model name the app uses, with its env var and default, resolved in
// ONE place. Before this, each module read process.env itself with its own
// copy of the default (and chat/reflection/profile re-read CHAT_MODEL just to
// label ai_usage rows), so a default changed in one spot could silently
// disagree with another. The admin System tab renders from here too, so it
// can't show a model that isn't the one running.
//
// Pure (no imports): safe to import from anywhere, including modules whose
// tests mock "@/lib/ai". Reads process.env directly rather than via
// src/lib/config.ts because config's required-env checks run at import —
// config.ts derives its model fields from here instead.
// ============================================================================

// Cloud defaults (Claude + Voyage) — the providers wired in ./index.ts today.
export const MODEL_DEFAULTS = {
  CHAT_MODEL: "claude-sonnet-5-5",
  TAGGING_MODEL: "claude-haiku-5-5",
  RECOMMENDATIONS_MODEL: "claude-haiku-5-5",
  IMAGE_ANALYSIS_MODEL: "claude-haiku-5-5",
  WEB_SEARCH_TOOL_VERSION: "web_search_20250305",
  EMBED_MODEL: "voyage-4-lite",
} as const;

// Local defaults, used only when ./index.ts is switched to the Ollama providers
// (see the swap-ai-provider skill). Same env var names, different defaults.
export const OLLAMA_MODEL_DEFAULTS = {
  LLM_MODEL: "llama3.2:1b",
  EMBED_MODEL: "nomic-embed-text",
} as const;

export type ModelSetting = keyof typeof MODEL_DEFAULTS;
export type OllamaModelSetting = keyof typeof OLLAMA_MODEL_DEFAULTS;

/**
 * The effective value of a cloud model setting: its env var when set and
 * non-empty, otherwise the default. (Empty string → default, matching the
 * `process.env.X || "default"` reads this replaced.)
 */
export function modelFor(setting: ModelSetting): string {
  return process.env[setting] || MODEL_DEFAULTS[setting];
}

/** Same as modelFor(), for the Ollama providers' settings. */
export function ollamaModelFor(setting: OllamaModelSetting): string {
  return process.env[setting] || OLLAMA_MODEL_DEFAULTS[setting];
}

/** Whether a setting's value comes from the environment or the code default. */
export function settingSource(setting: string): "env" | "default" {
  return process.env[setting] ? "env" : "default";
}
