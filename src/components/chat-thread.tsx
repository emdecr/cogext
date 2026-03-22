// ============================================================================
// CHAT THREAD
// ============================================================================
//
// Displays a conversation's messages and provides an input for sending
// new ones. This is the "inner" component of the chat sidebar — it only
// appears when a specific conversation is active.
//
// Layout (top to bottom):
//   1. Scrollable message area (takes up all available space)
//   2. Fixed input area at the bottom
//
// Message flow:
//   1. User types a message and presses Enter (or clicks Send)
//   2. We optimistically add the user message to the UI
//   3. We save it to the DB via addMessage()
//   4. We call the chat API route (to-do #4) for the AI response
//   5. The AI response streams in and we append it to the UI
//   6. Once complete, we save the AI response to the DB
//
// For now (before the API route exists), step 4-6 is a placeholder.
// The component is fully wired for persistence — sending a message
// saves it and shows it in the thread.
// ============================================================================

"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import {
  addMessage,
  type ConversationWithMessages,
} from "@/lib/actions/conversations";

type ChatThreadProps = {
  conversation: ConversationWithMessages;
  // Called when we add messages, so the parent can update its state.
  // This keeps the sidebar's activeConversation in sync without
  // needing to refetch from the DB after every message.
  onConversationUpdate: (updated: ConversationWithMessages) => void;
};

