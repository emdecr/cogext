// ============================================================================
// CHAT TOGGLE
// ============================================================================
//
// A small client component that pairs the chat button with the ChatSidebar.
// This exists because the dashboard page is a SERVER component, which can't
// use useState (needed for the sidebar's open/closed state).
//
// The pattern: server component renders this client component, which
// manages the interactive state internally. The server component doesn't
// need to know whether the sidebar is open or closed.
//
// This is the same pattern used by ThemeToggle — a small interactive
// wrapper that the server component drops in without worrying about state.
// ============================================================================

"use client";

import { useState } from "react";
import ChatSidebar from "./chat-sidebar";

export default function ChatToggle() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  return (
    <>
      {/* Chat button — opens the AI sidebar */}
      <button
        onClick={() => setIsSidebarOpen(true)}
        className="rounded-md bg-gray-200 px-3 py-2 text-sm text-gray-700 hover:bg-gray-300 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
        title="Open AI chat"
      >
        {/* Chat bubble icon + label */}
        <span className="flex items-center gap-1.5">
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
              d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
            />
          </svg>
          <span className="hidden sm:inline">Chat</span>
        </span>
      </button>

      {/* Chat sidebar — always mounted, slides in/out via CSS */}
      <ChatSidebar
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
      />
    </>
  );
}
