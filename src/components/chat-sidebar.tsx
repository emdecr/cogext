// ============================================================================
// CHAT SIDEBAR
// ============================================================================
//
// The AI conversation sidebar — slides in from the right side of the screen.
// This is the main entry point for Phase 3's chat feature.
//
// Two "views" in one component:
//   1. CONVERSATION LIST — shown when no conversation is selected.
//      Lists all past conversations with previews. "New Chat" button at top.
//   2. CHAT THREAD — shown when a conversation is active.
//      Shows the message history + input box. Back button to return to list.
//
// State management:
//   - Open/closed state is passed in via props (parent controls visibility)
//   - Active conversation and messages are managed internally
//   - Conversation list is fetched on mount and when conversations change
//
// The sidebar intentionally does NOT use a Radix Dialog or Sheet — it's a
// simple fixed-position panel with CSS transitions, matching the existing
// FilterDrawer pattern. This keeps the mental model consistent across the
// app and avoids adding another dependency.
// ============================================================================

"use client";

import { useState, useEffect, useCallback } from "react";
import {
  getConversations,
  getConversation,
  createConversation,
  deleteConversation,
  type ConversationSummary,
  type ConversationWithMessages,
} from "@/lib/actions/conversations";
import ChatThread from "./chat-thread";

type ChatSidebarProps = {
  isOpen: boolean;
  onClose: () => void;
};

