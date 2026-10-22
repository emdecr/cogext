// ============================================================================
// UNIT TESTS — generateReflection
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
const mockFindPeriodRecords = vi.hoisted(() => vi.fn());
const mockInsertValues = vi.hoisted(() => vi.fn());
const mockReturning = vi.hoisted(() => vi.fn());
const mockChat = vi.hoisted(() => vi.fn());
const mockGetChatProvider = vi.hoisted(() => vi.fn());
const mockGetProfile = vi.hoisted(() => vi.fn());
const mockGenerateRecommendations = vi.hoisted(() => vi.fn());
const mockLogAiOutcome = vi.hoisted(() => vi.fn());
// db.select() is used for the connection queries. Two shapes are awaited:
//   select().from(recordLinks).where().orderBy().limit()  → link rows
//   select().from(records).where()                        → outside records
// so `where` returns something both chainable and awaitable.
const mockLinkRows = vi.hoisted(() => vi.fn());
const mockOutsideRecordRows = vi.hoisted(() => vi.fn());
const mockSelect = vi.hoisted(() =>
  vi.fn(() => ({
    from: () => ({
      where: () => ({
        orderBy: () => ({ limit: mockLinkRows }),
        then: (
          resolve: (v: unknown) => unknown,
          reject: (e: unknown) => unknown
        ) => Promise.resolve(mockOutsideRecordRows()).then(resolve, reject),
      }),
    }),
  }))
);

