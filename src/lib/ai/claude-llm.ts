// ============================================================================
// CLAUDE LLM PROVIDER
// ============================================================================
//
// Implements the LLMProvider interface using Anthropic's Claude API.
// Used for conversational chat (Phase 3) — the primary use case where
// we need a high-quality model that can synthesize across multiple
// retrieved records and have nuanced multi-turn conversations.
//
// Model: claude-sonnet-4-6 (default, configurable via CHAT_MODEL env var)
//   - Strong reasoning and synthesis
//   - Good at following citation/formatting instructions
//   - Fast enough for real-time chat
//   - Cost-effective for a personal tool (~$3/1M input tokens)
//
// This provider handles chat(), chatStream(), and generateTags().
// The factory uses Claude for all LLM tasks (tagging + chat).
//
// SDK: @anthropic-ai/sdk — Anthropic's official Node.js SDK
//   - Handles auth, retries, rate limiting, streaming
//   - TypeScript-first with full type definitions
// ============================================================================

import Anthropic from "@anthropic-ai/sdk";
import type { LLMProvider, ChatMessage, UsageCallback } from "./types";

export class ClaudeLLMProvider implements LLMProvider {
  private client: Anthropic;
  private model: string;

  constructor() {
    // The SDK reads ANTHROPIC_API_KEY from the environment automatically,
    // but we pass it explicitly for clarity. Throws if not set.
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error(
        "ANTHROPIC_API_KEY is not set. Add it to your .env file."
      );
    }

    this.client = new Anthropic({ apiKey });

    // CHAT_MODEL controls which Claude model to use.
    this.model = process.env.CHAT_MODEL || "claude-sonnet-4-6";
  }

  // ==========================================================================
  // GENERATE TAGS
  // ==========================================================================
  // Uses Claude to analyze content and suggest tags.
  // Haiku-class models are fast and cheap enough for this high-volume task.
  async generateTags(content: string, type: string): Promise<string[]> {
    const truncated =
      content.length > 1000 ? content.slice(0, 1000) + "..." : content;

    try {
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: 200,
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

      // The Anthropic SDK returns content as an array of "content blocks".
      // For text responses, there's typically one block with type "text".
      const textBlock = response.content.find((block) => block.type === "text");
      if (!textBlock || textBlock.type !== "text") return [];

      // Strip markdown code fences if Claude wraps the JSON (e.g. ```json\n{...}\n```)
      let rawText = textBlock.text.trim();
      rawText = rawText.replace(/^```(?:json)?\s*\n?/i, "").replace(/\n?\s*```$/, "");

      const parsed = JSON.parse(rawText);
      if (!parsed.tags || !Array.isArray(parsed.tags)) return [];

      return parsed.tags
        .map((tag: unknown) =>
          typeof tag === "string" ? tag.trim().toLowerCase() : ""
        )
        .filter((tag: string) => tag.length > 0)
        .slice(0, 5);
    } catch (error) {
      console.error("Claude tag generation failed:", error);
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
    onUsage?: UsageCallback
  ): Promise<string> {
    try {
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: 2048,
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

      // Report token usage if the caller wants it.
      // response.usage is always present on a successful Anthropic response.
      if (onUsage) {
        onUsage({
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens,
        });
      }

      const textBlock = response.content.find((block) => block.type === "text");
      return textBlock && textBlock.type === "text" ? textBlock.text : "";
    } catch (error) {
      console.error("Claude chat failed:", error);
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
    onUsage?: UsageCallback
  ): AsyncGenerator<string, void, unknown> {
    // client.messages.stream() returns a Stream object that emits events.
    // We use the .stream() method (not .create()) — it returns a helper
    // that handles SSE parsing and exposes a nice async iterator.
    const stream = this.client.messages.stream({
      model: this.model,
      max_tokens: 2048,
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
    for await (const event of stream) {
      if (
        event.type === "content_block_delta" &&
        event.delta.type === "text_delta"
      ) {
        yield event.delta.text;
      }
    }

    // After the stream completes, the SDK can reconstruct the full message
    // including token counts. finalMessage() is a lightweight call — no
    // extra API request, it just assembles the data from events we already
    // received during streaming.
    if (onUsage) {
      try {
        const finalMessage = await stream.finalMessage();
        onUsage({
          inputTokens: finalMessage.usage.input_tokens,
          outputTokens: finalMessage.usage.output_tokens,
        });
      } catch {
        // If we can't get usage from the stream, don't break the response.
        // The chat already completed successfully — usage is a bonus.
      }
    }
  }
}
