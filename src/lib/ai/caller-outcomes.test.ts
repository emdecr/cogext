// ============================================================================
// UNIT TESTS — direct-SDK features log one outcome per call
// ============================================================================
//
// Image analysis and recommendations call the Anthropic SDK directly (not
// through a provider), so they build their own outcome. Each call must log
// exactly one: ok, refusal, an invalid_response that keeps billed usage, or
// an error. No userId → nothing to attribute → nothing logged.
// ============================================================================

const { mockCreate, mockLogAiOutcome } = vi.hoisted(() => ({
  mockCreate: vi.fn(),
  mockLogAiOutcome: vi.fn(),
}));

vi.mock("@anthropic-ai/sdk", () => ({
  default: vi.fn(function MockAnthropic(this: { messages: unknown }) {
    this.messages = { create: mockCreate };
  }),
}));
vi.mock("@/lib/ai/usage", () => ({ logAiOutcome: mockLogAiOutcome }));
vi.mock("fs/promises", () => ({
  readFile: vi.fn().mockResolvedValue(Buffer.from("fake-image-bytes")),
}));

import { analyzeImage } from "@/lib/ai/analyze-image";
import { generateRecommendations } from "@/lib/ai/generate-recommendations";
import { AiInvalidResponseError } from "@/lib/ai/errors";

const reply = (text: string, stop_reason = "end_turn") => ({
  content: text ? [{ type: "text", text }] : [],
  stop_reason,
  stop_details: null,
  usage: { input_tokens: 500, output_tokens: 80 },
});

const statuses = () =>
  mockLogAiOutcome.mock.calls.map(([ctx, o]) => [ctx.feature, o.status]);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("analyzeImage", () => {
  it("ok: one ok row attributed to the user", async () => {
    mockCreate.mockResolvedValue(reply("A red bicycle against a brick wall."));
    await expect(analyzeImage("/uploads/a.jpg", "user-1")).resolves.toMatch(/bicycle/);
    expect(statuses()).toEqual([["image_analysis", "ok"]]);
    expect(mockLogAiOutcome.mock.calls[0][0]).toEqual({ userId: "user-1", feature: "image_analysis" });
  });

  it("refusal and empty replies are logged (empty = invalid_response with usage)", async () => {
    mockCreate.mockResolvedValueOnce(reply("", "refusal"));
    mockCreate.mockResolvedValueOnce(reply(""));
    await analyzeImage("/uploads/a.jpg", "user-1");
    await analyzeImage("/uploads/a.jpg", "user-1");
    expect(statuses()).toEqual([
      ["image_analysis", "refusal"],
      ["image_analysis", "error"],
    ]);
    const invalid = mockLogAiOutcome.mock.calls[1][1];
    expect(invalid.error).toBeInstanceOf(AiInvalidResponseError);
    expect(invalid.usage).toEqual({ inputTokens: 500, outputTokens: 80 });
  });

  it("API failure: one error row, returns null", async () => {
    mockCreate.mockRejectedValue(new Error("down"));
    await expect(analyzeImage("/uploads/a.jpg", "user-1")).resolves.toBeNull();
    expect(statuses()).toEqual([["image_analysis", "error"]]);
  });

  it("no userId: nothing logged", async () => {
    mockCreate.mockResolvedValue(reply("A cat."));
    await analyzeImage("/uploads/a.jpg");
    expect(mockLogAiOutcome).not.toHaveBeenCalled();
  });
});

describe("generateRecommendations", () => {
  const input = {
    reflectionContent: "A week about attention.",
    userProfile: null,
    recordSummaries: [],
    previousRecommendationTitles: [],
    userId: "user-1",
  };
  const validJson = JSON.stringify([
    { type: "book", title: "Ways of Seeing", creator: "John Berger", reason: "Because." },
  ]);

  it("ok: returns recommendations and logs one ok row", async () => {
    mockCreate.mockResolvedValue(reply(validJson));
    const recs = await generateRecommendations(input);
    expect(recs).toHaveLength(1);
    expect(statuses()).toEqual([["recommendation", "ok"]]);
  });

  it("a non-JSON reply is invalid_response, keeping usage", async () => {
    mockCreate.mockResolvedValue(reply("Here are some ideas you might like!"));
    await expect(generateRecommendations(input)).resolves.toEqual([]);
    expect(statuses()).toEqual([["recommendation", "error"]]);
    const outcome = mockLogAiOutcome.mock.calls[0][1];
    expect(outcome.error).toBeInstanceOf(AiInvalidResponseError);
    expect(outcome.usage).toEqual({ inputTokens: 500, outputTokens: 80 });
  });

  it("an empty JSON array is a valid (ok) answer, not an error", async () => {
    mockCreate.mockResolvedValue(reply("[]"));
    await generateRecommendations(input);
    expect(statuses()).toEqual([["recommendation", "ok"]]);
  });

  it("refusal and API failure each log one row", async () => {
    mockCreate.mockResolvedValueOnce(reply("", "refusal"));
    mockCreate.mockRejectedValueOnce(new Error("rate limited"));
    await generateRecommendations(input);
    await generateRecommendations(input);
    expect(statuses()).toEqual([
      ["recommendation", "refusal"],
      ["recommendation", "error"],
    ]);
  });
});
