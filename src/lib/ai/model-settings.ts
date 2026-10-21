// ============================================================================
// MODEL SETTINGS — resolved values
// ============================================================================
//
// The effective model for each setting: its env var when set and non-empty,
// otherwise the default from ./models.ts. The env vars themselves are read in
// src/lib/config.ts (the only place env vars are read) at startup; this module
// just looks them up, so every feature and the admin System tab agree.
//
// Importing this loads config.ts, whose required-env checks run at import.
// Unit tests get placeholder values from src/test/setup.ts.
// ============================================================================

import { config } from "@/lib/config";
import type { ModelSetting, OllamaModelSetting } from "./models";

/** Effective value of a cloud (Claude/Voyage) model setting. */
export function modelFor(setting: ModelSetting): string {
  return config.ai.models[setting];
}

/** Effective value of an Ollama model setting (only used when swapped to Ollama). */
export function ollamaModelFor(setting: OllamaModelSetting): string {
  return config.ai.ollamaModels[setting];
}

/** Whether a setting's value came from the environment or the code default. */
export function settingSource(
  setting: ModelSetting | OllamaModelSetting
): "env" | "default" {
  return config.ai.fromEnv[setting] ? "env" : "default";
}
