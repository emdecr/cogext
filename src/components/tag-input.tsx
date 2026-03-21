// ============================================================================
// TAG INPUT COMPONENT
// ============================================================================
//
// A text input where you type a tag name and press Enter to add it.
// Shows existing tags as removable pills.
//
// This component is used in two places:
//   1. The create record form (tags added locally, saved with the record)
//   2. The detail modal (tags added/removed via server actions immediately)
//
// The `mode` prop controls the behavior:
//   - "local" — manages tags in local state, calls onAdd/onRemove callbacks
//   - "server" — calls server actions directly to add/remove tags
//
// For now we're keeping it simple with "local" mode for the create form.
// We'll wire up "server" mode for the detail modal.
// ============================================================================

"use client";

import { useState, type KeyboardEvent } from "react";

type Tag = {
  id: string;
  name: string;
  isAi: boolean;
};

type TagInputProps = {
  // Current tags to display
  tags: Tag[];
  // Called when a tag is added (provides the tag name)
  onAdd: (name: string) => void;
  // Called when a tag is removed (provides the tag ID)
  onRemove: (id: string) => void;
  // Whether the input is disabled (e.g., during submission)
  disabled?: boolean;
};

export default function TagInput({
  tags,
  onAdd,
  onRemove,
  disabled,
}: TagInputProps) {
  const [inputValue, setInputValue] = useState("");

  // Handle Enter key to add a tag, Backspace to remove the last one
  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      // Prevent form submission — we want Enter to add a tag, not submit
      e.preventDefault();

      const value = inputValue.trim().toLowerCase();
      if (!value) return;

      // Don't add duplicate tags
      if (tags.some((t) => t.name === value)) {
        setInputValue("");
        return;
      }

      onAdd(value);
      setInputValue("");
    }

    // Backspace on empty input removes the last tag (common UX pattern)
    if (e.key === "Backspace" && !inputValue && tags.length > 0) {
      onRemove(tags[tags.length - 1].id);
    }
  }

  return (
    <div>
      {/* Tag pills */}
      {tags.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {tags.map((tag) => (
            <span
              key={tag.id}
              className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                tag.isAi
                  ? "bg-violet-100 text-violet-700" // AI tags get a distinct color
                  : "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300"
              }`}
            >
              {tag.name}
              <button
                type="button"
                onClick={() => onRemove(tag.id)}
                disabled={disabled}
                className="ml-0.5 text-current opacity-50 hover:opacity-100"
                aria-label={`Remove tag ${tag.name}`}
              >
                ✕
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Text input */}
      <input
        type="text"
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        placeholder={tags.length > 0 ? "Add another tag..." : "Type a tag and press Enter"}
        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:placeholder:text-gray-500 dark:focus:border-gray-400 dark:focus:ring-gray-400"
      />
    </div>
  );
}
