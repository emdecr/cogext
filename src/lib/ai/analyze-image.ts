// ============================================================================
// IMAGE ANALYSIS SERVICE
// ============================================================================
//
// Uses Claude's vision API to generate a rich text description of an uploaded
// image. That description gets stored as the record's `content` field, which
// then flows into:
//   1. Semantic search  (via the embedding pipeline)
//   2. Auto-tagging     (via the LLM tagging pipeline)
//   3. Keyword search   (PostgreSQL full-text search on the content column)
//   4. Chat/RAG context (the description is included in the retrieved record)
//
// Without this, image records have "Image" as their content — a useless
// signal. With it, searching "photo of a red bicycle near a river" will
// actually find a matching image.
//
// The flow:
//   1. Receive the imagePath stored in the database (e.g. "/uploads/abc.jpg"
//      or "https://files.yourdomain.com/cogext-uploads/abc.jpg")
//   2. Read the image bytes (from local filesystem or remote URL)
//   3. Encode as base64 — the format Claude's vision API expects
//   4. Detect the MIME type from the path extension
//   5. Call Claude with a structured content block containing the image
//   6. Return the description text
//
// Fallback behavior:
//   - If ANTHROPIC_API_KEY is not set → return null (caller keeps existing content)
//   - If the image can't be read (file missing, network error) → return null
//   - If Claude's API call fails → return null
//   - Null always means "use whatever content already exists" — never crash
//
// Why Claude Vision and not a local model?
//   The Ollama models in use (nomic-embed-text, llama3.2:1b) are text-only.
//   Vision requires multimodal models (LLaVA, Llama 3.2 Vision), which are
//   larger and need more RAM. Since we already pay for the Anthropic API for
//   chat, using it here is zero additional infrastructure cost.
// ============================================================================

import Anthropic from "@anthropic-ai/sdk";
import { logAiUsage } from "@/lib/ai/usage";

// ============================================================================
// SUPPORTED IMAGE TYPES
// ============================================================================
// Claude's vision API accepts these MIME types. We derive the MIME type from
// the file extension so we don't have to re-read the file header.
// These match the ALLOWED_TYPES in src/lib/storage/index.ts.
//
// The Anthropic SDK's ImageBlockParam.source is a union of Base64ImageSource
// and URLImageSource. The media_type field only exists on Base64ImageSource,
// so we reference it directly rather than going through the union.
type ImageMediaType = "image/jpeg" | "image/png" | "image/gif" | "image/webp";

const EXTENSION_TO_MIME: Record<string, ImageMediaType> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
};

// ============================================================================
// READ IMAGE AS BASE64
// ============================================================================
// Handles two cases:
//   - Local storage: path like "/uploads/abc.jpg" → read from filesystem
//   - MinIO/remote:  URL like "https://files.example.com/abc.jpg" → fetch it
//
// Returns the raw bytes as a Node.js Buffer, or null on failure.

async function readImageAsBuffer(imagePath: string): Promise<Buffer | null> {
  try {
    if (imagePath.startsWith("http://") || imagePath.startsWith("https://")) {
      // Remote image (MinIO or any CDN URL) — fetch it over HTTP.
      // We use the global fetch API available in Node.js 18+.
      const response = await fetch(imagePath);
      if (!response.ok) {
        console.warn(`[analyze-image] Failed to fetch remote image: ${response.status} ${imagePath}`);
        return null;
      }
      // response.arrayBuffer() downloads the full image body.
      // Buffer.from() converts the Web API ArrayBuffer to a Node.js Buffer.
      return Buffer.from(await response.arrayBuffer());
    } else {
      // Local image — path like "/uploads/abc.jpg" relative to the Next.js
      // public directory. The actual filesystem path is:
      //   <project_root>/public/uploads/abc.jpg
      //
      // process.cwd() is the project root when running Next.js.
      // In Docker (standalone mode), it's /app.
      const { readFile } = await import("fs/promises");
      const { join } = await import("path");
      const absolutePath = join(process.cwd(), "public", imagePath);
      return await readFile(absolutePath);
    }
  } catch (error) {
    console.warn(`[analyze-image] Could not read image at ${imagePath}:`, error);
    return null;
  }
}

// ============================================================================
// DETECT MIME TYPE
// ============================================================================
// Extract the MIME type from the file extension in the path.
// We use path-based detection rather than re-reading the magic bytes because:
//   a) We already validated the file on upload
//   b) The MIME type only needs to be correct for Claude's API call
//   c) This avoids reading the file twice (we already read it for base64)

