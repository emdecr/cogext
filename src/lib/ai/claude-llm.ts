// ============================================================================
// CLAUDE LLM PROVIDER
// ============================================================================
//
// Implements the LLMProvider interface using Anthropic's Claude API.
// Used for conversational chat (Phase 3) — the primary use case where
// we need a high-quality model that can synthesize across multiple
// retrieved records and have nuanced multi-turn conversations.
//
// Model: claude-sonnet-5-5 (default, configurable via CHAT_MODEL env var)
//   - Strong reasoning and synthesis
//   - Good at following citation/formatting instructions
//   - Fast enough for real-time chat
//   - Cost-effective for a personal tool ($2/1M input, $10/1M output)
//
// Thinking: Sonnet 5.5 runs adaptive thinking by default, and thinking
// tokens count toward max_tokens. Every call here sets effort "low" (the
// recommended level for chat, content generation, and classification) so
// the model skips thinking on simple requests, and max_tokens leaves room
// for thinking on top of the visible reply.
//
// This provider handles chat(), chatStream(), and generateTags().
// The factory builds two instances: one on TAGGING_MODEL (Haiku) for
// generateTags(), one on CHAT_MODEL (Sonnet) for chat. Same class, so any
// effort/max_tokens setting here must work on both models.
//
// SDK: @anthropic-ai/sdk — Anthropic's official Node.js SDK
//   - Handles auth, retries, rate limiting, streaming
//   - TypeScript-first with full type definitions
// ============================================================================

import Anthropic from "@anthropic-ai/sdk";
import type { LLMProvider, ChatMessage, OutcomeCallback } from "./types";
import { reportOutcome } from "./outcome";
import { AiInvalidResponseError } from "./errors";
import { logger } from "@/lib/logger";
import { modelFor } from "@/lib/ai/model-settings";

export class ClaudeLLMProvider implements LLMProvider {
  private client: Anthropic;
  private model: string;

  // `model` lets the factory pick a model per use: getLLMProvider() passes
  // TAGGING_MODEL (Haiku), getChatProvider() leaves it unset → CHAT_MODEL.
  constructor(model?: string) {
    // The SDK reads ANTHROPIC_API_KEY from the environment automatically,
    // but we pass it explicitly for clarity. Throws if not set.
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error(
        "ANTHROPIC_API_KEY is not set. Add it to your .env file."
      );
    }

    this.client = new Anthropic({ apiKey });

