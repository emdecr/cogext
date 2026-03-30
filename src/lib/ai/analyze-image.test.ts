// ============================================================================
// UNIT TESTS — analyzeImage
// ============================================================================
//
// analyzeImage has three external dependencies we must mock:
//   1. @anthropic-ai/sdk — the Anthropic API client (expensive, requires key)
//   2. fs/promises.readFile — reads local image files from disk
//   3. global.fetch — downloads remote images over HTTP
//
// KEY TECHNIQUE: mocking a module with vi.mock()
//   vi.mock("module-name", factory) replaces the module with our factory's
//   return value for the ENTIRE test file. The mock is hoisted by Vitest
//   to run before any imports — so even though we write it here, it takes
//   effect before `analyzeImage` is imported.
//
//   For the Anthropic SDK, the module exports a class as its DEFAULT export:
//     import Anthropic from "@anthropic-ai/sdk"
//     const client = new Anthropic({ apiKey })
//   Our mock needs to be a constructor function that returns an object with
//   the methods we use (messages.create).
//
// KEY TECHNIQUE: dynamic imports in the source
//   analyzeImage imports fs/promises DYNAMICALLY inside the function:
//     const { readFile } = await import("fs/promises")
//   Vitest's vi.mock() intercepts ALL imports — static and dynamic.
//   So vi.mock("fs/promises") still works here.
// ============================================================================

import { vi, beforeEach, afterEach } from "vitest";
import { mockAnthropicTextResponse, mockAnthropicEmptyResponse } from "@/test/mocks/ai";

// ---- Mock the Anthropic SDK ----
//
// IMPORTANT: why vi.hoisted() is needed here.
//
// vi.mock() factory functions are hoisted to run BEFORE any imports.
// That means `const mockCreate = vi.fn()` (below) hasn't run yet when the
// factory executes — it's `undefined` inside the factory.
//
// vi.hoisted() is the escape hatch: it runs its callback even earlier,
// before the mock factories, so the returned value IS available inside vi.mock().
//
// Why a regular function (not arrow) for the constructor mock?
//   JavaScript `new` calls require a function with [[Construct]] capability.
//   Arrow functions don't have it — `new (() => {})` throws "not a constructor".
//   vi.fn() with an arrow implementation loses [[Construct]] too.
//   A regular function `function() {}` is always constructable.
const mockCreate = vi.hoisted(() => vi.fn());

vi.mock("@anthropic-ai/sdk", () => ({
  // The SDK's default export is a class: `new Anthropic({ apiKey })`.
  // We provide a constructor function (not arrow!) that installs our mock.
  default: vi.fn(function MockAnthropic(this: { messages: { create: typeof mockCreate } }) {
    this.messages = { create: mockCreate };
  }),
}));

vi.mock("@/db", () => ({
  db: {},
}));

// ---- Mock fs/promises ----
// analyzeImage uses readFile to load local images
const mockReadFile = vi.fn();
vi.mock("fs/promises", () => ({
  readFile: mockReadFile,
}));

// Import AFTER mocks are set up
import { analyzeImage } from "@/lib/ai/analyze-image";

