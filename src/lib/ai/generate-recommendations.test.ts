// ============================================================================
// UNIT TESTS — generateRecommendations / parsing
// ============================================================================
//
// The riskiest parts of this feature are not "can Claude write something
// interesting?" but rather:
//   1. Can we parse the structured JSON reliably?
//   2. Do we degrade gracefully when Anthropic fails?
//
// Those are exactly the kinds of behaviors unit tests are good at protecting.
// ============================================================================

import { beforeEach, afterEach, vi } from "vitest";
import { mockAnthropicTextResponse } from "@/test/mocks/ai";

// ---- Mock Anthropic SDK ----
//
// We mock the constructor the same way analyze-image.test.ts does:
// a constructable function that installs a spyable messages.create method.
const mockCreate = vi.hoisted(() => vi.fn());

vi.mock("@anthropic-ai/sdk", () => ({
  default: vi.fn(function MockAnthropic(this: { messages: { create: typeof mockCreate } }) {
    this.messages = { create: mockCreate };
  }),
}));

import {
  generateRecommendations,
  normalizeRecommendation,
  parseRecommendationsResponse,
} from "@/lib/ai/generate-recommendations";

describe("generate-recommendations", () => {
  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-test-key";
    mockCreate.mockResolvedValue(
      mockAnthropicTextResponse(
        JSON.stringify([
          {
            type: "book",
            title: "The Argonauts",
            creator: "Maggie Nelson",
            year: "2015",
            reason: "It extends the reflection's interest in identity and form.",
          },
        ])
      )
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
    delete process.env.ANTHROPIC_API_KEY;
  });

  describe("parseRecommendationsResponse", () => {
    it("parses valid raw JSON", () => {
      const result = parseRecommendationsResponse(
        JSON.stringify([
          {
            type: "podcast",
            title: "Between the Covers",
            creator: "David Naimon",
            reason: "It matches the week's literary and reflective energy.",
          },
        ])
      );

      expect(result).toEqual([
        {
          type: "podcast",
          title: "Between the Covers",
          creator: "David Naimon",
          reason: "It matches the week's literary and reflective energy.",
        },
      ]);
    });

    it("parses JSON wrapped in markdown fences", () => {
      const result = parseRecommendationsResponse(
        '```json\n[\n  {\n    "type": "essay",\n    "title": "The White Album",\n    "creator": "Joan Didion",\n    "reason": "It echoes the reflection\'s theme of finding pattern in fragmentation."\n  }\n]\n```'
      );

      expect(result[0]).toMatchObject({
        type: "essay",
        title: "The White Album",
      });
    });

    it("filters out invalid recommendation types", () => {
      const result = parseRecommendationsResponse(
        JSON.stringify([
          {
            type: "album",
            title: "Music for Airports",
            creator: "Brian Eno",
            reason: "It fits the mood.",
          },
        ])
      );

      expect(result).toEqual([]);
    });

    it("filters out items missing required fields", () => {
      const result = parseRecommendationsResponse(
        JSON.stringify([
          {
            type: "book",
            title: "Bluets",
            creator: "",
            reason: "A lyrical extension of the week's voice.",
          },
        ])
      );

      expect(result).toEqual([]);
    });

    it("keeps valid items when the array contains a mix of valid and invalid entries", () => {
      const result = parseRecommendationsResponse(
        JSON.stringify([
          {
            type: "book",
            title: "Bluets",
            creator: "Maggie Nelson",
            reason: "It continues the reflection's search for associative thinking.",
          },
          {
            type: "unknown",
            title: "Bad Entry",
            creator: "Nobody",
            reason: "Should be dropped.",
          },
        ])
      );

      expect(result).toHaveLength(1);
      expect(result[0].title).toBe("Bluets");
    });
  });

  describe("normalizeRecommendation", () => {
    it("keeps the optional year when present", () => {
      expect(
        normalizeRecommendation({
          type: "film",
          title: "After Yang",
          creator: "Kogonada",
          year: "2021",
          reason: "It matches the reflection's quiet philosophical mood.",
        })
      ).toEqual({
        type: "film",
        title: "After Yang",
        creator: "Kogonada",
        year: "2021",
        reason: "It matches the reflection's quiet philosophical mood.",
      });
    });

    it("keeps a valid https:// url when present", () => {
      const result = normalizeRecommendation({
        type: "essay",
        title: "The Sorrow and the Pity",
        creator: "Susan Sontag",
        url: "https://example.com/essay",
        reason: "It extends the reflection's interest in documentary form.",
      });

      expect(result?.url).toBe("https://example.com/essay");
    });

    it("drops a url that does not start with https://", () => {
      const result = normalizeRecommendation({
        type: "essay",
        title: "The Sorrow and the Pity",
        creator: "Susan Sontag",
        url: "javascript:alert(1)",
        reason: "It extends the reflection's interest in documentary form.",
      });

      expect(result?.url).toBeUndefined();
    });
  });

  describe("generateRecommendations", () => {
    it("returns parsed recommendations on success", async () => {
      const result = await generateRecommendations({
        reflectionContent: "A week centered on slowness, memory, and deliberate attention.",
        userProfile: null,
        recordSummaries: [{ title: "Slow Looking", tags: ["art", "attention"] }],
        previousRecommendationTitles: [],
      });

      expect(result).toHaveLength(1);
      expect(mockCreate).toHaveBeenCalled();
    });

    it("returns an empty array when the API key is missing", async () => {
      delete process.env.ANTHROPIC_API_KEY;

      const result = await generateRecommendations({
        reflectionContent: "A reflection",
        userProfile: null,
        recordSummaries: [],
        previousRecommendationTitles: [],
      });

      expect(mockCreate).not.toHaveBeenCalled();
      expect(result).toEqual([]);
    });

    it("returns an empty array when Anthropic throws", async () => {
      mockCreate.mockRejectedValue(new Error("rate limited"));

      const result = await generateRecommendations({
        reflectionContent: "A reflection",
        userProfile: null,
        recordSummaries: [],
        previousRecommendationTitles: [],
      });

      expect(result).toEqual([]);
    });

    it("returns an empty array when Claude responds with non-JSON text", async () => {
      mockCreate.mockResolvedValue(
        mockAnthropicTextResponse("Here are some ideas in prose rather than JSON.")
      );

      const result = await generateRecommendations({
        reflectionContent: "A reflection",
        userProfile: null,
        recordSummaries: [],
        previousRecommendationTitles: [],
      });

      expect(result).toEqual([]);
    });
  });
});
