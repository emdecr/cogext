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
// ============================================================================

import { db } from "@/db";
import { aiUsage } from "@/db/schema";
import { logger } from "@/lib/logger";

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
  | "tagging";

// Which provider handled the call. Must match the ai_provider enum.
export type AiProvider = "claude" | "ollama";

// Everything needed to log a single AI usage row.
export type LogAiUsageParams = {
  userId: string;
  feature: AiFeature;
  provider: AiProvider;
  model: string;
  usage: TokenUsage;
  conversationId?: string;
  reflectionId?: string;
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
