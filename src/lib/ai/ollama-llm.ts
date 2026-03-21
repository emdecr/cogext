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

import type { LLMProvider } from "./types";

export class OllamaLLMProvider implements LLMProvider {
  private baseUrl: string;
  private model: string;

  constructor() {
    this.baseUrl = process.env.AI_BASE_URL || "http://localhost:11434";
    this.model = process.env.LLM_MODEL || "llama3.2:1b";
  }

  // ---- Generate tags for a record ----
  // We craft a prompt that asks the model to return ONLY a JSON array
  // of tags. The `format: "json"` option tells Ollama to constrain
  // output to valid JSON (it uses grammar-based sampling internally).
  //
  // We limit to 5 tags to avoid noise. The model sometimes suggests
  // overly specific or generic tags — the prompt tries to guide it
  // toward useful, mid-level categories.
  async generateTags(content: string, type: string): Promise<string[]> {
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
        throw new Error(`Ollama LLM failed: ${error}`);
      }

      const data = await response.json();

      // data.response is the generated text (a JSON string)
      const parsed = JSON.parse(data.response);

      // Validate the response shape and sanitize tags
      if (!parsed.tags || !Array.isArray(parsed.tags)) {
        console.warn("Ollama returned unexpected format:", data.response);
        return [];
      }

      // Normalize: lowercase, trim, remove empty strings, limit to 5
      return parsed.tags
        .map((tag: unknown) => (typeof tag === "string" ? tag.trim().toLowerCase() : ""))
        .filter((tag: string) => tag.length > 0)
        .slice(0, 5);
    } catch (error) {
      // Don't let AI failures break record creation.
      // Log the error and return empty tags — the record still saves.
      console.error("AI tag generation failed:", error);
      return [];
    }
  }
}
