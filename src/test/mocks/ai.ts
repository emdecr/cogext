// ============================================================================
// MOCK AI PROVIDERS
// ============================================================================
//
// These mocks replace real AI calls in tests. Without them, every test
// that touches embedding or image analysis would need a running Ollama
// server and a real Anthropic API key — which makes tests slow, flaky,
// and expensive.
//
// Key principle: mocks should return DETERMINISTIC results.
//   - Same input → same output, every time
//   - No network calls, no randomness
//   - Fast (microseconds, not seconds)
//
// Usage in a test file:
//   vi.mock("@anthropic-ai/sdk", () => ({ default: MockAnthropic }))
//   vi.mock("@/lib/ai", () => ({ getEmbeddingProvider: mockGetEmbeddingProvider }))
// ============================================================================

import { vi } from "vitest";

// ---- Deterministic embedding vector ----
// Real embeddings are 768 floats representing semantic meaning.
// For tests, we just need consistent numbers — the actual values don't matter.
// We use a vector that's all zeros with 1.0 at index 0 as a recognizable pattern.
export function createMockEmbedding(dimensions = 768): number[] {
  const vec = new Array(dimensions).fill(0);
  vec[0] = 1.0;
  return vec;
}

// ---- Mock embedding provider ----
// Matches the interface expected by embedRecord() and embedRecordsBatch().
// vi.fn() gives us spy capabilities: we can check how many times it was
// called, what arguments it received, etc.
export const mockEmbeddingProvider = {
  embed: vi.fn().mockResolvedValue(createMockEmbedding()),

  // embedBatch takes an array of strings and returns an array of vectors.
  // We map each input to one deterministic vector.
  embedBatch: vi.fn().mockImplementation((texts: string[]) =>
    Promise.resolve(texts.map(() => createMockEmbedding()))
  ),
};

// Convenience function to use as the mock for getEmbeddingProvider()
export const mockGetEmbeddingProvider = vi
  .fn()
  .mockResolvedValue(mockEmbeddingProvider);

// ---- Mock Anthropic SDK response builders ----
// Anthropic's API returns a complex object. These builders create the
// minimal shape needed for our code to work — we don't replicate the
// entire SDK type structure.

// A typical successful text response from Claude
export function mockAnthropicTextResponse(text: string) {
  return {
    id: "msg_test_123",
    type: "message" as const,
    role: "assistant" as const,
    content: [{ type: "text" as const, text }],
    model: "claude-haiku-4-5-20251001",
    stop_reason: "end_turn" as const,
    stop_sequence: null,
    usage: { input_tokens: 10, output_tokens: 50 },
  };
}

// A response with no text block — simulates Claude returning only tool calls
// or an unexpected response shape
export function mockAnthropicEmptyResponse() {
  return {
    id: "msg_test_456",
    type: "message" as const,
    role: "assistant" as const,
    content: [],
    model: "claude-haiku-4-5-20251001",
    stop_reason: "end_turn" as const,
    stop_sequence: null,
    usage: { input_tokens: 5, output_tokens: 0 },
  };
}

// ---- Mock Anthropic constructor ----
// Used with vi.mock("@anthropic-ai/sdk", () => ({ default: MockAnthropic }))
//
// The actual SDK is instantiated as: new Anthropic({ apiKey })
// Our mock needs to be a class (or function that returns an object) with a
// .messages.create() method.
export const MockAnthropic = vi.fn().mockImplementation(() => ({
  messages: {
    create: vi
      .fn()
      .mockResolvedValue(
        mockAnthropicTextResponse("A red bicycle leaning against a stone wall.")
      ),
  },
}));