export default function ChatSidebar({ isOpen, onClose }: ChatSidebarProps) {
  // ---- State ----
  // null = showing conversation list, string = showing that conversation
  const [activeConversationId, setActiveConversationId] = useState<
    string | null
  >(null);
  const [conversationList, setConversationList] = useState<
    ConversationSummary[]
  >([]);
  const [activeConversation, setActiveConversation] =
    useState<ConversationWithMessages | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // ---- Load conversation list when sidebar opens ----
  // We refetch every time the sidebar opens because conversations may
  // have been created/deleted since last open. For a personal tool,
  // this is fine — the list is small and the query is fast.
  const loadConversations = useCallback(async () => {
    setIsLoading(true);
    try {
      const convos = await getConversations();
      setConversationList(convos);
    } catch (error) {
      console.error("Failed to load conversations:", error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      loadConversations();
    }
  }, [isOpen, loadConversations]);

  // ---- Open a specific conversation ----
  // Fetches the full conversation with all messages and switches
  // from list view to thread view.
  const openConversation = useCallback(async (id: string) => {
    setIsLoading(true);
    try {
      const convo = await getConversation(id);
      if (convo) {
        setActiveConversation(convo);
        setActiveConversationId(id);
      }
    } catch (error) {
      console.error("Failed to load conversation:", error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // ---- Create a new conversation ----
  // Creates a thread with a default title (the user can rename later,
  // or we auto-title from the first message in a future pass).
  const handleNewChat = useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await createConversation({
        title: "New conversation",
        scope: "all",
      });

      if (result.success && result.conversationId) {
        // Open the newly created conversation
        await openConversation(result.conversationId);
        // Also refresh the list so it shows the new entry
        loadConversations();
      }
    } catch (error) {
      console.error("Failed to create conversation:", error);
    } finally {
      setIsLoading(false);
    }
  }, [openConversation, loadConversations]);

  // ---- Delete a conversation ----
  const handleDelete = useCallback(
    async (id: string, e: React.MouseEvent) => {
      // Stop the click from also triggering openConversation
      e.stopPropagation();

      // TODO (Phase 4): Replace with Radix AlertDialog confirmation modal
      if (!window.confirm("Delete this conversation?")) return;

      try {
        const result = await deleteConversation(id);
        if (result.success) {
          // If we deleted the active conversation, go back to list
          if (activeConversationId === id) {
            setActiveConversationId(null);
            setActiveConversation(null);
          }
          // Refresh the list
          loadConversations();
        }
      } catch (error) {
        console.error("Failed to delete conversation:", error);
      }
    },
    [activeConversationId, loadConversations]
  );

  // ---- Go back to conversation list ----
  const handleBack = useCallback(() => {
    setActiveConversationId(null);
    setActiveConversation(null);
    // Refresh list to pick up any new messages
    loadConversations();
  }, [loadConversations]);

  // ---- Close sidebar and reset state ----
  const handleClose = useCallback(() => {
    onClose();
    // Don't reset activeConversation here — if the user reopens the
    // sidebar, they'll see the same conversation (less disorienting).
  }, [onClose]);

  // ---- Keyboard shortcut: Escape to close ----
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && isOpen) {
        handleClose();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, handleClose]);

  return (
    <>
      {/* ---- Backdrop ---- */}
      {/* Semi-transparent overlay. Clicking closes the sidebar.
          Same pattern as FilterDrawer. */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/30 transition-opacity"
          onClick={handleClose}
        />
      )}

      {/* ---- Sidebar panel ---- */}
      {/* Slides in from the right. Width is responsive:
          - Mobile: full width (w-full)
          - Desktop: 400px (w-[400px])
          The transition matches FilterDrawer for consistency. */}
      <div
        className={`fixed right-0 top-0 z-50 flex h-full w-full flex-col bg-white shadow-xl transition-transform duration-200 ease-in-out sm:w-[400px] dark:bg-gray-900 ${
          isOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {/* ---- Header ---- */}
        <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3 dark:border-gray-700">
          <div className="flex items-center gap-2">
            {/* Back button (only when viewing a conversation) */}
            {activeConversationId && (
              <button
                onClick={handleBack}
                className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800 dark:hover:text-gray-300"
                title="Back to conversations"
              >
                {/* Left arrow icon */}
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
                    d="M15 19l-7-7 7-7"
                  />
                </svg>
              </button>
            )}

            <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
              {activeConversationId
                ? activeConversation?.title || "Chat"
                : "Conversations"}
            </h2>
          </div>

          <div className="flex items-center gap-1">
            {/* New chat button (only in list view) */}
            {!activeConversationId && (
              <button
                onClick={handleNewChat}
                disabled={isLoading}
                className="rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800 dark:hover:text-gray-300"
                title="New chat"
              >
                {/* Plus icon */}
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
                    d="M12 4v16m8-8H4"
                  />
                </svg>
              </button>
            )}

            {/* Close button */}
            <button
              onClick={handleClose}
              className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800 dark:hover:text-gray-300"
            >
              ✕
            </button>
          </div>
        </div>

        {/* ---- Content area ---- */}
        {/* Switches between conversation list and active thread */}
        <div className="flex-1 overflow-hidden">
          {activeConversationId && activeConversation ? (
            // ---- Chat thread view ----
            <ChatThread
              conversation={activeConversation}
              onConversationUpdate={(updated) =>
                setActiveConversation(updated)
              }
            />
          ) : (
            // ---- Conversation list view ----
            <div className="h-full overflow-y-auto">
              {/* Loading state */}
              {isLoading && (
                <div className="px-4 py-8 text-center text-sm text-gray-400">
                  Loading...
                </div>
              )}

              {/* Empty state */}
              {!isLoading && conversationList.length === 0 && (
                <div className="px-4 py-8 text-center">
                  <p className="text-sm text-gray-400 dark:text-gray-500">
                    No conversations yet.
                  </p>
                  <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
                    Start a new chat to ask questions about your records.
                  </p>
                  <button
                    onClick={handleNewChat}
                    className="mt-4 rounded-lg bg-gray-900 px-4 py-2 text-sm text-white hover:bg-gray-800 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-gray-200"
                  >
                    New chat
                  </button>
                </div>
              )}

              {/* Conversation list — each row is a <div role="button"> rather
                  than a <button> because it contains a nested delete button.
                  HTML forbids <button> inside <button> (causes hydration errors).
                  tabIndex + onKeyDown preserve keyboard accessibility. */}
              {!isLoading &&
                conversationList.map((convo) => (
                  <div
                    key={convo.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => openConversation(convo.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        openConversation(convo.id);
                      }
                    }}
                    className="group flex w-full cursor-pointer items-start gap-3 border-b border-gray-100 px-4 py-3 text-left hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-gray-800/50"
                  >
                    {/* Chat bubble icon */}
                    <svg
                      className="mt-0.5 h-4 w-4 flex-shrink-0 text-gray-400"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                      />
                    </svg>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between">
                        <span className="truncate text-sm font-medium text-gray-900 dark:text-gray-100">
                          {convo.title}
                        </span>

                        {/* Delete button (visible on hover) */}
                        <button
                          onClick={(e) => handleDelete(convo.id, e)}
                          className="ml-2 flex-shrink-0 rounded p-0.5 text-gray-300 opacity-0 hover:text-red-500 group-hover:opacity-100 dark:text-gray-600 dark:hover:text-red-400"
                          title="Delete conversation"
                        >
                          <svg
                            className="h-3.5 w-3.5"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                            />
                          </svg>
                        </button>
                      </div>

                      {/* Message preview or "No messages yet" */}
                      <p className="mt-0.5 truncate text-xs text-gray-500 dark:text-gray-400">
                        {convo.lastMessagePreview || "No messages yet"}
                      </p>

                      {/* Metadata: scope badge + message count */}
                      <div className="mt-1 flex items-center gap-2 text-[10px] text-gray-400 dark:text-gray-500">
                        {/* Scope badge (only if not "all") */}
                        {convo.scope !== "all" && (
                          <span className="rounded-full bg-gray-100 px-1.5 py-0.5 dark:bg-gray-800">
                            {convo.scope}: {convo.scopeValue}
                          </span>
                        )}
                        <span>
                          {convo.messageCount} message
                          {convo.messageCount !== 1 ? "s" : ""}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
