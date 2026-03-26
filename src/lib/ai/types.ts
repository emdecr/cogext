// ============================================================================
// AI PROVIDER INTERFACES
// ============================================================================
//
// These interfaces define the CONTRACT that any AI provider must follow.
// The rest of the app only imports these interfaces — it never imports
// a specific provider directly. This is the "abstraction" that lets us
// swap providers without changing app code.
//
// Think of it like a power outlet: your lamp doesn't care if the
// electricity comes from solar, wind, or coal. It just needs 120V AC
// from a standard outlet. The interface IS the outlet shape.
//
// To swap providers, you change ONE file (the factory in ./index.ts)
// and everything else keeps working.
// ============================================================================

// ============================================================================
// EMBEDDING PROVIDER
// ============================================================================
// Converts text into a vector (array of numbers) that captures its meaning.
// Two texts with similar meanings produce vectors that are close together
// in vector space — this is how semantic search works.
//
// Example:
//   embed("delicious pasta recipe") → [0.12, -0.34, 0.56, ...]
//   embed("how to cook spaghetti")  → [0.11, -0.33, 0.55, ...]  ← very similar!
//   embed("quantum physics theory") → [-0.78, 0.23, -0.91, ...]  ← very different

export interface EmbeddingProvider {
  // Convert a single text into a vector
  embed(text: string): Promise<number[]>;

  // Convert multiple texts at once (more efficient than calling embed()
  // in a loop — providers can batch the work internally)
  embedBatch(texts: string[]): Promise<number[][]>;

  // The size of vectors this provider produces. Must match the database
  // column size. nomic-embed-text = 768, OpenAI small = 1536.
  // Changing providers with different dimensions requires re-embedding
  // all existing records.
  dimensions: number;
}

// ============================================================================
// CHAT MESSAGE
// ============================================================================
// Represents a single message in a conversation thread.
// This mirrors the shape used by most LLM APIs (OpenAI, Anthropic, Ollama)
// so any provider can map to its native format easily.
//
// Note: "system" messages are NOT part of this type. System prompts
// (RAG context, user profile, instructions) are passed separately via
// the `context` parameter on chat methods. This keeps the conversation
// history clean and gives us explicit control over what context is injected.

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

// ============================================================================
// USAGE CALLBACK
// ============================================================================
// Optional callback that providers call after an API response completes.
// Callers pass this in to capture token counts without changing the return
// type of chat/chatStream. If not provided, usage data is simply ignored.
//
// For streaming: the callback fires after the stream finishes (when the
// final message event arrives with the full usage tally).

export type UsageCallback = (usage: {
  inputTokens: number;
  outputTokens: number;
}) => void;

// ============================================================================
// LLM PROVIDER
// ============================================================================
// A language model that can analyze content and generate structured output.
// Split into two concerns:
//   1. generateTags — structured output (JSON), used for auto-tagging
//   2. chat / chatStream — conversational, used for the AI sidebar
//
// We keep this interface narrow on purpose — each method does ONE thing.
// Adding new capabilities means adding new methods, not changing existing ones.

export interface LLMProvider {
  // Analyze a record's content and suggest relevant tags.
  // Returns an array of tag name strings (e.g., ["recipes", "italian", "pasta"]).
  // The `type` parameter helps the LLM understand context
  // (a "quote" gets different tags than a "link").
  generateTags(content: string, type: string): Promise<string[]>;

  // --------------------------------------------------------------------------
  // CHAT METHODS (Phase 3)
  // --------------------------------------------------------------------------
  // Both methods take the same inputs:
  //   - messages: the conversation history (user/assistant turns)
  //   - context:  optional system prompt — this is where we inject RAG results,
  //               the user's AI profile, and instructions. Kept separate from
  //               messages so the caller controls what context the LLM sees.
  //
  // Why two methods instead of a "streaming" flag?
  //   - Different return types (string vs AsyncGenerator) make the caller's
  //     code cleaner — you know at the call site whether you're getting
  //     a full response or a stream, no type-narrowing needed.
  // --------------------------------------------------------------------------

  // Get a complete response (waits for the full answer).
  // Good for background tasks like profile generation where streaming
  // doesn't help.
  // The optional onUsage callback fires once with the token counts after
  // the response is received. Pass it to capture usage for logging.
  chat(
    messages: ChatMessage[],
    context?: string,
    onUsage?: UsageCallback
  ): Promise<string>;

  // Get a streaming response, yielding text chunks as they arrive.
  // AsyncGenerator is the simplest streaming primitive in JS:
  //   for await (const chunk of provider.chatStream(messages)) {
  //     process.stdout.write(chunk);  // each chunk is a few tokens
  //   }
  // No ReadableStream, no event emitters, no callbacks — just a for loop.
  // The optional onUsage callback fires once after the stream completes.
  chatStream(
    messages: ChatMessage[],
    context?: string,
    onUsage?: UsageCallback
  ): AsyncGenerator<string, void, unknown>;
}
