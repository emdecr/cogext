// ============================================================================
// CONVERSATION VALIDATION SCHEMAS
// ============================================================================
//
// Zod schemas for validating conversation and message data. Same pattern
// as records.ts — define the shape once, get runtime validation + TS types.
//
// Conversations are simpler than records: they have a title, an optional
// scope (what subset of records the AI searches), and messages.
// ============================================================================

import { z } from "zod";

// The allowed scope types — must match our Postgres ENUM in schema.ts.
// Controls what records the AI can search when answering questions.
//   - "all": search everything (default)
//   - "collection": only search records in a specific collection
//   - "tag": only search records with a specific tag
//   - "date_range": only search records within a date range
export const SCOPE_TYPES = ["all", "collection", "tag", "date_range"] as const;

// ============================================================================
// CREATE CONVERSATION
// ============================================================================
// Used when the user starts a new chat thread. The title is auto-generated
// from the first message if not provided.

export const createConversationSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, "Title is required")
    .max(200, "Title is too long"),

  // What subset of records the AI should search.
  // Defaults to "all" if not specified.
  scope: z.enum(SCOPE_TYPES).optional().default("all"),

  // The value associated with the scope. Meaning depends on scope type:
  //   - "all" → null (no value needed)
  //   - "collection" → collection UUID
  //   - "tag" → tag name
  //   - "date_range" → "2026-01-01,2026-03-01" (start,end)
  //
  // We validate it as an optional string here. The action layer will
  // do type-specific validation (e.g., checking that the collection
  // UUID actually exists).
  scopeValue: z.string().trim().optional(),
});

export type CreateConversationInput = z.infer<typeof createConversationSchema>;

// ============================================================================
// SEND MESSAGE
// ============================================================================
// Used when the user sends a message in a conversation. We validate the
// message content and the conversation ID it belongs to.

export const sendMessageSchema = z.object({
  conversationId: z.uuid("Invalid conversation ID"),

  // The user's message. Must not be empty.
  content: z
    .string()
    .trim()
    .min(1, "Message cannot be empty")
    .max(10000, "Message is too long"),
});

export type SendMessageInput = z.infer<typeof sendMessageSchema>;
