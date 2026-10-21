// ============================================================================
// UNIT TESTS — AI provider factory model selection
// ============================================================================
//
// getLLMProvider() (auto-tagging) and getChatProvider() (chat, reflections,
// profile) build the same ClaudeLLMProvider class on DIFFERENT models:
// TAGGING_MODEL (default Haiku 5.5) vs CHAT_MODEL. These tests pin which model
// each factory passes, so the two can't silently collapse onto one again.
//
// The provider class is mocked — no SDK, no API key, no network. The factory
// caches singletons at module level, so each test re-imports it fresh.
// ============================================================================

const { ClaudeLLMProvider } = vi.hoisted(() => ({
  ClaudeLLMProvider: vi.fn(),
}));

vi.mock("@/lib/ai/claude-llm", () => ({ ClaudeLLMProvider }));

describe("AI provider factory", () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    delete process.env.TAGGING_MODEL;
    vi.resetModules();
    ClaudeLLMProvider.mockClear();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("tagging defaults to Haiku 5.5", async () => {
    const { getLLMProvider } = await import("@/lib/ai");
    await getLLMProvider();
    expect(ClaudeLLMProvider).toHaveBeenCalledWith("claude-haiku-5-5");
  });

  it("tagging honors TAGGING_MODEL", async () => {
    process.env.TAGGING_MODEL = "claude-sonnet-5-5";
    const { getLLMProvider } = await import("@/lib/ai");
    await getLLMProvider();
    expect(ClaudeLLMProvider).toHaveBeenCalledWith("claude-sonnet-5-5");
  });

  it("model assignments match what the factories and features resolve", async () => {
    process.env.TAGGING_MODEL = "claude-sonnet-5-5";
    delete process.env.CHAT_MODEL;
    const { getModelAssignments } = await import("@/lib/ai");
    const byFeature = Object.fromEntries(
      getModelAssignments().map((m) => [m.feature, m])
    );

    expect(byFeature.tagging).toMatchObject({
      model: "claude-sonnet-5-5",
      setting: "TAGGING_MODEL",
      source: "env",
      provider: "claude",
    });
    expect(byFeature.chat).toMatchObject({
      model: "claude-sonnet-5-5",
      setting: "CHAT_MODEL",
      source: "default",
    });
    expect(byFeature.recommendation.note).toMatch(/web_search_/);
    expect(byFeature.embedding).toMatchObject({ provider: "voyage", setting: "EMBED_MODEL" });
    expect(Object.keys(byFeature).sort()).toEqual(
      ["chat", "embedding", "image_analysis", "profile", "recommendation", "reflection", "tagging"]
    );
  });

  it("chat passes no model, so the provider falls back to CHAT_MODEL", async () => {
    const { getChatProvider } = await import("@/lib/ai");
    await getChatProvider();
    expect(ClaudeLLMProvider).toHaveBeenCalledWith();
  });
});
