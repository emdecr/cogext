// ============================================================================
// UNIT TESTS — model settings (defaults + env resolution)
// ============================================================================
//
// Model env vars are read in src/lib/config.ts at import time and exposed via
// model-settings.ts. Each test sets the env, then re-imports a fresh copy of
// the module graph (vi.resetModules) so config.ts re-reads it. Required env
// vars come from src/test/setup.ts.
// ============================================================================

import { MODEL_DEFAULTS } from "@/lib/ai/models";

const MODEL_VARS = [...Object.keys(MODEL_DEFAULTS), "LLM_MODEL"];

async function loadSettings() {
  vi.resetModules();
  return import("@/lib/ai/model-settings");
}

describe("model settings", () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    for (const name of MODEL_VARS) delete process.env[name];
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("defaults: Sonnet 5.5 for chat, Haiku 5.5 for the cheap features, Voyage 4 lite", async () => {
    const { modelFor, settingSource } = await loadSettings();
    expect(modelFor("CHAT_MODEL")).toBe("claude-sonnet-5-5");
    expect(modelFor("TAGGING_MODEL")).toBe("claude-haiku-5-5");
    expect(modelFor("RECOMMENDATIONS_MODEL")).toBe("claude-haiku-5-5");
    expect(modelFor("IMAGE_ANALYSIS_MODEL")).toBe("claude-haiku-5-5");
    expect(modelFor("WEB_SEARCH_TOOL_VERSION")).toBe("web_search_20250305");
    expect(modelFor("EMBED_MODEL")).toBe("voyage-4-lite");
    expect(settingSource("CHAT_MODEL")).toBe("default");
  });

  it("env var wins when set", async () => {
    process.env.CHAT_MODEL = "claude-opus-5-5";
    const { modelFor, settingSource } = await loadSettings();
    expect(modelFor("CHAT_MODEL")).toBe("claude-opus-5-5");
    expect(settingSource("CHAT_MODEL")).toBe("env");
  });

  it("empty env var falls back to the default", async () => {
    process.env.TAGGING_MODEL = "";
    const { modelFor, settingSource } = await loadSettings();
    expect(modelFor("TAGGING_MODEL")).toBe("claude-haiku-5-5");
    expect(settingSource("TAGGING_MODEL")).toBe("default");
  });

  it("Ollama settings have their own defaults; EMBED_MODEL applies to both", async () => {
    let s = await loadSettings();
    expect(s.ollamaModelFor("LLM_MODEL")).toBe("llama3.2:1b");
    expect(s.ollamaModelFor("EMBED_MODEL")).toBe("nomic-embed-text");

    process.env.EMBED_MODEL = "custom-embed";
    s = await loadSettings();
    expect(s.modelFor("EMBED_MODEL")).toBe("custom-embed");
    expect(s.ollamaModelFor("EMBED_MODEL")).toBe("custom-embed");
  });

  it("config.ts aliases share the resolved values", async () => {
    process.env.CHAT_MODEL = "claude-opus-5-5";
    process.env.EMBED_MODEL = "voyage-4";
    vi.resetModules();
    const { config } = await import("@/lib/config");
    expect(config.chat.model).toBe("claude-opus-5-5");
    expect(config.voyage.embedModel).toBe("voyage-4");
    expect(config.ai.models.CHAT_MODEL).toBe("claude-opus-5-5");
  });
});
