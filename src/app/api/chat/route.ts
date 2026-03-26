// ============================================================================
// CHAT API ROUTE — RAG PIPELINE
// ============================================================================
//
// POST /api/chat
//
// This is the heart of Phase 3: the Retrieval-Augmented Generation (RAG)
// pipeline. It connects the user's question to their saved records via AI.
//
// RAG in plain English:
//   Instead of asking the AI to answer from its own knowledge, we first
//   SEARCH the user's records for relevant content, then GIVE that content
//   to the AI as context, and ask it to answer BASED ON that content.
//   This means the AI's answers are grounded in the user's actual data.
//
// The full flow:
//   1. User sends a message from the chat sidebar
//   2. We authenticate the request and load the conversation
//   3. RETRIEVE: embed the question → semantic search for relevant records
//   4. LOAD: fetch the user's AI profile (interests, patterns)
//   5. AUGMENT: build a system prompt with profile + retrieved records
//   6. GENERATE: send conversation history + context to Claude
//   7. STREAM: pipe Claude's response back to the client chunk by chunk
//
// Why an API route instead of a server action?
//   Server actions return a single value when done. They can't stream.
//   We need to send chunks of text as Claude generates them, which requires
//   a real HTTP response stream. API routes give us that control.
//
// The response is a ReadableStream of plain text — no JSON, no SSE framing,
// just raw text chunks. The client reads them with response.body.getReader().
// ============================================================================

import { NextRequest } from "next/server";
import { eq, and, sql, isNotNull, desc } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { records, conversations, messages, recordTags, tags } from "@/db/schema";
import { getSession } from "@/lib/auth/session";
import { getEmbeddingProvider, getChatProvider } from "@/lib/ai";
import type { ChatMessage } from "@/lib/ai/types";
import { getProfile, type UserProfile } from "@/lib/ai/profile";
import { chatLimiter, rateLimitResponse } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { logAiUsage } from "@/lib/ai/usage";

// ============================================================================
// INPUT VALIDATION
// ============================================================================
//
// Validate the chat request body with Zod. This ensures:
//   - conversationId is a valid UUID (not an arbitrary string that could
//     cause unexpected behavior in SQL queries)
//   - message is non-empty and bounded (10,000 chars prevents someone from
//     sending a novel-length message that blows up embedding + token costs)
//
// Without this, a malicious client could send:
//   { conversationId: "not-a-uuid", message: "" }
//   { conversationId: "'; DROP TABLE--", message: "x".repeat(1000000) }
const chatRequestSchema = z.object({
  conversationId: z.string().uuid("Invalid conversation ID"),
  message: z.string().trim().min(1, "Message is required").max(10000, "Message too long"),
});

// ============================================================================
// CONFIGURATION
// ============================================================================

// How many records to retrieve for context. More = more context for the AI
// but also more tokens (cost) and potential for confusion. 5-8 is the sweet
// spot for a personal knowledge base.
const TOP_K_RECORDS = 6;

// Maximum characters of content to include per record in the context.
// Long articles would blow up the context window if included in full.
// 800 chars is roughly 200 tokens — enough to capture the key idea.
const MAX_CONTENT_LENGTH = 800;

// Maximum conversation history messages to include.
// Including the full history of a 100-message conversation would be
// wasteful. The most recent messages give the AI enough conversational
// context. Older context is captured in the AI's own earlier responses.
const MAX_HISTORY_MESSAGES = 20;

// ============================================================================
// POST HANDLER
// ============================================================================

