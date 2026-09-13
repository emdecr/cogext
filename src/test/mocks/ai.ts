// ============================================================================
// MOCK ANTHROPIC RESPONSES
// ============================================================================
//
// Minimal builders for the shape our code reads off an Anthropic Messages
// response. Tests that need the SDK itself mocked install their own
// vi.mock("@anthropic-ai/sdk", ...) with a spyable messages.create (see
// analyze-image.test.ts / generate-recommendations.test.ts) and use these to
// produce the resolved value.
//
// Deterministic and dependency-free: same input → same output, no network.
//
// (Embedding-provider and Anthropic-constructor mocks used to live here too but
// were unused — a mock nobody runs drifts from the real interface, so they were
// removed. Reintroduce a correctly-shaped one when a test actually needs it.)

// A typical successful text response from Claude.
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
// or an otherwise unexpected response shape.
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
