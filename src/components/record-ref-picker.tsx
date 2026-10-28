// ============================================================================
// RECORD REF PICKER — the `[[` popup
// ============================================================================
//
// The dropdown the Tiptap Suggestion plugin shows while the user types
// `[[query`. Rendered with ReactRenderer and positioned by the plugin's own
// `mount()` (floating-ui, anchored to the caret).
//
// Two wrinkles from living inside the RichTextDialog (a modal Radix Dialog):
//   - The popup is appended to <body>, outside the dialog, so Radix's modal
//     `pointer-events: none` on body would swallow clicks — hence the explicit
//     `pointer-events-auto`.
//   - Radix treats a pointerdown here as "outside", so the dialog ignores
//     pointerdowns inside `[data-record-ref-picker]` (rich-text-dialog.tsx).
//   - Radix also listens for Escape on `document` in the capture phase, and
//     the dialog stops propagation there — so the keypress never reaches
//     ProseMirror. The picker therefore grabs Escape one step earlier, on
//     `window` capture, and closes itself; the dialog never sees it.
// Rows use onMouseDown + preventDefault so the editor keeps focus.
// ============================================================================

"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { ReactRenderer } from "@tiptap/react";
import {
  exitSuggestion,
  type SuggestionOptions,
  type SuggestionProps,
  type SuggestionKeyDownProps,
} from "@tiptap/suggestion";
import { lookupRecords } from "@/lib/actions/record-lookup";
import { recordRefIcon } from "@/lib/record-ref";
import type { RecordLookupResult } from "@/lib/validations/records";

export type RecordRefPickerHandle = {
  onKeyDown: (props: SuggestionKeyDownProps) => boolean;
};

type PickerProps = SuggestionProps<RecordLookupResult, RecordLookupResult>;

const RecordRefPicker = forwardRef<RecordRefPickerHandle, PickerProps>(
  function RecordRefPicker({ items, loading, command, query, editor }, ref) {
    const [selected, setSelected] = useState(0);
    const [prevItems, setPrevItems] = useState(items);
    const listRef = useRef<HTMLUListElement>(null);

    // New results → highlight the top one again (adjusting state during
    // render, React's recommended alternative to a reset effect).
    if (items !== prevItems) {
      setPrevItems(items);
      setSelected(0);
    }

    // Close on Escape before Radix's document-capture listener can see it.
    useEffect(() => {
      function onKeyDown(event: KeyboardEvent) {
        if (event.key !== "Escape") return;
        event.preventDefault();
        event.stopPropagation();
        exitSuggestion(editor.view);
      }
      window.addEventListener("keydown", onKeyDown, true);
      return () => window.removeEventListener("keydown", onKeyDown, true);
    }, [editor]);

    // Keep the highlighted row visible when arrowing through a long list.
    useEffect(() => {
      listRef.current
        ?.querySelector(`[data-index="${selected}"]`)
        ?.scrollIntoView({ block: "nearest" });
    }, [selected]);

    useImperativeHandle(ref, () => ({
      onKeyDown: ({ event }) => {
        if (items.length === 0) return false;
        if (event.key === "ArrowDown") {
          setSelected((i) => (i + 1) % items.length);
          return true;
        }
        if (event.key === "ArrowUp") {
          setSelected((i) => (i - 1 + items.length) % items.length);
          return true;
        }
        if (event.key === "Enter" || event.key === "Tab") {
          command(items[selected]);
          return true;
        }
        return false;
      },
    }));

    return (
      <div
        data-record-ref-picker=""
        className="w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-900"
      >
        <div className="border-b border-gray-100 px-3 py-1.5 text-[11px] font-medium uppercase tracking-wide text-gray-400 dark:border-gray-800 dark:text-gray-500">
          {query ? "Link a record" : "Recent records"}
        </div>
        {items.length === 0 ? (
          <p className="px-3 py-3 text-sm text-gray-500 dark:text-gray-400">
            {loading ? "Searching…" : "No matching records"}
          </p>
        ) : (
          <ul ref={listRef} role="listbox" aria-label="Records" className="max-h-72 overflow-y-auto py-1">
            {items.map((item, index) => (
              <li
                key={item.id}
                data-index={index}
                role="option"
                aria-selected={index === selected}
                onMouseDown={(e) => {
                  e.preventDefault();
                  command(item);
                }}
                onMouseEnter={() => setSelected(index)}
                className={`flex cursor-pointer items-center gap-2.5 px-3 py-1.5 ${
                  index === selected ? "bg-violet-50 dark:bg-violet-950/60" : ""
                }`}
              >
                {item.imagePath ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={item.imagePath}
                    alt=""
                    className="h-9 w-7 shrink-0 rounded-sm border border-gray-100 object-cover dark:border-gray-800"
                  />
                ) : (
                  <span
                    aria-hidden="true"
                    className="flex h-9 w-7 shrink-0 items-center justify-center rounded-sm bg-gray-100 text-sm dark:bg-gray-800"
                  >
                    {recordRefIcon(item.type)}
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-gray-900 dark:text-gray-100">
                    {item.label}
                  </span>
                  <span className="block truncate text-xs capitalize text-gray-500 dark:text-gray-400">
                    {item.type}
                    {item.sourceAuthor && (
                      <span className="normal-case"> · {item.sourceAuthor}</span>
                    )}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  },
);

// Suggestion config for RecordRef.configure({ suggestion }). `excludeId` keeps
// the record being edited out of its own picker.
export function recordRefSuggestion(opts: {
  excludeId?: string;
}): Omit<SuggestionOptions<RecordLookupResult, RecordLookupResult>, "editor"> {
  return {
    char: "[[",
    allowSpaces: true,
    // `[[` should work mid-word too (e.g. right after an opening paren).
    allowedPrefixes: null,
    debounce: 150,
    // Fixed so the popup tracks the caret inside the dialog's scrolling body.
    floatingUi: { strategy: "fixed" },
    items: async ({ query }) => {
      try {
        return await lookupRecords(query, { excludeId: opts.excludeId });
      } catch {
        return [];
      }
    },
    command: ({ editor, range, props }) => {
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .insertRecordRef({ id: props.id, label: props.label, type: props.type })
        .run();
    },
    render: () => {
      let component: ReactRenderer<RecordRefPickerHandle, PickerProps> | null = null;
      let unmount: (() => void) | null = null;

      return {
        onStart: (props) => {
          // The renderer's wrapper div is what mount() positions, so the
          // stacking + pointer-events classes go on it (above the z-50 dialog).
          component = new ReactRenderer(RecordRefPicker, {
            props,
            editor: props.editor,
            className: "pointer-events-auto z-[60]",
          });
          unmount = props.mount(component.element as HTMLElement);
        },
        onUpdate: (props) => component?.updateProps(props),
        onKeyDown: (props) => component?.ref?.onKeyDown(props) ?? false,
        onExit: () => {
          unmount?.();
          component?.destroy();
          unmount = null;
          component = null;
        },
      };
    },
  };
}