function getMimeType(imagePath: string): ImageMediaType | null {
  // Extract the extension from either a URL or a local path.
  // URL: "https://example.com/abc.jpg" → ".jpg"
  // Local: "/uploads/abc.jpg" → ".jpg"
  const lastSegment = imagePath.split("/").pop() || "";
  const dotIndex = lastSegment.lastIndexOf(".");
  if (dotIndex === -1) return null;

  const ext = lastSegment.slice(dotIndex).toLowerCase();
  return EXTENSION_TO_MIME[ext] || null;
}

// ============================================================================
// ANALYZE IMAGE — MAIN EXPORT
// ============================================================================
//
// Takes the imagePath stored in the database and returns an AI-generated
// description of the image, or null if analysis couldn't run.
//
// The caller (createRecord in records.ts) should:
//   - Use the description as the record's content if non-null
//   - Keep the existing content (user description or "Image") if null
//
// Usage:
//   const description = await analyzeImage("/uploads/abc.jpg", userId);
//   if (description) {
//     await db.update(records).set({ content: description }).where(...)
//   }
//
// The optional userId parameter enables token usage logging. When provided,
// the function logs input/output tokens to the ai_usage table. Without it
// (e.g., in tests), logging is silently skipped.

export async function analyzeImage(
  imagePath: string,
  userId?: string
): Promise<string | null> {
  // ---- Guard: skip if no API key ----
  // If ANTHROPIC_API_KEY isn't set (e.g., development without an account),
  // analysis silently skips. Images still save and work — they just won't
  // be as searchable.
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.warn("[analyze-image] ANTHROPIC_API_KEY not set, skipping analysis");
    return null;
  }

  // ---- Read the image ----
  const buffer = await readImageAsBuffer(imagePath);
  if (!buffer) return null;

  // ---- Get MIME type ----
  const mimeType = getMimeType(imagePath);
  if (!mimeType) {
    console.warn(`[analyze-image] Unrecognized file extension: ${imagePath}`);
    return null;
  }

  // ---- Convert to base64 ----
  // Claude's vision API requires images as base64-encoded strings inside a
  // structured content block. This is different from a URL — the image bytes
  // are embedded directly in the API request payload.
  //
  // Base64 encoding inflates size by ~33% (3 bytes → 4 chars), so a 1MB
  // image becomes ~1.3MB in the request. Claude's limit is 20MB, so our
  // 5MB upload cap gives us plenty of headroom.
  const base64Data = buffer.toString("base64");

  try {
    const client = new Anthropic({ apiKey });

    // ---- Call Claude Vision ----
    //
    // The Anthropic messages API supports "multimodal" content blocks —
    // an array where each block is either text or an image. We combine:
    //   1. An image block containing the base64-encoded image
    //   2. A text block with our prompt
    //
    // Claude reads them together: "here's an image, now answer this question."
    //
    // Why claude-haiku-4-5-20251001 and not claude-sonnet-4-6?
    //   Image description is a structured, well-defined task. Haiku is fast
    //   and cheap — no need for Sonnet's reasoning power here. This also
    //   keeps image analysis costs low (Haiku is ~10x cheaper than Sonnet).
    const model = process.env.IMAGE_ANALYSIS_MODEL || "claude-haiku-4-5-20251001";
    const response = await client.messages.create({
      model,
      max_tokens: 500, // Description shouldn't need more than ~300 tokens

      messages: [
        {
          role: "user",
          content: [
            // Block 1: The image itself
            {
              type: "image",
              source: {
                type: "base64",
                media_type: mimeType,
                data: base64Data,
              },
            },
            // Block 2: The instruction
            {
              type: "text",
              text:
                "Describe this image in detail for use in a personal knowledge base search index. " +
                "Include: main subjects, objects, colors, scene or setting, any visible text, " +
                "mood or atmosphere, and any other notable details. " +
                "Write as a clear, factual description. Do not start with 'This image shows' — " +
                "just describe directly. Do not include any markdown headers or titles. " +
                "Be thorough but concise (2-4 sentences).",
            },
          ],
        },
      ],
    });

    // Log token usage if we have a userId for attribution.
    if (userId) {
      logAiUsage({
        userId,
        feature: "image_analysis",
        provider: "claude",
        model,
        usage: {
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens,
        },
      });
    }

    // ---- Extract the text description ----
    // Claude's response content is an array of blocks. For a description
    // task it will always be a single text block, but we find it explicitly
    // rather than assuming index 0.
    const textBlock = response.content.find((block) => block.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      console.warn("[analyze-image] Claude returned no text block");
      return null;
    }

    const description = textBlock.text.trim();
    if (!description) return null;

    return description;
  } catch (error) {
    // Analysis failure is not fatal. The record still exists and saves
    // correctly — it just won't have AI-generated searchable content.
    // We log the error for debugging but swallow it so the caller doesn't
    // need to handle it.
    console.error("[analyze-image] Claude Vision API call failed:", error);
    return null;
  }
}
