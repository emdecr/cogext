// ============================================================================
// UNIT TESTS — providers report exactly one outcome per API request
// ============================================================================
//
// The contract callers rely on (src/lib/ai/outcome.ts): every request ends in
// one onOutcome call — ok, refusal, or error — carrying the provider's name,
// model, and usage. "Billed but unusable" replies are errors that KEEP their
// usage (invalid_response). A throwing callback must never break the call.
//
// The Anthropic SDK and global fetch are mocked; no network.
// ============================================================================

const { mockCreate, mockStream } = vi.hoisted(() => ({
  mockCreate: vi.fn(),
  mockStream: vi.fn(),
}));

vi.mock("@anthropic-ai/sdk", () => ({
  default: vi.fn(function MockAnthropic(this: { messages: unknown }) {
    this.messages = { create: mockCreate, stream: mockStream };
  }),
}));

import { ClaudeLLMProvider } from "@/lib/ai/claude-llm";
import { VoyageEmbeddingProvider } from "@/lib/ai/voyage-embedding";
import { AiAbortedError, AiHttpError, AiInvalidResponseError, classifyAiError } from "@/lib/ai/errors";
import type { AiCallOutcome } from "@/lib/ai/outcome";

const reply = (text: string, stop_reason = "end_turn") => ({
  content: [{ type: "text", text }],
  stop_reason,
  stop_details: null,
  usage: { input_tokens: 120, output_tokens: 30 },
});