export default function ChatThread({
  conversation,
  onConversationUpdate,
}: ChatThreadProps) {
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  // Tracks the AI's streaming response. When non-null, an AI response
  // is in progress and this string grows as chunks arrive.
  const [streamingResponse, setStreamingResponse] = useState<string | null>(
    null
  );

  // Refs for auto-scrolling and input focus
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // ---- Auto-scroll to bottom when messages change ----
  // We scroll whenever the message list grows or the streaming response
  // updates. This keeps the latest message visible.
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [conversation.messages, streamingResponse, scrollToBottom]);

  // ---- Focus input on mount ----
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // ---- Send a message ----
  const handleSend = useCallback(async () => {
    const trimmed = input.trim();
    if (!trimmed || isSending) return;

    setIsSending(true);
    setInput("");

    // Step 1: Optimistically add the user message to the UI.
    // "Optimistic" means we show it immediately before the DB confirms.
    // This makes the UI feel instant. If the save fails, we'd roll back
    // (though for simplicity we don't handle that edge case yet).
    const optimisticMessage = {
      id: `temp-${Date.now()}`, // Temporary ID until DB returns the real one
      role: "user" as const,
      content: trimmed,
      createdAt: new Date(),
    };

    const updatedConvo = {
      ...conversation,
      messages: [...conversation.messages, optimisticMessage],
    };
    onConversationUpdate(updatedConvo);

    try {
      // Step 2: Save the user message to the database.
      const result = await addMessage(conversation.id, "user", trimmed);

      if (!result.success) {
        console.error("Failed to save message:", result.error);
        // TODO: Show error toast, roll back optimistic update
      }

      // Step 3: Call the AI chat API for a response.
      // This will be wired up in to-do #4 (RAG pipeline).
      // For now, we show a placeholder so you can verify the UI works.
      setStreamingResponse("");

      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId: conversation.id,
          message: trimmed,
        }),
      });

      if (!response.ok || !response.body) {
        throw new Error("Chat API request failed");
      }

      // Step 4: Read the streaming response.
      // The API route returns a ReadableStream of text chunks.
      // We use a reader to consume them one at a time and update
      // the UI as each chunk arrives.
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let fullResponse = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        // Decode the chunk (Uint8Array → string) and append it
        const chunk = decoder.decode(value, { stream: true });
        fullResponse += chunk;
        setStreamingResponse(fullResponse);
      }

      // Step 5: Streaming is done. Save the full AI response to the DB
      // and add it to the conversation as a real message.
      setStreamingResponse(null);

      const assistantMessage = {
        id: `temp-assistant-${Date.now()}`,
        role: "assistant" as const,
        content: fullResponse,
        createdAt: new Date(),
      };

      onConversationUpdate({
        ...updatedConvo,
        messages: [...updatedConvo.messages, assistantMessage],
      });

      // Save the assistant message to DB
      await addMessage(conversation.id, "assistant", fullResponse);
    } catch (error) {
      console.error("Chat error:", error);
      setStreamingResponse(null);
      // TODO: Show error message in the chat thread
    } finally {
      setIsSending(false);
      inputRef.current?.focus();
    }
  }, [input, isSending, conversation, onConversationUpdate]);

  // ---- Handle Enter key to send ----
  // Enter sends, Shift+Enter adds a newline (standard chat behavior).
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault(); // Prevent newline
        handleSend();
      }
    },
    [handleSend]
  );

  return (
    <div className="flex h-full flex-col">
      {/* ---- Messages area ---- */}
      {/* flex-1 + overflow-y-auto = takes all available space and scrolls */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {/* Empty state */}
        {conversation.messages.length === 0 && !streamingResponse && (
          <div className="flex h-full items-center justify-center">
            <div className="text-center">
              <p className="text-sm text-gray-400 dark:text-gray-500">
                Ask a question about your records.
              </p>
              <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
                The AI will search your saved content to find answers.
              </p>
            </div>
          </div>
        )}

        {/* Message list */}
        <div className="space-y-4">
          {conversation.messages.map((msg) => (
            <MessageBubble
              key={msg.id}
              role={msg.role}
              content={msg.content}
            />
          ))}

          {/* Streaming response (in-progress AI message) */}
          {streamingResponse !== null && (
            <MessageBubble
              role="assistant"
              content={streamingResponse || "Thinking..."}
              isStreaming
            />
          )}
        </div>

        {/* Invisible element at the bottom for auto-scrolling.
            scrollIntoView() on this element scrolls the container
            to show the latest message. */}
        <div ref={messagesEndRef} />
      </div>

      {/* ---- Input area ---- */}
      {/* Fixed at the bottom of the sidebar. Uses a textarea instead
          of input to support multi-line messages (Shift+Enter). */}
      <div className="border-t border-gray-200 px-4 py-3 dark:border-gray-700">
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about your records..."
            disabled={isSending}
            rows={1}
            className="max-h-32 min-h-[36px] flex-1 resize-none rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-gray-400 focus:outline-none disabled:opacity-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 dark:placeholder:text-gray-500 dark:focus:border-gray-500"
          />

          {/* Send button */}
          <button
            onClick={handleSend}
            disabled={!input.trim() || isSending}
            className="flex-shrink-0 rounded-lg bg-gray-900 p-2 text-white hover:bg-gray-800 disabled:opacity-30 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-gray-200"
            title="Send message"
          >
            {/* Arrow up icon (send) */}
            <svg
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 10l7-7m0 0l7 7m-7-7v18"
              />
            </svg>
          </button>
        </div>

        {/* Hint text */}
        <p className="mt-1.5 text-[10px] text-gray-400 dark:text-gray-500">
          Enter to send, Shift+Enter for new line
        </p>
      </div>
    </div>
  );
}

// ============================================================================
// MESSAGE BUBBLE
// ============================================================================
// Renders a single message. User messages are right-aligned with a dark
// background; assistant messages are left-aligned with a light background.
// This mirrors familiar chat app patterns (iMessage, WhatsApp, etc.).

function MessageBubble({
  role,
  content,
  isStreaming = false,
}: {
  role: "user" | "assistant";
  content: string;
  isStreaming?: boolean;
}) {
  const isUser = role === "user";

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm ${
          isUser
            ? // User: dark bubble, white text (inverted in dark mode)
              "bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900"
            : // Assistant: light bubble, dark text
              "bg-gray-100 text-gray-900 dark:bg-gray-800 dark:text-gray-100"
        }`}
      >
        {/* Render content with preserved whitespace (for multi-line messages).
            whitespace-pre-wrap keeps newlines and wraps long lines. */}
        <p className="whitespace-pre-wrap">{content}</p>

        {/* Streaming indicator — a blinking cursor after the text */}
        {isStreaming && (
          <span className="ml-0.5 inline-block h-4 w-0.5 animate-pulse bg-current" />
        )}
      </div>
    </div>
  );
}
