// ============================================================================
// AI ERROR CLASSIFICATION
// ============================================================================
//
// Maps whatever an AI call threw to a small, stable category for ai_usage
// (error_kind) and the alerts. Categories, not raw text, are what you group
// and alert on: "3 × rate_limit" says something, three different 429 bodies
// don't. The raw message is kept too, truncated, for the admin card.
//
// Sources handled:
//   - Anthropic SDK errors (APIError subclasses carry an HTTP status;
//     connection/timeout errors carry none)
//   - AiHttpError: thrown by our own fetch-based clients (Voyage) with the
//     HTTP status attached, so we never regex a status out of a message
//   - AiInvalidResponseError: the provider answered, but we couldn't use the
//     answer (no data, unparseable JSON, missing text block)
//   - fetch/AbortSignal failures (TypeError "fetch failed", TimeoutError)
// ============================================================================

import Anthropic from "@anthropic-ai/sdk";

export type AiErrorKind =
  | "auth" // bad/revoked key or no permission: everything on this provider is down
  | "rate_limit"
  | "overloaded" // provider capacity (529/503)
  | "timeout"
  | "network" // couldn't reach the provider at all
  | "bad_request" // usually a model/parameter mismatch on our side
  | "invalid_response" // got a reply we couldn't use
  | "api_error" // other provider-side 5xx
  | "unknown";

/** HTTP failure from a provider we call with plain fetch (e.g. Voyage). */
export class AiHttpError extends Error {
  constructor(
    readonly provider: string,
    readonly status: number,
    message: string
  ) {
    super(message);
    this.name = "AiHttpError";
  }
}

/** The provider answered, but the answer was unusable. */
export class AiInvalidResponseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiInvalidResponseError";
  }
}

// Stored error text is capped: enough to diagnose, small enough that a
// verbose provider body can't bloat the table.
export const MAX_ERROR_MESSAGE_LENGTH = 300;

export function kindForStatus(status: number): AiErrorKind {
  if (status === 401 || status === 403) return "auth";
  if (status === 429) return "rate_limit";
  if (status === 529 || status === 503) return "overloaded";
  if (status === 408 || status === 504) return "timeout";
  if (status >= 400 && status < 500) return "bad_request";
  if (status >= 500) return "api_error";
  return "unknown";
}

function truncate(message: string): string {
  return message.length > MAX_ERROR_MESSAGE_LENGTH
    ? `${message.slice(0, MAX_ERROR_MESSAGE_LENGTH - 1)}…`
    : message;
}

// `instanceof` that tolerates a missing class (e.g. a test that mocks the SDK
// module with a bare stub) instead of throwing — classification must never
// throw, since it runs inside "never throws" loggers.
function isInstance(err: unknown, cls: unknown): boolean {
  return typeof cls === "function" && err instanceof (cls as new (...args: never[]) => unknown);
}

export function classifyAiError(err: unknown): {
  kind: AiErrorKind;
  message: string;
} {
  const message = truncate(
    err instanceof Error ? err.message : String(err ?? "unknown error")
  );

  const kind: AiErrorKind = (() => {
    // Order matters: the timeout class is a subclass of the connection class.
    if (isInstance(err, Anthropic.APIConnectionTimeoutError)) return "timeout";
    if (isInstance(err, Anthropic.APIUserAbortError)) return "timeout";
    if (isInstance(err, Anthropic.APIConnectionError)) return "network";
    if (isInstance(err, Anthropic.APIError)) {
      const status = (err as { status?: unknown }).status;
      if (typeof status === "number") return kindForStatus(status);
    }
    if (err instanceof AiHttpError) return kindForStatus(err.status);
    if (err instanceof AiInvalidResponseError) return "invalid_response";
    if (err instanceof SyntaxError) return "invalid_response"; // JSON.parse
    if (err instanceof Error) {
      // AbortSignal.timeout() rejects with a DOMException named TimeoutError.
      if (err.name === "TimeoutError" || err.name === "AbortError") return "timeout";
      // Node's fetch rejects with TypeError("fetch failed") when unreachable.
      if (err instanceof TypeError && /fetch failed/i.test(err.message)) return "network";
    }
    return "unknown";
  })();

  return { kind, message };
}
