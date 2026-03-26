// ============================================================================
// UNIT TESTS — generateWeeklyReflection
// ============================================================================
//
// These tests focus on orchestration:
//   - idempotency (existing row wins)
//   - skip behavior (no records this week)
//   - combined save shape (reflection + recommendations)
//
// We mock the DB and AI helpers so the tests stay fast and deterministic.
// ============================================================================

import { beforeEach, vi } from "vitest";

const mockFindExistingReflection = vi.hoisted(() => vi.fn());
const mockFindPreviousReflections = vi.hoisted(() => vi.fn());
const mockFindWeeklyRecords = vi.hoisted(() => vi.fn());
const mockInsertValues = vi.hoisted(() => vi.fn());
const mockReturning = vi.hoisted(() => vi.fn());
const mockChat = vi.hoisted(() => vi.fn());
const mockGetChatProvider = vi.hoisted(() => vi.fn());
const mockGetProfile = vi.hoisted(() => vi.fn());
const mockGenerateRecommendations = vi.hoisted(() => vi.fn());

vi.mock("@/db", () => ({
  db: {
    query: {
      reflections: {
        findFirst: mockFindExistingReflection,
        findMany: mockFindPreviousReflections,
      },
      records: {
        findMany: mockFindWeeklyRecords,
      },
    },
    insert: vi.fn(() => ({
      values: mockInsertValues,
    })),
  },
}));

vi.mock("@/lib/ai", () => ({
  getChatProvider: mockGetChatProvider,
}));

vi.mock("@/lib/ai/profile", () => ({
  getProfile: mockGetProfile,
}));

vi.mock("@/lib/ai/generate-recommendations", () => ({
  generateRecommendations: mockGenerateRecommendations,
}));

import { generateWeeklyReflection } from "@/lib/ai/reflection";

describe("generateWeeklyReflection", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockGetChatProvider.mockResolvedValue({
      chat: mockChat,
    });

    mockChat.mockResolvedValue(
      "A reflective week where **attention** and systems thinking kept crossing paths."
    );

    mockGetProfile.mockResolvedValue({
      summary: "A thoughtful builder drawn to systems and aesthetics.",
      topInterests: ["systems design", "writing"],
      contentBreakdown: { note: 3, article: 2 },
      patterns: ["Often connects creative and technical work"],
      generatedAt: "2026-03-25T00:00:00.000Z",
      recordCount: 5,
    });

    // No previous reflections by default — the cross-week dedup query returns
    // empty so recommendations start fresh.
    mockFindPreviousReflections.mockResolvedValue([]);

    mockGenerateRecommendations.mockResolvedValue([
      {
        type: "book",
        title: "Ways of Seeing",
        creator: "John Berger",
        reason: "It extends the reflection's interest in attention and interpretation.",
      },
    ]);

    mockInsertValues.mockReturnValue({
      returning: mockReturning,
    });

    mockReturning.mockResolvedValue([{ id: "reflection-new" }]);
  });

  it("returns the existing reflection row when one already exists for the week", async () => {
    mockFindExistingReflection.mockResolvedValue({
      id: "reflection-existing",
      content: "Already generated",
      recommendations: null,
    });

    const result = await generateWeeklyReflection("user-123");

    expect(result).toEqual({
      id: "reflection-existing",
      content: "Already generated",
      recommendations: [],
    });
    expect(mockFindWeeklyRecords).not.toHaveBeenCalled();
    expect(mockChat).not.toHaveBeenCalled();
  });

  it("returns null when no records were saved this week", async () => {
    mockFindExistingReflection.mockResolvedValue(null);
    mockFindWeeklyRecords.mockResolvedValue([]);

    const result = await generateWeeklyReflection("user-123");

    expect(result).toBeNull();
    expect(mockChat).not.toHaveBeenCalled();
    expect(mockInsertValues).not.toHaveBeenCalled();
  });

  it("saves both the reflection content and recommendations on a new row", async () => {
    mockFindExistingReflection.mockResolvedValue(null);
    mockFindWeeklyRecords.mockResolvedValue([
      {
        type: "article",
        title: "Slow Productivity",
        content: "Notes on attention and deliberate pace.",
        sourceAuthor: "Cal Newport",
        createdAt: new Date("2026-03-24T12:00:00Z"),
        recordTags: [{ tag: { name: "attention" } }, { tag: { name: "work" } }],
      },
    ]);

    const result = await generateWeeklyReflection("user-123");

    expect(mockGenerateRecommendations).toHaveBeenCalledWith(
      expect.objectContaining({
        reflectionContent: expect.stringContaining("attention"),
        recordSummaries: [{ title: "Slow Productivity", tags: ["attention", "work"] }],
        previousRecommendationTitles: [],
      })
    );

    expect(mockInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-123",
        content: expect.stringContaining("attention"),
        recommendations: [
          {
            type: "book",
            title: "Ways of Seeing",
            creator: "John Berger",
            reason: "It extends the reflection's interest in attention and interpretation.",
          },
        ],
      })
    );

    expect(result).toEqual({
      id: "reflection-new",
      content:
        "A reflective week where **attention** and systems thinking kept crossing paths.",
      recommendations: [
        {
          type: "book",
          title: "Ways of Seeing",
          creator: "John Berger",
          reason: "It extends the reflection's interest in attention and interpretation.",
        },
      ],
    });
  });

  it("still saves the reflection when recommendations come back empty", async () => {
    mockFindExistingReflection.mockResolvedValue(null);
    mockFindWeeklyRecords.mockResolvedValue([
      {
        type: "note",
        title: "On slowness",
        content: "A short note about patience.",
        sourceAuthor: null,
        createdAt: new Date("2026-03-24T12:00:00Z"),
        recordTags: [],
      },
    ]);
    mockGenerateRecommendations.mockResolvedValue([]);

    await generateWeeklyReflection("user-123");

    expect(mockInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        recommendations: [],
      })
    );
  });
});
