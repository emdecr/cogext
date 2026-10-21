// ============================================================================
// AI TOKEN USAGE LOGGER
// ============================================================================
//
// Centralizes token usage logging so every AI call site writes to the same
// ai_usage table with a consistent shape. Each row captures:
//   - WHO: userId
//   - WHAT: feature (chat, reflection, profile, etc.)
//   - HOW: provider + model
//   - HOW MUCH: inputTokens + outputTokens
//   - CONTEXT: optional conversationId or reflectionId
//
// Usage is fire-and-forget: logging failures are swallowed and logged to
// the console. An AI call should never fail because the usage logger broke.
//
// Every call gets ONE row, success or not (plans/2026-10-21-ai-failure-alerts.md):
//   - logAiUsage()   — success (status "ok", the default) or a refusal
//                      (status "refusal", with the tokens it was billed for)
//   - logAiFailure() — the call threw; 0 tokens, status "error", plus a
//                      classified error_kind and a truncated error_message
// ============================================================================

import { db } from "@/db";
import { aiUsage } from "@/db/schema";
import { logger } from "@/lib/logger";
import { classifyAiError } from "./errors";

// ============================================================================
// TYPES
// ============================================================================

// Token counts returned by AI providers. Both Claude and Ollama expose
// input/output token counts in their responses.
export type TokenUsage = {
  inputTokens: number;
  outputTokens: number;
};

// The feature that triggered the AI call. Must match the ai_feature enum
// values in the database schema.
export type AiFeature =
  | "chat"
  | "reflection"
  | "profile"
  | "recommendation"
  | "image_analysis"
  | "tagging"
  | "embedding";

// Which provider handled the call. Must match the ai_provider enum.
export type AiProvider = "claude" | "ollama" | "voyage";

// Outcome of the call. Must match the ai_call_status enum.
export type AiCallStatus = "ok" | "error" | "refusal";

// Everything needed to log a single AI usage row.
export type LogAiUsageParams = {
  userId: string;
  feature: AiFeature;
  provider: AiProvider;
  model: string;
  usage: TokenUsage;
  conversationId?: string;
  reflectionId?: string;
  // "ok" (default) or "refusal". Errors go through logAiFailure() instead.
  status?: Exclude<AiCallStatus, "error">;
};

// ============================================================================
// LOG AI USAGE
// ============================================================================
// Fire-and-forget: inserts a row and swallows errors. We don't await this
// in the critical path unless the caller explicitly wants to (e.g., in tests).
//
// Returns the insert promise so callers CAN await it if needed, but in
// practice most call sites will just call it without awaiting.

export function logAiUsage(params: LogAiUsageParams): Promise<void> {
  return db
    .insert(aiUsage)
    .values({
      userId: params.userId,
      feature: params.feature,
      provider: params.provider,
      model: params.model,
      inputTokens: params.usage.inputTokens,
      outputTokens: params.usage.outputTokens,
      conversationId: params.conversationId,
      reflectionId: params.reflectionId,
      status: params.status ?? "ok",
    })
    .then(() => {})
    .catch((error) => {
      // Swallow the error — usage logging should never break the feature.
      logger.error("Failed to log AI usage", {
        feature: params.feature,
        provider: params.provider,
        error,
      });
    });
}

// ============================================================================
// LOG AI FAILURE
// ============================================================================
// Records a call that threw: 0 tokens (nothing billed, or nothing we can
// see), status "error", and the classified kind + truncated message. Same
// fire-and-forget contract as logAiUsage — it never throws, so a catch block
// can call it without its own try/catch.
//
// Only for real AI-call failures. Skip-paths that aren't failures (no API
// key in dev, image file missing, record deleted) are NOT logged here.

export type LogAiFailureParams = {
  userId: string;
  feature: AiFeature;
  provider: AiProvider;
  model: string;
  error: unknown;
  conversationId?: string;
  reflectionId?: string;
};

export function logAiFailure(params: LogAiFailureParams): Promise<void> {
  const { kind, message } = classifyAiError(params.error);
  return db
    .insert(aiUsage)
    .values({
      userId: params.userId,
      feature: params.feature,
      provider: params.provider,
      model: params.model,
      inputTokens: 0,
      outputTokens: 0,
      conversationId: params.conversationId,
      reflectionId: params.reflectionId,
      status: "error",
      errorKind: kind,
      errorMessage: message,
    })
    .then(() => {})
    .catch((error) => {
      logger.error("Failed to log AI failure", {
        feature: params.feature,
        provider: params.provider,
        errorKind: kind,
        error,
      });
    });
}
