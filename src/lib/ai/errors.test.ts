// ============================================================================
// UNIT TESTS — AI error classification
// ============================================================================
//
// Uses the real Anthropic SDK error classes (APIError.generate builds the
// same subclass the SDK throws for a status), so a SDK upgrade that changes
// the hierarchy shows up here.
// ============================================================================

import Anthropic from "@anthropic-ai/sdk";
import {
  AiHttpError,
  AiInvalidResponseError,
  MAX_ERROR_MESSAGE_LENGTH,
  classifyAiError,
  kindForStatus,
} from "@/lib/ai/errors";

const sdkError = (status: number, type = "api_error") =>
  Anthropic.APIError.generate(
    status,
    { type: "error", error: { type, message: `${type} message` } },
    undefined,
    new Headers()
  );

describe("classifyAiError — Anthropic SDK", () => {
  it.each([
    [401, "authentication_error", "auth"],
    [403, "permission_error", "auth"],
    [429, "rate_limit_error", "rate_limit"],
    [529, "overloaded_error", "overloaded"],
    [400, "invalid_request_error", "bad_request"],
    [404, "not_found_error", "bad_request"],
    [500, "api_error", "api_error"],
  ])("status %i (%s) → %s", (status, type, kind) => {
    expect(classifyAiError(sdkError(status, type)).kind).toBe(kind);
  });

  it("timeout is checked before its parent connection error", () => {
    expect(classifyAiError(new Anthropic.APIConnectionTimeoutError()).kind).toBe("timeout");
    expect(
      classifyAiError(new Anthropic.APIConnectionError({ message: "Connection error." })).kind
    ).toBe("network");
  });

  it("keeps the SDK message (status + body) for the admin card", () => {
    expect(classifyAiError(sdkError(429, "rate_limit_error")).message).toMatch(/^429 /);
  });
});

describe("classifyAiError — our own errors and fetch", () => {
  it("reads the status off AiHttpError (Voyage) instead of parsing text", () => {
    expect(classifyAiError(new AiHttpError("voyage", 401, "Voyage AI API error (401): x")).kind).toBe("auth");
    expect(classifyAiError(new AiHttpError("voyage", 503, "x")).kind).toBe("overloaded");
  });

  it("unusable replies are invalid_response", () => {
    expect(classifyAiError(new AiInvalidResponseError("no data")).kind).toBe("invalid_response");
    let parseError: unknown;
    try {
      JSON.parse("{not json");
    } catch (e) {
      parseError = e;
    }
    expect(classifyAiError(parseError).kind).toBe("invalid_response");
  });

  it("fetch and AbortSignal failures", () => {
    expect(classifyAiError(new TypeError("fetch failed")).kind).toBe("network");
    const timeout = new Error("The operation was aborted due to timeout");
    timeout.name = "TimeoutError";
    expect(classifyAiError(timeout).kind).toBe("timeout");
  });

  it("anything else is unknown, including non-Error throws", () => {
    expect(classifyAiError(new Error("boom"))).toEqual({ kind: "unknown", message: "boom" });
    expect(classifyAiError("a string")).toEqual({ kind: "unknown", message: "a string" });
    expect(classifyAiError(undefined).message).toBe("unknown error");
  });
});

describe("message truncation", () => {
  it(`caps stored text at ${MAX_ERROR_MESSAGE_LENGTH} chars`, () => {
    const { message } = classifyAiError(new Error("x".repeat(5000)));
    expect(message).toHaveLength(MAX_ERROR_MESSAGE_LENGTH);
    expect(message.endsWith("…")).toBe(true);
  });
});

describe("kindForStatus", () => {
  it("covers gateway timeouts and unknown codes", () => {
    expect(kindForStatus(408)).toBe("timeout");
    expect(kindForStatus(504)).toBe("timeout");
    expect(kindForStatus(302)).toBe("unknown");
  });
});