    // Defaults to CHAT_MODEL when the factory doesn't pass a model.
    this.model = model || modelFor("CHAT_MODEL");
  }

  // ==========================================================================
  // GENERATE TAGS
  // ==========================================================================
  // Uses Claude to analyze content and suggest tags.
  // Runs on TAGGING_MODEL (default claude-haiku-5-5, see getLLMProvider() in
  // ./index.ts) at low effort. Haiku 5.5 also thinks by default, so the
  // max_tokens headroom below applies to it too.
  async generateTags(
    content: string,
    type: string,
    onOutcome?: OutcomeCallback
  ): Promise<string[]> {
    const truncated =
      content.length > 1000 ? content.slice(0, 1000) + "..." : content;
    const meta = { provider: "claude" as const, model: this.model };

    // 1. The API call. A throw here means nothing usable came back.
    let response: Anthropic.Message;
    try {
      response = await this.client.messages.create({
        model: this.model,
        // The tag JSON itself is ~50 tokens; the rest is headroom for
        // adaptive thinking, which counts toward max_tokens.
        max_tokens: 1024,
        output_config: { effort: "low" },
        // System prompt goes in the top-level `system` field in the
        // Anthropic API — NOT as a message with role "system".
        system:
          "You are a tagging assistant. Return ONLY a raw JSON object with a " +
          '"tags" key containing an array of 3-5 tag strings. Tags should be ' +
          "lowercase, 1-3 words, useful for categorization. " +
          "Do NOT wrap the JSON in markdown code fences or any other formatting.",
        messages: [
          {
            role: "user",
            content: `Suggest tags for this ${type}:\n\n${truncated}`,
          },
        ],
      });
    } catch (error) {
      logger.error("Claude tag generation failed", { feature: "tagging", error });
      reportOutcome(onOutcome, { ...meta, status: "error", error });
      return [];
    }

    const usage = {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    };

    if (response.stop_reason === "refusal") {
      logger.warn("Claude declined tag generation", {
        feature: "tagging",
        stopDetails: response.stop_details,
      });
      reportOutcome(onOutcome, { ...meta, status: "refusal", usage });
      return [];
    }

    // 2. Parse the reply. A failure here was still billed: report it as an
    //    invalid_response error that keeps the usage.
    try {
      // The Anthropic SDK returns content as an array of "content blocks".
      // A response can start with a (possibly empty) thinking block, so
      // find the text block by type rather than by position.
      const textBlock = response.content.find((block) => block.type === "text");
      if (!textBlock || textBlock.type !== "text") {
        throw new AiInvalidResponseError("Tagging reply had no text block");
      }

      // Strip markdown code fences if Claude wraps the JSON (e.g. ```json\n{...}\n```)
      let rawText = textBlock.text.trim();
      rawText = rawText.replace(/^```(?:json)?\s*\n?/i, "").replace(/\n?\s*```$/, "");

      const parsed = JSON.parse(rawText);
      if (!parsed.tags || !Array.isArray(parsed.tags)) {
        throw new AiInvalidResponseError('Tagging reply had no "tags" array');
      }

      const tags = parsed.tags
        .map((tag: unknown) =>
          typeof tag === "string" ? tag.trim().toLowerCase() : ""
        )
        .filter((tag: string) => tag.length > 0)
        .slice(0, 5);

      reportOutcome(onOutcome, { ...meta, status: "ok", usage });
      return tags;
    } catch (error) {
      logger.warn("Claude tag reply unusable", { feature: "tagging", error });
      reportOutcome(onOutcome, { ...meta, status: "error", error, usage });
      return [];
    }
  }

  // ==========================================================================
  // CHAT (non-streaming)
  // ==========================================================================
  // Sends the full conversation history to Claude and waits for the complete
  // response. Used for background tasks (like AI profile generation) where
  // we don't need real-time streaming.
  //
  // The `context` parameter becomes the system prompt. This is where the
  // RAG pipeline injects retrieved records and the user's AI profile.
  // Keeping it separate from messages means:
  //   1. The conversation history stays clean (just user/assistant turns)
  //   2. The caller decides what context to inject — the provider doesn't
  //      need to know about records, profiles, or search results.
  async chat(
    messages: ChatMessage[],
    context?: string,
    onOutcome?: OutcomeCallback
  ): Promise<string> {
    const meta = { provider: "claude" as const, model: this.model };
    try {
      const response = await this.client.messages.create({
        model: this.model,
        // Room for thinking plus a long reply (reflections run to a few
        // thousand tokens). Non-streaming, so stay at ~16K to avoid SDK
        // HTTP timeouts.
        max_tokens: 16000,
        output_config: { effort: "low" },
        // If no context is provided, use a sensible default.
        // The caller (RAG pipeline) will almost always provide context.
        system:
          context ||
          "You are a helpful assistant for a personal knowledge base.",
        // Map our generic ChatMessage format to Anthropic's format.
        // They happen to be the same shape (role + content), but mapping
        // explicitly keeps us decoupled from the SDK's types.
        messages: messages.map((msg) => ({
          role: msg.role,
          content: msg.content,
        })),
      });

      // response.usage is always present on a successful Anthropic response.
      const usage = {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      };

      if (response.stop_reason === "refusal") {
        logger.warn("Claude declined chat request", {
          stopDetails: response.stop_details,
        });
        reportOutcome(onOutcome, { ...meta, status: "refusal", usage });
      } else {
        reportOutcome(onOutcome, { ...meta, status: "ok", usage });
      }

      const textBlock = response.content.find((block) => block.type === "text");
      return textBlock && textBlock.type === "text" ? textBlock.text : "";
    } catch (error) {
      logger.error("Claude chat failed", { error });
      reportOutcome(onOutcome, { ...meta, status: "error", error });
      throw error; // Re-throw for chat — the caller needs to handle this
      // (unlike tags, where we silently return [] and move on)
    }
  }

  // ==========================================================================
  // CHAT STREAM
  // ==========================================================================
  // Returns an AsyncGenerator that yields text chunks as Claude generates them.
  //
  // AsyncGenerator is the simplest streaming primitive in JavaScript.
  // The caller consumes it with a for-await loop:
  //
  //   const stream = provider.chatStream(messages, context);
  //   for await (const chunk of stream) {
  //     // chunk is a small piece of text, e.g. "The" or " recipe" or " for"
  //     appendToUI(chunk);
  //   }
  //   // Loop ends when Claude is done generating
  //
  // Under the hood, the Anthropic SDK gives us a stream of Server-Sent Events
  // (SSE). We listen for "content_block_delta" events, which contain the
  // incremental text. We yield each delta's text, and the caller gets it
  // immediately without buffering.
  //
  // Why AsyncGenerator over ReadableStream?
  //   - AsyncGenerator: native JS, works with for-await, no adapter needed
  //   - ReadableStream: browser API, needs .getReader() + manual loop
  //   - For server-to-component streaming, we'll convert to ReadableStream
  //     at the API route level — but the provider stays simple.
  async *chatStream(
    messages: ChatMessage[],
    context?: string,
    onOutcome?: OutcomeCallback
  ): AsyncGenerator<string, void, unknown> {
    const meta = { provider: "claude" as const, model: this.model };
    // client.messages.stream() returns a Stream object that emits events.
    // We use the .stream() method (not .create()) — it returns a helper
    // that handles SSE parsing and exposes a nice async iterator.
    const stream = this.client.messages.stream({
      model: this.model,
      max_tokens: 16000,
      output_config: { effort: "low" },
      system:
        context ||
        "You are a helpful assistant for a personal knowledge base.",
      messages: messages.map((msg) => ({
        role: msg.role,
        content: msg.content,
      })),
    });

    // The SDK's stream exposes an async iterator of events.
    // We filter for text delta events and yield just the text content.
    //
    // Event types we might see:
    //   - message_start: metadata about the response
    //   - content_block_start: a new content block begins
    //   - content_block_delta: incremental text (this is what we want)
    //   - content_block_stop: block is complete
    //   - message_stop: response is complete
    //
    // The `on("text")` helper simplifies this — it fires only for text deltas.
    // But we use the raw events for more control and to make the flow visible.
    try {
      for await (const event of stream) {
        if (
          event.type === "content_block_delta" &&
          event.delta.type === "text_delta"
        ) {
          yield event.delta.text;
        }
      }
    } catch (error) {
      // The request failed or the stream broke mid-response. Report it, then
      // rethrow so the route can end the HTTP stream with an error.
      reportOutcome(onOutcome, { ...meta, status: "error", error });
      throw error;
    }

    // After the stream completes, the SDK can reconstruct the full message
    // including token counts. finalMessage() is a lightweight call — no
    // extra API request, it just assembles the data from events we already
    // received during streaming.
    if (onOutcome) {
      try {
        const finalMessage = await stream.finalMessage();
        const usage = {
          inputTokens: finalMessage.usage.input_tokens,
          outputTokens: finalMessage.usage.output_tokens,
        };
        reportOutcome(onOutcome, {
          ...meta,
          status: finalMessage.stop_reason === "refusal" ? "refusal" : "ok",
          usage,
        });
      } catch {
        // If we can't get usage from the stream, don't break the response.
        // The chat already completed successfully — usage is a bonus.
      }
    }
  }
}
