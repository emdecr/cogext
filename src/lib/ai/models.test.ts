// ============================================================================
// UNIT TESTS — model settings resolver
// ============================================================================
//
// models.ts is the single source of truth for model names and defaults. These
// pin the defaults (so a change is deliberate) and the env-vs-default rules.
// ============================================================================

import {
  MODEL_DEFAULTS,
  modelFor,
  ollamaModelFor,
  settingSource,
} from "@/lib/ai/models";

describe("model settings", () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    for (const key of [...Object.keys(MODEL_DEFAULTS), "LLM_MODEL"]) {
      delete process.env[key];
    }
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("defaults: Sonnet 5.5 for chat, Haiku 5.5 for the cheap features, Voyage 4 lite", () => {
    expect(modelFor("CHAT_MODEL")).toBe("claude-sonnet-5-5");
    expect(modelFor("TAGGING_MODEL")).toBe("claude-haiku-5-5");
    expect(modelFor("RECOMMENDATIONS_MODEL")).toBe("claude-haiku-5-5");
    expect(modelFor("IMAGE_ANALYSIS_MODEL")).toBe("claude-haiku-5-5");
    expect(modelFor("WEB_SEARCH_TOOL_VERSION")).toBe("web_search_20250305");
    expect(modelFor("EMBED_MODEL")).toBe("voyage-4-lite");
  });

  it("env var wins when set", () => {
    process.env.CHAT_MODEL = "claude-opus-5-5";
    expect(modelFor("CHAT_MODEL")).toBe("claude-opus-5-5");
    expect(settingSource("CHAT_MODEL")).toBe("env");
  });

  it("empty env var falls back to the default (same as the old `||` reads)", () => {
    process.env.TAGGING_MODEL = "";
    expect(modelFor("TAGGING_MODEL")).toBe("claude-haiku-5-5");
    expect(settingSource("TAGGING_MODEL")).toBe("default");
  });

  it("Ollama settings have their own defaults", () => {
    expect(ollamaModelFor("LLM_MODEL")).toBe("llama3.2:1b");
    expect(ollamaModelFor("EMBED_MODEL")).toBe("nomic-embed-text");
  });
});
