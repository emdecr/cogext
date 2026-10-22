// ============================================================================
// OLLAMA LLM PROVIDER
// ============================================================================
//
// Implements the LLMProvider interface using a local Ollama server.
//
// Model: llama3.2:1b
//   - Smallest Llama 3.2 model (~1.3GB download)
//   - Good enough for simple tasks like tag generation
//   - Runs on CPU (no GPU needed)
//   - ~1-5 seconds per response on modern hardware
//
// For auto-tagging, we don't need a powerful model — we just need it to
// read some text and output 3-5 relevant keywords. A 1B parameter model
// handles this well. If quality isn't good enough, you can swap to a
// larger model (llama3.2:3b) or an API provider (Claude, GPT-4) by
// changing the factory in ./index.ts.
//
// API: POST http://localhost:11434/api/generate
// We use the /api/generate endpoint (not /api/chat) because we're doing
// single-turn generation, not multi-turn conversation.
// ============================================================================

import type { LLMProvider, OutcomeCallback } from "./types";
import { reportOutcome } from "./outcome";
import { AiHttpError, AiInvalidResponseError } from "./errors";
import { logger } from "@/lib/logger";
import { ollamaModelFor } from "./model-settings";

export class OllamaLLMProvider implements LLMProvider {
  private baseUrl: string;
  private model: string;

  constructor() {
    this.baseUrl = process.env.AI_BASE_URL || "http://localhost:11434";
    this.model = ollamaModelFor("LLM_MODEL");
  }

  // ---- Generate tags for a record ----
  // We craft a prompt that asks the model to return ONLY a JSON array
  // of tags. The `format: "json"` option tells Ollama to constrain
  // output to valid JSON (it uses grammar-based sampling internally).
  //
  // We limit to 5 tags to avoid noise. The model sometimes suggests
  // overly specific or generic tags — the prompt tries to guide it
  // toward useful, mid-level categories.
  async generateTags(
    content: string,
    type: string,
    onOutcome?: OutcomeCallback
  ): Promise<string[]> {
    const meta = { provider: "ollama" as const, model: this.model };
    // Truncate very long content to avoid slow generation.
    // Tags should be based on the overall topic, not every detail.
    const truncated = content.length > 1000
      ? content.slice(0, 1000) + "..."
      : content;

    const prompt = `You are a tagging assistant for a personal knowledge base. Given the following ${type} content, suggest 3-5 relevant tags. Tags should be:
- Lowercase, single words or short phrases (2-3 words max)
- Useful for categorization and later retrieval
- Neither too broad ("interesting") nor too specific ("page-47-footnote")

Content:
${truncated}

Return ONLY a JSON object with a "tags" key containing an array of tag strings. Example: {"tags": ["recipes", "italian cuisine", "pasta"]}`;

    // Ollama reports token counts on the response; 0 when absent.
    let usage: { inputTokens: number; outputTokens: number } | undefined;
    try {
      const response = await fetch(`${this.baseUrl}/api/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: this.model,
          prompt,
          // Constrain output to valid JSON
          format: "json",
          // stream: false means wait for the full response instead of
          // getting it token-by-token. Simpler for our use case.
          stream: false,
          // Lower temperature = more deterministic/focused output.
          // For tag generation we want consistency, not creativity.
          options: {
            temperature: 0.3,
          },
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new AiHttpError("ollama", response.status, `Ollama LLM failed: ${error}`);
      }

      const data = await response.json();
      usage = {
        inputTokens: data.prompt_eval_count ?? 0,
        outputTokens: data.eval_count ?? 0,
      };

      // data.response is the generated text (a JSON string). A parse
      // failure below still keeps `usage`, so it logs as invalid_response.
      const parsed = JSON.parse(data.response);

      // Validate the response shape and sanitize tags
      if (!parsed.tags || !Array.isArray(parsed.tags)) {
        throw new AiInvalidResponseError('Ollama tagging reply had no "tags" array');
      }

      // Normalize: lowercase, trim, remove empty strings, limit to 5
      const tags = parsed.tags
        .map((tag: unknown) => (typeof tag === "string" ? tag.trim().toLowerCase() : ""))
        .filter((tag: string) => tag.length > 0)
        .slice(0, 5);
      reportOutcome(onOutcome, { ...meta, status: "ok", usage });
      return tags;
    } catch (error) {
      // Don't let AI failures break record creation.
      // Log the error and return empty tags — the record still saves.
      logger.error("Ollama tag generation failed", { feature: "tagging", error });
      reportOutcome(onOutcome, { ...meta, status: "error", error, usage });
      return [];
    }
  }

  // ==========================================================================
  // CHAT METHODS (interface compliance)
  // ==========================================================================
  // The Ollama provider is used for tagging, not chat. These methods exist
  // to satisfy the LLMProvider interface. In our split setup, the factory
  // routes chat calls to the Claude provider instead.
  //
  // If someone wanted to use Ollama for chat (e.g., with a larger local
  // model like llama3.1:8b), they could flesh these out — the Ollama
  // /api/chat endpoint supports multi-turn conversations and streaming.

  async chat(): Promise<string> {
    throw new Error(
      "OllamaLLMProvider.chat() is not implemented. Use the Claude provider for chat."
    );
  }

  async *chatStream(): AsyncGenerator<string, void, unknown> {
    throw new Error(
      "OllamaLLMProvider.chatStream() is not implemented. Use the Claude provider for chat."
    );
  }
}