function collect() {
  const outcomes: AiCallOutcome[] = [];
  return { outcomes, cb: (o: AiCallOutcome) => void outcomes.push(o) };
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Claude — generateTags (never throws; failures return [])
// ---------------------------------------------------------------------------

describe("ClaudeLLMProvider.generateTags", () => {
  const llm = () => new ClaudeLLMProvider("claude-haiku-5-5");

  it("ok: returns tags and reports usage with provider + model", async () => {
    mockCreate.mockResolvedValue(reply('{"tags": ["Recipes", " pasta "]}'));
    const { outcomes, cb } = collect();
    await expect(llm().generateTags("x", "note", cb)).resolves.toEqual(["recipes", "pasta"]);
    expect(outcomes).toEqual([
      {
        status: "ok",
        provider: "claude",
        model: "claude-haiku-5-5",
        usage: { inputTokens: 120, outputTokens: 30 },
      },
    ]);
  });

  it("refusal: returns [] and reports a billed refusal", async () => {
    mockCreate.mockResolvedValue(reply("", "refusal"));
    const { outcomes, cb } = collect();
    await expect(llm().generateTags("x", "note", cb)).resolves.toEqual([]);
    expect(outcomes).toMatchObject([{ status: "refusal", usage: { inputTokens: 120 } }]);
  });

  it("unparseable reply: error that keeps usage (invalid_response)", async () => {
    mockCreate.mockResolvedValue(reply("not json at all"));
    const { outcomes, cb } = collect();
    await expect(llm().generateTags("x", "note", cb)).resolves.toEqual([]);
    expect(outcomes).toHaveLength(1);
    expect(outcomes[0]).toMatchObject({ status: "error", usage: { inputTokens: 120 } });
    expect((outcomes[0] as { error: unknown }).error).toBeInstanceOf(SyntaxError);
  });

  it("reply without a tags array: AiInvalidResponseError with usage", async () => {
    mockCreate.mockResolvedValue(reply('{"labels": []}'));
    const { outcomes, cb } = collect();
    await llm().generateTags("x", "note", cb);
    expect((outcomes[0] as { error: unknown }).error).toBeInstanceOf(AiInvalidResponseError);
    expect(outcomes[0]).toHaveProperty("usage");
  });

  it("API failure: returns [] and reports an error without usage", async () => {
    mockCreate.mockRejectedValue(new Error("boom"));
    const { outcomes, cb } = collect();
    await expect(llm().generateTags("x", "note", cb)).resolves.toEqual([]);
    expect(outcomes).toHaveLength(1);
    expect(outcomes[0]).toMatchObject({ status: "error" });
    expect(outcomes[0]).not.toHaveProperty("usage");
  });

  it("a throwing callback doesn't break tagging", async () => {
    mockCreate.mockResolvedValue(reply('{"tags": ["a"]}'));
    const cb = () => {
      throw new Error("logger bug");
    };
    await expect(llm().generateTags("x", "note", cb)).resolves.toEqual(["a"]);
  });
});

// ---------------------------------------------------------------------------
// Claude — chat (throws on failure, after reporting)
// ---------------------------------------------------------------------------

describe("ClaudeLLMProvider.chat", () => {
  const llm = () => new ClaudeLLMProvider("claude-sonnet-5-5");

  it("ok and refusal are reported with usage", async () => {
    mockCreate.mockResolvedValueOnce(reply("hello"));
    mockCreate.mockResolvedValueOnce(reply("", "refusal"));
    const { outcomes, cb } = collect();
    await llm().chat([{ role: "user", content: "hi" }], undefined, cb);
    await llm().chat([{ role: "user", content: "hi" }], undefined, cb);
    expect(outcomes.map((o) => o.status)).toEqual(["ok", "refusal"]);
    expect(outcomes[0]).toMatchObject({ model: "claude-sonnet-5-5" });
  });

  it("failure is reported AND rethrown", async () => {
    mockCreate.mockRejectedValue(new Error("down"));
    const { outcomes, cb } = collect();
    await expect(llm().chat([{ role: "user", content: "hi" }], undefined, cb)).rejects.toThrow("down");
    expect(outcomes).toMatchObject([{ status: "error" }]);
  });
});

// ---------------------------------------------------------------------------
// Claude — chatStream
// ---------------------------------------------------------------------------

describe("ClaudeLLMProvider.chatStream", () => {
  const llm = () => new ClaudeLLMProvider("claude-sonnet-5-5");

  function fakeStream(
    events: unknown[],
    final: unknown,
    failAt?: number,
    finalRejects = false
  ) {
    return {
      async *[Symbol.asyncIterator]() {
        for (let i = 0; i < events.length; i++) {
          if (i === failAt) throw new Error("stream broke");
          yield events[i];
        }
      },
      finalMessage: finalRejects
        ? vi.fn().mockRejectedValue(new Error("no final message"))
        : vi.fn().mockResolvedValue(final),
      // The SDK's partial snapshot: tokens counted so far.
      currentMessage: { usage: { input_tokens: 120, output_tokens: 7 } },
    };
  }

  const delta = (text: string) => ({
    type: "content_block_delta",
    delta: { type: "text_delta", text },
  });

  it("reports ok with usage once the stream finishes", async () => {
    mockStream.mockReturnValue(
      fakeStream([delta("Hel"), delta("lo")], reply("Hello"))
    );
    const { outcomes, cb } = collect();
    let text = "";
    for await (const chunk of llm().chatStream([{ role: "user", content: "hi" }], undefined, cb)) {
      text += chunk;
    }
    expect(text).toBe("Hello");
    expect(outcomes).toMatchObject([{ status: "ok", usage: { outputTokens: 30 } }]);
  });

  it("reports an error and rethrows when the stream breaks", async () => {
    mockStream.mockReturnValue(fakeStream([delta("Hel"), delta("lo")], reply(""), 1));
    const { outcomes, cb } = collect();
    const consume = async () => {
      for await (const chunk of llm().chatStream([{ role: "user", content: "hi" }], undefined, cb)) {
        void chunk;
      }
    };
    await expect(consume()).rejects.toThrow("stream broke");
    // Exactly one outcome, carrying the partial (billed) usage.
    expect(outcomes).toMatchObject([{ status: "error", usage: { outputTokens: 7 } }]);
  });

  it("consumer stops early (client disconnect): one 'aborted' outcome with partial usage", async () => {
    mockStream.mockReturnValue(
      fakeStream([delta("a"), delta("b"), delta("c")], reply("abc"))
    );
    const { outcomes, cb } = collect();
    for await (const chunk of llm().chatStream([{ role: "user", content: "hi" }], undefined, cb)) {
      void chunk;
      break; // like the route's enqueue throwing after the browser left
    }
    expect(outcomes).toHaveLength(1);
    const outcome = outcomes[0] as { status: string; error: unknown; usage: unknown };
    expect(outcome.status).toBe("error");
    expect(outcome.error).toBeInstanceOf(AiAbortedError);
    expect(classifyAiError(outcome.error).kind).toBe("aborted");
    expect(outcome.usage).toEqual({ inputTokens: 120, outputTokens: 7 });
  });

  it("finalMessage failure after a delivered reply: reported, not thrown", async () => {
    mockStream.mockReturnValue(fakeStream([delta("ok")], null, undefined, true));
    const { outcomes, cb } = collect();
    let text = "";
    for await (const chunk of llm().chatStream([{ role: "user", content: "hi" }], undefined, cb)) {
      text += chunk;
    }
    expect(text).toBe("ok");
    expect(outcomes).toMatchObject([{ status: "error", usage: { outputTokens: 7 } }]);
  });
});

// ---------------------------------------------------------------------------
// Voyage — embedBatch / embed (throws on failure, after reporting)
// ---------------------------------------------------------------------------

describe("VoyageEmbeddingProvider", () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body, text: async () => "" });

  it("ok: reports Voyage's total_tokens as input usage", async () => {
    fetchMock.mockResolvedValue(
      ok({ data: [{ index: 0, embedding: [0.1, 0.2] }], usage: { total_tokens: 42 } })
    );
    const { outcomes, cb } = collect();
    await expect(new VoyageEmbeddingProvider().embed("hello", cb)).resolves.toEqual([0.1, 0.2]);
    expect(outcomes).toEqual([
      {
        status: "ok",
        provider: "voyage",
        model: "voyage-4-lite",
        usage: { inputTokens: 42, outputTokens: 0 },
      },
    ]);
  });

  it("HTTP failure: reports an AiHttpError and rethrows it", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 429, text: async () => "slow down" });
    const { outcomes, cb } = collect();
    await expect(new VoyageEmbeddingProvider().embedBatch(["a"], cb)).rejects.toBeInstanceOf(AiHttpError);
    expect(outcomes).toHaveLength(1);
    expect((outcomes[0] as { error: AiHttpError }).error.status).toBe(429);
  });

  it("empty data: reports AiInvalidResponseError", async () => {
    fetchMock.mockResolvedValue(ok({ data: [] }));
    const { outcomes, cb } = collect();
    await expect(new VoyageEmbeddingProvider().embed("a", cb)).rejects.toBeInstanceOf(
      AiInvalidResponseError
    );
    expect(outcomes).toMatchObject([{ status: "error" }]);
  });
});
