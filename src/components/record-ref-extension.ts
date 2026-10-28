// ============================================================================
// RECORD REF — Tiptap node
// ============================================================================
//
// An inline, atomic node for a link to another record. It exists so that a
// reference reads as a single chip (icon + title) in the editor instead of
// underlined text, and so Backspace removes it whole.
//
// Markdown stays the source of truth. The node:
//   - parses from any `<a href="/records/<uuid>">` — which is what markdown-it
//     renders `[label](/records/<uuid> "type")` into — with a higher priority
//     than StarterKit's Link mark, so record links become chips and every other
//     link stays a normal Link mark;
//   - serializes back to `[label](/records/<uuid> "type")`.
//
// The `[[` picker that inserts these is opt-in via the `suggestion` option (see
// record-ref-picker.tsx). Without it — e.g. in the headless round-trip test —
// the node still parses and serializes, there's just no picker or shortcut.
// ============================================================================

import { Node, mergeAttributes } from "@tiptap/core";
import Suggestion, { type SuggestionOptions } from "@tiptap/suggestion";
import type { MarkdownNodeSpec } from "tiptap-markdown";
import {
  RECORD_REF_CHIP_CLASS,
  escapeRecordRefLabel,
  isRecordType,
  parseRecordRefHref,
  recordRefIcon,
} from "@/lib/record-ref";

export type RecordRefAttrs = {
  id: string;
  label: string;
  type: string | null;
};

export type RecordRefOptions = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  suggestion: Omit<SuggestionOptions<any, any>, "editor"> | null;
};

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    recordRef: {
      insertRecordRef: (attrs: RecordRefAttrs) => ReturnType;
      openRecordRefPicker: () => ReturnType;
    };
  }
}

export const RecordRef = Node.create<RecordRefOptions>({
  name: "recordRef",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,
  draggable: false,

  addOptions() {
    return { suggestion: null };
  },

  addAttributes() {
    return {
      id: { default: null },
      label: { default: "" },
      type: { default: null },
    };
  },

  parseHTML() {
    return [
      {
        tag: "a[href]",
        // Beat the Link mark's `a[href]` rule (default priority 50).
        priority: 100,
        getAttrs: (el) => {
          const id = parseRecordRefHref(el.getAttribute("href"));
          if (!id) return false; // not a record link — let Link handle it
          const title = el.getAttribute("title");
          return {
            id,
            label: el.textContent ?? "",
            type: isRecordType(title) ? title : null,
          };
        },
      },
    ];
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      "a",
      mergeAttributes(
        { href: `/records/${node.attrs.id}`, "data-record-ref": "" },
        node.attrs.type ? { title: node.attrs.type } : {},
        // Drop the raw attrs Tiptap would otherwise spread onto the element.
        Object.fromEntries(
          Object.entries(HTMLAttributes).filter(([k]) => !["id", "label", "type"].includes(k)),
        ),
      ),
      node.attrs.label,
    ];
  },

  renderText({ node }) {
    return node.attrs.label;
  },

  addNodeView() {
    return ({ node }) => {
      const dom = document.createElement("span");
      dom.className = `${RECORD_REF_CHIP_CLASS} cursor-default`;
      dom.contentEditable = "false";
      dom.dataset.recordRef = node.attrs.id;
      dom.title = node.attrs.type ? `Linked ${node.attrs.type}` : "Linked record";

      const icon = document.createElement("span");
      icon.setAttribute("aria-hidden", "true");
      icon.textContent = recordRefIcon(node.attrs.type);

      const label = document.createElement("span");
      label.className = "truncate";
      label.textContent = node.attrs.label || "Untitled";

      dom.append(icon, label);
      return { dom };
    };
  },

  addCommands() {
    return {
      insertRecordRef:
        (attrs) =>
        ({ chain }) =>
          chain()
            .insertContent([
              { type: this.name, attrs },
              { type: "text", text: " " },
            ])
            .run(),
      // Typing the trigger is the single code path: the toolbar button and
      // shortcut just insert `[[` and let the Suggestion plugin take over.
      openRecordRefPicker:
        () =>
        ({ chain }) =>
          chain().focus().insertContent("[[").run(),
    };
  },

  addKeyboardShortcuts() {
    return {
      "Mod-Shift-k": () =>
        !!this.options.suggestion && this.editor.commands.openRecordRefPicker(),
    };
  },

  addProseMirrorPlugins() {
    if (!this.options.suggestion) return [];
    return [Suggestion({ editor: this.editor, ...this.options.suggestion })];
  },

  addStorage() {
    return {
      markdown: {
        serialize(state, node) {
          const title = node.attrs.type ? ` "${node.attrs.type}"` : "";
          state.write(
            `[${escapeRecordRefLabel(node.attrs.label)}](/records/${node.attrs.id}${title})`,
          );
        },
        parse: {
          // markdown-it already renders the link as <a>; parseHTML picks it up.
        },
      } satisfies MarkdownNodeSpec,
    };
  },
});