vi.mock("@/db", () => ({
  db: {
    select: mockSelect,
    query: {
      reflections: {
        findFirst: mockFindExistingReflection,
        findMany: mockFindPreviousReflections,
      },
      records: {
        findMany: mockFindPeriodRecords,
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

vi.mock("@/lib/ai/usage", () => ({
  logAiOutcome: mockLogAiOutcome,
}));

import { generateReflection } from "@/lib/ai/reflection";

describe("generateReflection", () => {
  // Many of these tests use the implicit current-week default (no dateRange),
  // since the orchestration logic is the same regardless of period length.
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

    // No manual connections by default.
    mockLinkRows.mockResolvedValue([]);
    mockOutsideRecordRows.mockResolvedValue([]);

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

    const result = await generateReflection("user-123");

    expect(result).toEqual({
      id: "reflection-existing",
      content: "Already generated",
      recommendations: [],
    });
    expect(mockFindPeriodRecords).not.toHaveBeenCalled();
    expect(mockChat).not.toHaveBeenCalled();
  });

  it("returns null when no records were saved this week", async () => {
    mockFindExistingReflection.mockResolvedValue(null);
    mockFindPeriodRecords.mockResolvedValue([]);

    const result = await generateReflection("user-123");

    expect(result).toBeNull();
    expect(mockChat).not.toHaveBeenCalled();
    expect(mockInsertValues).not.toHaveBeenCalled();
  });

  it("saves both the reflection content and recommendations on a new row", async () => {
    mockFindExistingReflection.mockResolvedValue(null);
    // First call: this week's records. Second call: recent titled records
    // from previous weeks (empty here — no older saves in this scenario).
    mockFindPeriodRecords
      .mockResolvedValueOnce([
        {
          type: "article",
          title: "Slow Productivity",
          content: "Notes on attention and deliberate pace.",
          sourceAuthor: "Cal Newport",
          createdAt: new Date("2026-03-24T12:00:00Z"),
          recordTags: [{ tag: { name: "attention" } }, { tag: { name: "work" } }],
        },
      ])
      .mockResolvedValueOnce([]);

    const result = await generateReflection("user-123");

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

  it("resolves inline record markers to /records/<id> links and strips hallucinated ones", async () => {
    mockFindExistingReflection.mockResolvedValue(null);
    // Two records → markers R1, R2 are valid; R9 is not in the map.
    mockFindPeriodRecords
      .mockResolvedValueOnce([
        {
          id: "rec-1",
          type: "article",
          title: "The Essay",
          content: "On focus and attention.",
          sourceAuthor: null,
          note: null,
          createdAt: new Date("2026-03-24T12:00:00Z"),
          recordTags: [],
        },
        {
          id: "rec-2",
          type: "quote",
          title: "A Quote",
          content: "Some words.",
          sourceAuthor: null,
          note: null,
          createdAt: new Date("2026-03-25T12:00:00Z"),
          recordTags: [],
        },
      ])
      .mockResolvedValueOnce([]);

    // The model links a real record (R1) and hallucinates one (R9).
    mockChat.mockResolvedValueOnce(
      "Loved [the essay](R1), and [a ghost record](R9) too."
    );

    await generateReflection("user-123");

    const saved = mockInsertValues.mock.calls[0][0];
    // Valid marker → real URL; marker itself is gone.
    expect(saved.content).toContain("[the essay](/records/rec-1)");
    expect(saved.content).not.toContain("(R1)");
    // Hallucinated marker → link stripped, visible text kept.
    expect(saved.content).toContain("a ghost record");
    expect(saved.content).not.toContain("(R9)");
    expect(saved.content).not.toContain("](R9)");
  });

  it("sends a note record's full content but truncates other types to a preview", async () => {
    // "Where the meat lives depends on type": a note's body is its `content`
    // (primary — must not be clipped), while an article's `content` is captured
    // source material (secondary — a short preview is enough).
    mockFindExistingReflection.mockResolvedValue(null);
    const longNote = "N".repeat(210) + "NOTE_TAIL"; // 219 chars, past the 200 cap
    const longArticle = "A".repeat(210) + "ARTICLE_TAIL";
    mockFindPeriodRecords
      .mockResolvedValueOnce([
        {
          id: "rec-note",
          type: "note",
          title: "A long note",
          content: longNote,
          note: null,
          sourceAuthor: null,
          createdAt: new Date("2026-03-24T12:00:00Z"),
          recordTags: [],
        },
        {
          id: "rec-article",
          type: "article",
          title: "A long article",
          content: longArticle,
          note: null,
          sourceAuthor: null,
          createdAt: new Date("2026-03-25T12:00:00Z"),
          recordTags: [],
        },
      ])
      .mockResolvedValueOnce([]);

    await generateReflection("user-123");

    // The reflection prompt is the first message's content on the first chat call.
    const prompt = mockChat.mock.calls[0][0][0].content as string;
    // Note content is primary → included past the 200-char preview cap.
    expect(prompt).toContain("NOTE_TAIL");
    // Article content is secondary → truncated to a 200-char preview.
    expect(prompt).not.toContain("ARTICLE_TAIL");
    expect(prompt).toContain("A".repeat(200) + "...");
  });

  it("includes the user's connections, giving outside records their own markers", async () => {
    mockFindExistingReflection.mockResolvedValue(null);
    mockFindPeriodRecords
      .mockResolvedValueOnce([
        {
          id: "rec-1",
          type: "quote",
          title: "On attention",
          content: "Attention is the rarest form of generosity.",
          sourceAuthor: "Simone Weil",
          note: null,
          createdAt: new Date("2026-03-24T12:00:00Z"),
          recordTags: [],
        },
        {
          id: "rec-2",
          type: "note",
          title: "Phone-free mornings",
          content: "Trying no phone before 10.",
          sourceAuthor: null,
          note: null,
          createdAt: new Date("2026-03-25T12:00:00Z"),
          recordTags: [],
        },
      ])
      .mockResolvedValueOnce([]);

    // One link inside the period, one (stored in the reverse direction) back
    // to an older record, and one whose far side no longer resolves.
    mockLinkRows.mockResolvedValue([
      { recordId: "rec-1", relatedRecordId: "rec-2", note: "practice of the idea" },
      { recordId: "rec-old", relatedRecordId: "rec-1", note: null },
      { recordId: "rec-1", relatedRecordId: "rec-missing", note: "gone" },
    ]);
    mockOutsideRecordRows.mockResolvedValue([
      {
        id: "rec-old",
        type: "article",
        title: "The Attention Economy",
        content: "An older essay.",
        sourceAuthor: null,
        createdAt: new Date("2026-01-10T12:00:00Z"),
      },
    ]);

    mockChat.mockResolvedValueOnce("This echoes [an older essay](R3).");

    await generateReflection("user-123");

    const prompt = mockChat.mock.calls[0][0][0].content as string;
    // Outside record gets the next marker after the period's R1, R2.
    expect(prompt).toContain('R3 [article] (saved Jan 10, 2026) "The Attention Economy"');
    expect(prompt).toContain("saved OUTSIDE this period");
    expect(prompt).toContain('- R1 ↔ R2: "practice of the idea"');
    expect(prompt).toContain("- R3 ↔ R1 (no note)");
    // Unresolvable link is dropped, not sent half-resolved.
    expect(prompt).not.toContain("gone");
    expect(prompt).toContain("Start from the connections the user drew");

    // Links to the outside record resolve like any other marker.
    const saved = mockInsertValues.mock.calls[0][0];
    expect(saved.content).toContain("[an older essay](/records/rec-old)");
  });

  it("leaves the connections sections out when there are no links", async () => {
    oneRecordPeriod();

    await generateReflection("user-123");

    const prompt = mockChat.mock.calls[0][0][0].content as string;
    expect(prompt).not.toContain("Connections the user has drawn");
    expect(prompt).not.toContain("saved OUTSIDE this period");
    expect(prompt).toContain("Find links between records that might not be obvious");
    // No links → no second query for outside records.
    expect(mockOutsideRecordRows).not.toHaveBeenCalled();
  });

  it("still saves the reflection when recommendations come back empty", async () => {
    mockFindExistingReflection.mockResolvedValue(null);
    mockFindPeriodRecords
      .mockResolvedValueOnce([
        {
          type: "note",
          title: "On slowness",
          content: "A short note about patience.",
          sourceAuthor: null,
          createdAt: new Date("2026-03-24T12:00:00Z"),
          recordTags: [],
        },
      ])
      .mockResolvedValueOnce([]);
    mockGenerateRecommendations.mockResolvedValue([]);

    await generateReflection("user-123");

    expect(mockInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        recommendations: [],
      })
    );
  });

  // ---- ai_usage logging (AI failure-alerts plan) ----
  // The chat call's outcome is held until the reflection row exists, so the
  // ai_usage row carries the reflectionId.

  const okOutcome = {
    status: "ok" as const,
    provider: "claude" as const,
    model: "claude-sonnet-5-5",
    usage: { inputTokens: 1000, outputTokens: 400 },
  };

  function oneRecordPeriod() {
    mockFindExistingReflection.mockResolvedValue(null);
    // mockReset, not just clear: a test that throws mid-run can leave a
    // queued mockResolvedValueOnce behind for the next test.
    mockFindPeriodRecords.mockReset();
    mockFindPeriodRecords
      .mockResolvedValueOnce([
        {
          id: "rec-1",
          type: "note",
          title: "A note",
          content: "Thinking about attention.",
          sourceAuthor: null,
          createdAt: new Date("2026-03-24T12:00:00Z"),
          recordTags: [],
        },
      ])
      .mockResolvedValueOnce([]);
  }

  it("logs a successful call with the new reflection's id", async () => {
    oneRecordPeriod();
    mockChat.mockImplementation(async (_m: unknown, _c: unknown, onOutcome: (o: unknown) => void) => {
      onOutcome(okOutcome);
      return "A week of attention.";
    });

    await generateReflection("user-1");

    expect(mockLogAiOutcome).toHaveBeenCalledTimes(1);
    expect(mockLogAiOutcome).toHaveBeenCalledWith(
      { userId: "user-1", feature: "reflection", reflectionId: "reflection-new" },
      okOutcome
    );
  });

  it("logs a failed call immediately, without a reflection id", async () => {
    oneRecordPeriod();
    const errorOutcome = { ...okOutcome, status: "error" as const, error: new Error("down") };
    mockChat.mockImplementation(async (_m: unknown, _c: unknown, onOutcome: (o: unknown) => void) => {
      onOutcome(errorOutcome);
      throw new Error("down");
    });

    await expect(generateReflection("user-1")).rejects.toThrow("down");
    expect(mockLogAiOutcome).toHaveBeenCalledTimes(1);
    expect(mockLogAiOutcome).toHaveBeenCalledWith(
      { userId: "user-1", feature: "reflection" },
      errorOutcome
    );
  });

  it("still logs the billed call when a later step fails", async () => {
    oneRecordPeriod();
    mockChat.mockImplementation(async (_m: unknown, _c: unknown, onOutcome: (o: unknown) => void) => {
      onOutcome(okOutcome);
      return "A week of attention.";
    });
    mockReturning.mockRejectedValue(new Error("insert failed"));

    await expect(generateReflection("user-1")).rejects.toThrow("insert failed");
    expect(mockLogAiOutcome).toHaveBeenCalledTimes(1);
    expect(mockLogAiOutcome).toHaveBeenCalledWith(
      { userId: "user-1", feature: "reflection" },
      okOutcome
    );
  });
});
