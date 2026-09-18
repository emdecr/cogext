// ============================================================================
// TAG INPUT COMPONENT
// ============================================================================
//
// A text input where you type a tag name and press Enter to add it.
// Shows existing tags as removable pills, and — while focused — an
// autocomplete dropdown of the user's existing tags so you can reuse one
// (e.g. a book-title tag) instead of retyping it.
//
// Used in two places:
//   1. The create record form (tags added locally, saved with the record)
//   2. The detail modal (tags added/removed via server actions immediately)
//
// Both just supply onAdd/onRemove — this component doesn't care which. When
// `suggest` is set it lazily loads the user's tags (getTagSuggestions) the
// first time the field is focused and filters them client-side as you type.
// ============================================================================

"use client";

import { useState, useRef, useId, type KeyboardEvent } from "react";
import { getTagSuggestions } from "@/lib/actions/tags";

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
  // Enable the existing-tag autocomplete dropdown. Off by default so callers
  // opt in (both current callers do).
  suggest?: boolean;
};

// Cap the dropdown so a large tag vocabulary doesn't produce a giant list.
const MAX_SUGGESTIONS = 8;

export default function TagInput({
  tags,
  onAdd,
  onRemove,
  disabled,
  suggest = false,
}: TagInputProps) {
  const [inputValue, setInputValue] = useState("");

  // Autocomplete state. `allTags` is the lazily-loaded vocabulary; `isFocused`
  // gates whether the dropdown can show; `activeIndex` is the keyboard-highlighted
  // option (-1 = none, so Enter falls back to adding the typed value).
  const [allTags, setAllTags] = useState<string[]>([]);
  const [isFocused, setIsFocused] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const loadedRef = useRef(false);
  // Stable id linking the input (aria-controls) to the suggestion listbox.
  const listboxId = useId();

  async function loadSuggestions() {
    if (!suggest || loadedRef.current) return;
    loadedRef.current = true;
    try {
      const rows = await getTagSuggestions();
      setAllTags(rows.map((r) => r.name));
    } catch {
      // Non-fatal: autocomplete just stays empty and typing still works.
      loadedRef.current = false;
    }
  }

  // Names already on the record — never suggest these.
  const applied = new Set(tags.map((t) => t.name));
  const query = inputValue.trim().toLowerCase();

  // On focus with an empty field we show the most-used unused tags (discovery);
  // once typing, we substring-filter. Either way, exclude already-applied tags.
  const suggestions =
    suggest && isFocused
      ? allTags
          .filter((name) =>
            query ? name.includes(query) : true,
          )
          .filter((name) => !applied.has(name))
          .slice(0, MAX_SUGGESTIONS)
      : [];

  const showDropdown = suggestions.length > 0;

  function addTag(rawName: string) {
    const value = rawName.trim().toLowerCase();
    if (!value) return;
    // Don't add duplicates.
    if (!applied.has(value)) onAdd(value);
    setInputValue("");
    setActiveIndex(-1);
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (showDropdown && e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => (i + 1) % suggestions.length);
      return;
    }
    if (showDropdown && e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => (i <= 0 ? suggestions.length - 1 : i - 1));
      return;
    }
    if (e.key === "Escape" && showDropdown) {
      // Collapse the dropdown but keep focus/value.
      setActiveIndex(-1);
      setIsFocused(false);
      return;
    }

    if (e.key === "Enter") {
      // Prevent form submission — Enter adds a tag, not submits.
      e.preventDefault();
      // If an option is highlighted, take it; otherwise add what was typed.
      if (activeIndex >= 0 && suggestions[activeIndex]) {
        addTag(suggestions[activeIndex]);
      } else {
        addTag(inputValue);
      }
      return;
    }

    // Backspace on an empty input removes the last tag (common UX pattern).
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

      {/* Text input + autocomplete dropdown */}
      <div className="relative">
        <input
          type="text"
          value={inputValue}
          onChange={(e) => {
            setInputValue(e.target.value);
            setActiveIndex(-1);
          }}
          onKeyDown={handleKeyDown}
          onFocus={() => {
            setIsFocused(true);
            void loadSuggestions();
          }}
          // Delay so a click/tap on an option registers before the dropdown
          // unmounts (mousedown on the option also guards this).
          onBlur={() => setTimeout(() => setIsFocused(false), 120)}
          disabled={disabled}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          role="combobox"
          aria-expanded={showDropdown}
          aria-controls={listboxId}
          aria-autocomplete="list"
          placeholder={tags.length > 0 ? "Add another tag..." : "Type a tag and press Enter"}
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:placeholder:text-gray-500 dark:focus:border-gray-400 dark:focus:ring-gray-400"
        />

        {showDropdown && (
          <ul
            id={listboxId}
            role="listbox"
            className="absolute left-0 right-0 z-20 mt-1 max-h-48 overflow-y-auto rounded-md border border-gray-200 bg-white py-1 shadow-lg dark:border-gray-700 dark:bg-gray-800"
          >
            {suggestions.map((name, i) => (
              <li key={name} role="option" aria-selected={i === activeIndex}>
                <button
                  type="button"
                  // mousedown fires before the input's blur, so the option is
                  // added even though blur is about to hide the list.
                  onMouseDown={(e) => {
                    e.preventDefault();
                    addTag(name);
                  }}
                  onMouseEnter={() => setActiveIndex(i)}
                  className={`flex w-full items-center px-3 py-2 text-left text-sm text-gray-700 dark:text-gray-200 ${
                    i === activeIndex
                      ? "bg-gray-100 dark:bg-gray-700"
                      : "hover:bg-gray-100 dark:hover:bg-gray-700"
                  }`}
                >
                  {name}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
