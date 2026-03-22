// ============================================================================
// CONVERSATION SERVER ACTIONS
// ============================================================================
//
// CRUD operations for conversations and messages. These handle the
// persistence side of the AI chat feature (Phase 3).
//
// The flow:
//   1. User opens chat sidebar → getConversations() loads the list
//   2. User clicks "New Chat" → createConversation() creates a thread
//   3. User sends a message → addMessage() saves it
//   4. AI responds → addMessage() saves the response too
//   5. User resumes later → getConversation() loads the full thread
//
// Note: These actions only handle PERSISTENCE (saving/loading).
// The actual AI logic (RAG retrieval, LLM call, streaming) lives
// in a separate API route (coming in to-do #4), because streaming
// responses can't go through server actions — they need a real
// HTTP response stream.
//
// Pattern matches records.ts: auth check → Zod validate → DB operation
// → return ActionResult.
// ============================================================================

"use server";

import { eq, desc, and, asc } from "drizzle-orm";
import { redirect } from "next/navigation";

import { db } from "@/db";
import { conversations, messages } from "@/db/schema";
import { getSession } from "@/lib/auth/session";
import {
  createConversationSchema,
  type CreateConversationInput,
} from "@/lib/validations/conversations";

// ============================================================================
// HELPER: Get the current user ID or redirect to login
// ============================================================================
// Same pattern as records.ts. Every action checks auth first.

async function requireUserId(): Promise<string> {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }
  return session.userId;
}

// ============================================================================
// TYPES
// ============================================================================

type ActionResult = {
  success: boolean;
  error?: string;
  fieldErrors?: Record<string, string[]>;
  conversationId?: string;
};

// What a conversation looks like when listed in the sidebar.
// We include the message count and a preview of the last message
// so the sidebar can show useful info without loading full threads.
export type ConversationSummary = {
  id: string;
  title: string;
  scope: "all" | "collection" | "tag" | "date_range";
  scopeValue: string | null;
  createdAt: Date;
  // These come from a subquery — not stored in the conversations table
  messageCount: number;
  lastMessagePreview: string | null;
};

// A full conversation with all its messages, used when the user
// opens a specific thread.
export type ConversationWithMessages = {
  id: string;
  title: string;
  scope: "all" | "collection" | "tag" | "date_range";
  scopeValue: string | null;
  createdAt: Date;
  messages: {
    id: string;
    role: "user" | "assistant";
    content: string;
    createdAt: Date;
  }[];
};

// ============================================================================
// CREATE CONVERSATION
// ============================================================================
// Creates a new chat thread. Called when the user starts a new chat
// or sends their first message (we can auto-create with a title
// derived from the first message).

export async function createConversation(
  input: CreateConversationInput
): Promise<ActionResult> {
  const userId = await requireUserId();

  const parsed = createConversationSchema.safeParse(input);

  if (!parsed.success) {
    return {
      success: false,
      error: "Please fix the errors below",
      fieldErrors: parsed.error.flatten().fieldErrors as Record<
        string,
        string[]
      >,
    };
  }

  try {
    const [created] = await db
      .insert(conversations)
      .values({
        userId,
        title: parsed.data.title,
        scope: parsed.data.scope,
        scopeValue: parsed.data.scopeValue || null,
      })
      .returning();

    return { success: true, conversationId: created.id };
  } catch (error) {
    console.error("Failed to create conversation:", error);
    return {
      success: false,
      error: "Failed to create conversation. Please try again.",
    };
  }
}

// ============================================================================
// GET CONVERSATIONS (list for sidebar)
// ============================================================================
// Returns all conversations for the current user, newest first.
// Includes message count and a preview of the last message.
//
// We use Drizzle's relational query here with `messages: true` to
// load messages, then compute the count and preview in JS.
// For a large number of conversations, we'd use a SQL subquery
// instead — but for a personal tool, this is simpler and fast enough.

export async function getConversations(): Promise<ConversationSummary[]> {
  const userId = await requireUserId();

  const results = await db.query.conversations.findMany({
    where: eq(conversations.userId, userId),
    orderBy: desc(conversations.createdAt),
    with: {
      // Load messages so we can compute count and preview.
      // We only need the content and role of the most recent message,
      // but Drizzle's relational queries don't support LIMIT on nested
      // relations — so we load all and pick the last one in JS.
      //
      // Trade-off: for conversations with 100+ messages, this loads
      // more data than needed. If that becomes a problem, we'd switch
      // to a raw SQL subquery. For a personal tool with modest usage,
      // this is fine.
      messages: {
        orderBy: asc(messages.createdAt),
      },
    },
  });

  return results.map((conv) => ({
    id: conv.id,
    title: conv.title,
    scope: conv.scope,
    scopeValue: conv.scopeValue,
    createdAt: conv.createdAt,
    messageCount: conv.messages.length,
    // Show a preview of the last message. Truncate to 100 chars
    // so the sidebar doesn't get bloated.
    lastMessagePreview: conv.messages.length > 0
      ? conv.messages[conv.messages.length - 1].content.slice(0, 100)
      : null,
  }));
}