export async function POST(request: NextRequest) {
  // ---- Step 1: Auth check ----
  const session = await getSession();
  if (!session) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const userId = session.userId;

  // ---- Rate limit by user ID ----
  // Rate limit AFTER auth so we use user ID (more accurate than IP).
  // 30 messages/hour is generous for real usage; prevents runaway costs
  // if the account is compromised or someone is scripting requests.
  const rl = chatLimiter(userId);
  if (!rl.success) return rateLimitResponse(rl);

  // ---- Step 2: Parse and validate the request body ----
  // Using Zod for structured validation instead of manual if-checks.
  // This catches malformed UUIDs, empty messages, and oversized payloads
  // in one clean step. See chatRequestSchema above for the rules.
  let conversationId: string;
  let message: string;

  try {
    const body = await request.json();
    const parsed = chatRequestSchema.safeParse(body);

    if (!parsed.success) {
      const firstError = parsed.error.issues[0]?.message || "Invalid input";
      return new Response(JSON.stringify({ error: firstError }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    conversationId = parsed.data.conversationId;
    message = parsed.data.message;
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // ---- Step 3: Verify conversation ownership ----
  const conversation = await db.query.conversations.findFirst({
    where: and(
      eq(conversations.id, conversationId),
      eq(conversations.userId, userId)
    ),
  });

  if (!conversation) {
    return new Response(
      JSON.stringify({ error: "Conversation not found" }),
      { status: 404, headers: { "Content-Type": "application/json" } }
    );
  }

  // ---- Step 4: Load conversation history, relevant records, and profile ----
  // Three independent data fetches — run them all in parallel.
  // Each takes ~50-200ms, so parallel = ~200ms vs sequential = ~600ms.
  const [recentMessages, relevantRecords, userProfile] = await Promise.all([
    // Conversation history: recent messages for conversational context.
    // Without this, every message would be treated independently — the AI
    // wouldn't know what "it" refers to in "tell me more about it."
    db
      .select({
        role: messages.role,
        content: messages.content,
      })
      .from(messages)
      .where(eq(messages.conversationId, conversationId))
      .orderBy(desc(messages.createdAt))
      .limit(MAX_HISTORY_MESSAGES),

    // RETRIEVE: embed the question → semantic search for relevant records.
    // This is the "R" in RAG.
    retrieveRelevantRecords(
      userId,
      message,
      conversation.scope,
      conversation.scopeValue
    ),

    // User profile: the AI's pre-built understanding of who this user is.
    // Loaded in parallel — if no profile exists yet, returns null and
    // the system prompt just won't include it. No blocking.
    getProfile(userId),
  ]);

  // Reverse because we fetched DESC (newest first) but need chronological
  // order for the AI to follow the conversation naturally.
  const history: ChatMessage[] = recentMessages.reverse().map((msg) => ({
    role: msg.role,
    content: msg.content,
  }));

  // Add the current user message to the history
  history.push({ role: "user", content: message });

  // ---- Step 5: AUGMENT — build the system prompt with context ----
  // This is the "A" in RAG. We combine three layers of context:
  //   1. Base instructions (what the AI is, how to behave)
  //   2. User profile (who they are, what they care about)
  //   3. Retrieved records (specific content relevant to this question)
  //
  // The profile gives the AI the "forest" (broad understanding),
  // while retrieved records give it the "trees" (specific details).
  const systemPrompt = buildSystemPrompt(relevantRecords, userProfile);

  // ---- Step 6: GENERATE + STREAM — call Claude and pipe the response ----
  // This is the "G" in RAG. We send everything to Claude and stream
  // the response back to the client.
  try {
    const chatProvider = await getChatProvider();

    // Convert the AsyncGenerator from chatStream() into a ReadableStream
    // that the HTTP response can send to the browser.
    //
    // Why the conversion? The provider returns an AsyncGenerator (simplest
    // streaming primitive), but HTTP responses need a ReadableStream
    // (browser API). This bridge is where the two meet.
    const chatModel = process.env.CHAT_MODEL || "claude-sonnet-4-6";

    const stream = new ReadableStream({
      async start(controller) {
        try {
          const encoder = new TextEncoder();

          // Consume the AsyncGenerator chunk by chunk.
          // Each chunk is a few tokens of text from Claude.
          // We encode it to bytes and enqueue it into the stream.
          for await (const chunk of chatProvider.chatStream(
            history,
            systemPrompt,
            // Token usage callback — fires once after the stream completes.
            // We don't await the log because the HTTP response is already
            // sent; this is fire-and-forget cleanup.
            (usage) => {
              logAiUsage({
                userId,
                feature: "chat",
                provider: "claude",
                model: chatModel,
                usage,
                conversationId,
              });
            }
          )) {
            controller.enqueue(encoder.encode(chunk));
          }

          // Signal that we're done streaming
          controller.close();
        } catch (error) {
          logger.error("Chat stream interrupted", { userId, conversationId, error });
          controller.error(error);
        }
      },
    });

    // Return the stream as the response body.
    // Content-Type is text/plain because we're sending raw text, not JSON.
    // The client reads this with response.body.getReader().
    return new Response(stream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        // Disable response buffering. Without this, some proxies (nginx,
        // Cloudflare) might buffer the entire response before sending it,
        // defeating the purpose of streaming.
        "Cache-Control": "no-cache",
        "Transfer-Encoding": "chunked",
      },
    });
  } catch (error) {
    logger.error("Chat API failed", { userId, conversationId, error });
    return new Response(
      JSON.stringify({ error: "Failed to generate response" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}

// ============================================================================
// RETRIEVE RELEVANT RECORDS
// ============================================================================
// Embeds the user's question and finds the most semantically similar records.
// Optionally scoped to a specific collection, tag, or date range.
//
// This is similar to the semantic search in search.ts, but:
//   1. Returns full record data (not just IDs + scores)
//   2. Supports conversation scoping (collection/tag/date_range)
//   3. Includes tags for each record (useful for the system prompt)

async function retrieveRelevantRecords(
  userId: string,
  query: string,
  scope: string,
  scopeValue: string | null
): Promise<RetrievedRecord[]> {
  try {
    // Step 1: Embed the user's question
    const embeddingProvider = await getEmbeddingProvider();
    const queryEmbedding = await embeddingProvider.embed(query);
    const embeddingStr = `[${queryEmbedding.join(",")}]`;

    // Step 2: Build the WHERE clause based on scope
    // Start with the base conditions (ownership + has embedding)
    const conditions = [
      eq(records.userId, userId),
      isNotNull(records.embedding),
    ];

    // Add scope-specific filtering
    // These narrow the search to only the records the user cares about
    // in this conversation.
    if (scope === "tag" && scopeValue) {
      // Scope to records with a specific tag.
      // This requires joining through the record_tags table.
      // We use a subquery: "records whose ID is in the set of record_ids
      // that have this tag."
      conditions.push(
        sql`${records.id} IN (
          SELECT rt.record_id FROM record_tags rt
          JOIN tags t ON rt.tag_id = t.id
          WHERE t.name = ${scopeValue}
        )`
      );
    } else if (scope === "collection" && scopeValue) {
      // Scope to records in a specific collection.
      conditions.push(
        sql`${records.id} IN (
          SELECT cr.record_id FROM collection_records cr
          WHERE cr.collection_id = ${scopeValue}
        )`
      );
    } else if (scope === "date_range" && scopeValue) {
      // Scope to records within a date range.
      // Expected format: "2026-01-01,2026-03-01"
      //
      // SECURITY: We validate that both parts are valid ISO date strings
      // before interpolating into SQL. Without this, a crafted scopeValue
      // like "2026-01-01,2026-01-01'); DROP TABLE records;--" could be
      // dangerous if Drizzle's parameterization ever had a gap.
      // Defense in depth: validate even when the ORM parameterizes.
      const [start, end] = scopeValue.split(",");
      const isoDatePattern = /^\d{4}-\d{2}-\d{2}$/;

      if (
        start && end &&
        isoDatePattern.test(start) && isoDatePattern.test(end) &&
        !isNaN(Date.parse(start)) && !isNaN(Date.parse(end))
      ) {
        conditions.push(
          sql`${records.createdAt} >= ${start}::timestamptz`,
          sql`${records.createdAt} <= ${end}::timestamptz`
        );
      }
      // If the format is invalid, we silently skip the date filter rather
      // than erroring. The user still gets results — just unscoped.
      // This is a graceful degradation: bad input ≠ crash.
    }
    // scope === "all" → no additional filtering

    // Step 3: Run the cosine similarity search
    const results = await db
      .select({
        id: records.id,
        type: records.type,
        title: records.title,
        content: records.content,
        sourceAuthor: records.sourceAuthor,
        sourceUrl: records.sourceUrl,
        note: records.note,
        createdAt: records.createdAt,
        score: sql<number>`1 - (${records.embedding} <=> ${embeddingStr}::vector)`,
      })
      .from(records)
      .where(and(...conditions))
      .orderBy(sql`${records.embedding} <=> ${embeddingStr}::vector`)
      .limit(TOP_K_RECORDS);

    // Step 4: Fetch tags for each retrieved record
    // We do this in a separate query rather than a JOIN because the
    // main query already has a complex WHERE clause + ORDER BY.
    // For 6 records, this is fast.
    const recordIds = results.map((r) => r.id);

    if (recordIds.length === 0) return [];

    const recordTagRows = await db
      .select({
        recordId: recordTags.recordId,
        tagName: tags.name,
      })
      .from(recordTags)
      .innerJoin(tags, eq(recordTags.tagId, tags.id))
      .where(
        sql`${recordTags.recordId} IN (${sql.join(
          recordIds.map((id) => sql`${id}`),
          sql`, `
        )})`
      );

    // Group tags by record ID
    const tagsByRecord = new Map<string, string[]>();
    for (const row of recordTagRows) {
      const existing = tagsByRecord.get(row.recordId) || [];
      existing.push(row.tagName);
      tagsByRecord.set(row.recordId, existing);
    }

    // Combine record data with tags
    return results.map((record) => ({
      ...record,
      tags: tagsByRecord.get(record.id) || [],
    }));
  } catch (error) {
    logger.error("RAG record retrieval failed", { userId, error });
    return [];
  }
}

// Type for a record retrieved for RAG context
type RetrievedRecord = {
  id: string;
  type: string;
  title: string | null;
  content: string;
  sourceAuthor: string | null;
  sourceUrl: string | null;
  note: string | null;
  createdAt: Date;
  score: number;
  tags: string[];
};

// ============================================================================
// BUILD SYSTEM PROMPT
// ============================================================================
// Constructs the system prompt that tells Claude:
//   1. What it is (a knowledge base assistant)
//   2. Who the user is (from the AI profile — interests, patterns)
//   3. What records it has access to (the retrieved context)
//   4. How to behave (cite sources, stay grounded, admit uncertainty)
//
// The prompt has three layers, from broadest to most specific:
//   - Base instructions: always the same
//   - User profile: stable background knowledge (regenerated periodically)
//   - Retrieved records: specific to THIS question (changes every message)
//
// This layering is intentional. The profile is ~200-500 tokens and stays
// the same across a conversation. The retrieved records change per message
// but are capped at ~1200 tokens (6 records × 200 tokens). Together,
// the full system prompt stays under ~2000 tokens — efficient and focused.

function buildSystemPrompt(
  relevantRecords: RetrievedRecord[],
  userProfile: UserProfile | null
): string {
  // Start with the base instructions
  let prompt = `You are a helpful assistant for a personal knowledge base called "Brain Extension." The user saves records (notes, quotes, articles, links, images) and you help them find connections, answer questions, and explore their saved content.

IMPORTANT RULES:
- Base your answers on the retrieved records provided below. These are the user's own saved content.
- When referencing a specific record, mention its title or a brief description so the user knows which one you mean.
- If the retrieved records don't contain enough information to answer the question, say so honestly. Don't make things up.
- Be conversational but concise. The user is chatting, not reading an essay.
- You can make connections between records that the user might not have noticed — that's one of your key values.`;

  // ---- Layer 2: User profile ----
  // If we have a profile, include it so the AI "knows" the user.
  // This helps in several ways:
  //   - More relevant follow-up questions ("Since you're into X, have you considered...")
  //   - Better connection-making (links retrieved records to known interests)
  //   - More natural tone (doesn't treat every question as if from a stranger)
  //
  // The profile is optional — conversations work fine without it,
  // they're just less personalized.
  if (userProfile && userProfile.topInterests.length > 0) {
    prompt += `\n\n--- USER PROFILE ---\n`;
    prompt += `${userProfile.summary}\n\n`;
    prompt += `Key interests: ${userProfile.topInterests.join(", ")}\n`;

    if (userProfile.patterns.length > 0) {
      prompt += `\nPatterns noticed in their saved content:\n`;
      userProfile.patterns.forEach((pattern) => {
        prompt += `- ${pattern}\n`;
      });
    }

    // Include content breakdown so the AI knows the user's saving habits
    const breakdownParts = Object.entries(userProfile.contentBreakdown)
      .sort(([, a], [, b]) => b - a)
      .map(([type, count]) => `${count} ${type}s`);

    if (breakdownParts.length > 0) {
      prompt += `\nSaved content: ${breakdownParts.join(", ")} (${userProfile.recordCount} total)\n`;
    }

    prompt += `--- END USER PROFILE ---`;

    // Remind the AI how to use the profile
    prompt += `\n\nUse this profile as background context. Don't explicitly say "according to your profile" — just let it naturally inform your responses.`;
  }

  // ---- Layer 3: Retrieved records ----
  // Add the retrieved records as context
  if (relevantRecords.length > 0) {
    prompt += `\n\n--- RETRIEVED RECORDS ---\n`;
    prompt += `The following records from the user's knowledge base are most relevant to their question:\n\n`;

    relevantRecords.forEach((record, index) => {
      // Truncate long content to stay within token budget.
      // We keep enough to capture the main idea without blowing
      // up the context window (and the API bill).
      const truncatedContent =
        record.content.length > MAX_CONTENT_LENGTH
          ? record.content.slice(0, MAX_CONTENT_LENGTH) + "..."
          : record.content;

      prompt += `[Record ${index + 1}]\n`;
      prompt += `Type: ${record.type}\n`;

      if (record.title) {
        prompt += `Title: ${record.title}\n`;
      }

      prompt += `Content: ${truncatedContent}\n`;

      if (record.sourceAuthor) {
        prompt += `Author: ${record.sourceAuthor}\n`;
      }

      if (record.sourceUrl) {
        prompt += `Source: ${record.sourceUrl}\n`;
      }

      if (record.note) {
        prompt += `User's note: ${record.note}\n`;
      }

      if (record.tags.length > 0) {
        prompt += `Tags: ${record.tags.join(", ")}\n`;
      }

      prompt += `Saved: ${record.createdAt.toLocaleDateString()}\n`;
      prompt += `\n`;
    });

    prompt += `--- END RETRIEVED RECORDS ---`;
  } else {
    prompt += `\n\nNo relevant records were found for this question. Let the user know and suggest they try rephrasing or that the answer might not be in their saved content.`;
  }

  return prompt;
}