describe("analyzeImage", () => {
  beforeEach(() => {
    // Set a real-looking API key so the "no API key" guard doesn't trigger
    process.env.ANTHROPIC_API_KEY = "sk-ant-test-key-12345";

    // Default: readFile succeeds with fake image bytes
    mockReadFile.mockResolvedValue(Buffer.from("fake-image-bytes"));

    // Default: Claude returns a description
    mockCreate.mockResolvedValue(
      mockAnthropicTextResponse(
        "A red bicycle leaning against a stone wall in a cobblestone alley."
      )
    );

    // Mock global fetch for remote URL tests
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(8)),
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
    delete process.env.ANTHROPIC_API_KEY;
  });

  // ---- Guard: no API key ----

  it("returns null when ANTHROPIC_API_KEY is not set", async () => {
    delete process.env.ANTHROPIC_API_KEY;

    const result = await analyzeImage("/uploads/photo.jpg");

    // No API call should have been made
    expect(mockCreate).not.toHaveBeenCalled();
    expect(result).toBeNull();
  });

  // ---- File reading ----

  it("reads local images from the filesystem", async () => {
    await analyzeImage("/uploads/photo.jpg");

    // readFile should have been called with the absolute path
    expect(mockReadFile).toHaveBeenCalled();
    const callArg = mockReadFile.mock.calls[0][0] as string;
    expect(callArg).toContain("photo.jpg");
  });

  it("fetches remote images over HTTP", async () => {
    await analyzeImage("https://example.com/photo.jpg");

    expect(global.fetch).toHaveBeenCalledWith("https://example.com/photo.jpg");
    // Local readFile should NOT have been called for a remote URL
    expect(mockReadFile).not.toHaveBeenCalled();
  });

  it("returns null when the local file cannot be read", async () => {
    mockReadFile.mockRejectedValue(new Error("ENOENT: no such file"));

    const result = await analyzeImage("/uploads/missing.jpg");

    expect(result).toBeNull();
  });

  it("returns null when the remote fetch fails", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      status: 404,
    });

    const result = await analyzeImage("https://example.com/missing.jpg");

    expect(result).toBeNull();
  });

  // ---- MIME type detection ----

  it("returns null for an unknown file extension", async () => {
    // .bmp is not in our allowed types
    const result = await analyzeImage("/uploads/photo.bmp");

    expect(result).toBeNull();
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("handles all supported extensions", async () => {
    const extensions = [".jpg", ".jpeg", ".png", ".gif", ".webp"];

    for (const ext of extensions) {
      mockCreate.mockResolvedValue(
        mockAnthropicTextResponse("A description.")
      );
      const result = await analyzeImage(`/uploads/photo${ext}`);
      expect(result, `extension ${ext} should be supported`).not.toBeNull();
    }
  });

  // ---- Claude API call ----

  it("returns the description text from Claude's response", async () => {
    mockCreate.mockResolvedValue(
      mockAnthropicTextResponse("A peaceful mountain lake at sunset.")
    );

    const result = await analyzeImage("/uploads/lake.jpg");

    expect(result).toBe("A peaceful mountain lake at sunset.");
  });

  it("calls Claude with the correct model and max_tokens", async () => {
    await analyzeImage("/uploads/photo.jpg");

    const callArgs = mockCreate.mock.calls[0][0];
    expect(callArgs.model).toBe("claude-haiku-4-5-20251001");
    expect(callArgs.max_tokens).toBe(500);
  });

  it("sends the image as a base64 content block", async () => {
    await analyzeImage("/uploads/photo.jpg");

    const callArgs = mockCreate.mock.calls[0][0];
    const imageBlock = callArgs.messages[0].content[0];
    expect(imageBlock.type).toBe("image");
    expect(imageBlock.source.type).toBe("base64");
    expect(imageBlock.source.media_type).toBe("image/jpeg");
  });

  it("trims whitespace from the description", async () => {
    mockCreate.mockResolvedValue(
      mockAnthropicTextResponse("  Description with leading/trailing spaces.  ")
    );

    const result = await analyzeImage("/uploads/photo.jpg");

    expect(result).toBe("Description with leading/trailing spaces.");
  });

  // ---- Fallback / error handling ----

  it("returns null when Claude returns an empty response", async () => {
    mockCreate.mockResolvedValue(mockAnthropicEmptyResponse());

    const result = await analyzeImage("/uploads/photo.jpg");

    expect(result).toBeNull();
  });

  it("returns null when the Claude API call throws", async () => {
    mockCreate.mockRejectedValue(new Error("API rate limit exceeded"));

    const result = await analyzeImage("/uploads/photo.jpg");

    // Should NOT throw — analyzeImage catches all errors and returns null
    expect(result).toBeNull();
  });
});