// ============================================================================
// GET CONVERSATION (single thread with all messages)
// ============================================================================
// Loads a full conversation with all its messages in chronological order.
// Used when the user opens a specific chat thread.
//
// Important: we check that the conversation belongs to the current user.
// Without this, someone could guess a conversation ID and read it.

export async function getConversation(
  conversationId: string
): Promise<ConversationWithMessages | null> {
  const userId = await requireUserId();

  const result = await db.query.conversations.findFirst({
    where: and(
      eq(conversations.id, conversationId),
      eq(conversations.userId, userId) // Ownership check
    ),
    with: {
      // Messages in chronological order (oldest first) so the chat
      // reads top-to-bottom like a natural conversation.
      messages: {
        orderBy: asc(messages.createdAt),
      },
    },
  });

  if (!result) return null;

  return {
    id: result.id,
    title: result.title,
    scope: result.scope,
    scopeValue: result.scopeValue,
    createdAt: result.createdAt,
    messages: result.messages.map((msg) => ({
      id: msg.id,
      role: msg.role,
      content: msg.content,
      createdAt: msg.createdAt,
    })),
  };
}

// ============================================================================
// ADD MESSAGE
// ============================================================================
// Saves a single message (user or assistant) to a conversation.
// Called twice per exchange:
//   1. When the user sends a message (role: "user")
//   2. When the AI responds (role: "assistant")
//
// We verify that the conversation exists and belongs to the user
// before inserting. This prevents someone from injecting messages
// into another user's conversation.

export async function addMessage(
  conversationId: string,
  role: "user" | "assistant",
  content: string
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const userId = await requireUserId();

  // Validate the content isn't empty
  const trimmed = content.trim();
  if (!trimmed) {
    return { success: false, error: "Message cannot be empty" };
  }

  try {
    // Step 1: Verify the conversation exists and belongs to this user.
    // We do a SELECT first rather than just INSERT and hope for the best,
    // because we want a clear error message ("not found") rather than
    // a foreign key constraint error from Postgres.
    const conversation = await db.query.conversations.findFirst({
      where: and(
        eq(conversations.id, conversationId),
        eq(conversations.userId, userId)
      ),
    });

    if (!conversation) {
      return { success: false, error: "Conversation not found" };
    }

    // Step 2: Insert the message
    const [created] = await db
      .insert(messages)
      .values({
        conversationId,
        role,
        content: trimmed,
      })
      .returning();

    return { success: true, messageId: created.id };
  } catch (error) {
    console.error("Failed to add message:", error);
    return {
      success: false,
      error: "Failed to save message. Please try again.",
    };
  }
}

// ============================================================================
// DELETE CONVERSATION
// ============================================================================
// Deletes a conversation and all its messages. We delete messages first
// because they have a foreign key reference to conversations — deleting
// the conversation without deleting messages would violate the FK constraint.
//
// In a future pass, we could add ON DELETE CASCADE to the FK in the schema
// so Postgres handles this automatically. For now, we do it explicitly
// to make the behavior visible.

export async function deleteConversation(
  conversationId: string
): Promise<ActionResult> {
  const userId = await requireUserId();

  try {
    // Verify ownership first
    const conversation = await db.query.conversations.findFirst({
      where: and(
        eq(conversations.id, conversationId),
        eq(conversations.userId, userId)
      ),
    });

    if (!conversation) {
      return { success: false, error: "Conversation not found" };
    }

    // Delete messages first (child rows), then the conversation (parent).
    // This is a two-step delete because messages reference conversations
    // via a foreign key. If we tried to delete the conversation first,
    // Postgres would reject it with a FK violation error.
    await db
      .delete(messages)
      .where(eq(messages.conversationId, conversationId));

    await db
      .delete(conversations)
      .where(eq(conversations.id, conversationId));

    return { success: true };
  } catch (error) {
    console.error("Failed to delete conversation:", error);
    return {
      success: false,
      error: "Failed to delete conversation. Please try again.",
    };
  }
}
