// ============================================================================
// AI CALL OUTCOMES — what providers report back to their callers
// ============================================================================
//
// Every provider method that calls a model (generateTags, chat, chatStream,
// embed, embedBatch) accepts an optional `onOutcome` callback and invokes it
// exactly once per API request: ok, refusal, or error. The provider fills in
// its own name and model, so callers don't need to know which provider ran;
// they just add who/what (userId, feature) and hand it to logAiOutcome() in
// ./usage.ts, which writes the one ai_usage row.
//
// Pure (type imports only), so providers can use it without pulling in the
// database.
// ============================================================================

import type { AiProvider, TokenUsage } from "./usage";

export type AiCallOutcome =
  | {
      status: "ok" | "refusal";
      provider: AiProvider;
      model: string;
      usage: TokenUsage;
    }
  | {
      status: "error";
      provider: AiProvider;
      model: string;
      error: unknown;
      // Present when the request succeeded (and was billed) but the reply was
      // unusable — an invalid_response. Absent when the request itself failed.
      usage?: TokenUsage;
    };

export type OutcomeCallback = (outcome: AiCallOutcome) => void;

/**
 * Invoke a caller's callback without letting it break the AI call. A bug in
 * logging must never turn a successful generation into a failure (or mask
 * the real error on a failed one).
 */
export function reportOutcome(
  onOutcome: OutcomeCallback | undefined,
  outcome: AiCallOutcome
): void {
  if (!onOutcome) return;
  try {
    onOutcome(outcome);
  } catch {
    // Deliberately swallowed: the callback is fire-and-forget bookkeeping.
  }
}
