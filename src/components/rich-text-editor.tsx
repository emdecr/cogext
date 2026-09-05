// ============================================================================
// RICH TEXT EDITOR (Tiptap internals)
// ============================================================================
//
// The Tiptap-heavy half of the WYSIWYG editing surface. Kept in its own file so
// it can be lazy-loaded (next/dynamic, ssr:false) by rich-text-dialog.tsx —
// none of the ProseMirror/Tiptap bundle reaches the forms or initial route.
//
// Markdown is the source of truth:
//   - `initialValue` is a markdown string; the tiptap-markdown extension parses
//     it into the editor doc on creation.
//   - We serialize back to markdown (editor.storage.markdown.getMarkdown()) on
//     every change and on ready, so the dialog only ever deals in markdown.
//   - `html: false` on the Markdown extension means the serializer emits pure
//     markdown, never embedded HTML — see the security note in the dialog.
//
// StarterKit v3 already bundles bold/italic/strike/code, headings, lists,
// blockquote, link, underline, and undo/redo, so the MVP toolbar needs no extra
// extensions. (Placeholder, link-editing UI, etc. are Phase 2.)
// ============================================================================

"use client";

import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import { type MarkdownStorage } from "tiptap-markdown";
import { richTextExtensions } from "@/components/rich-text-extensions";

// tiptap-markdown adds a `markdown` storage bucket but doesn't augment Tiptap's
// Storage type, so read it through this typed accessor.
function getMarkdown(editor: Editor): string {
  return (editor.storage as unknown as { markdown: MarkdownStorage }).markdown.getMarkdown();
}

type Props = {
  // Markdown seeded into the editor when it mounts.
  initialValue: string;
  // Fires once on creation with the *normalized* markdown of `initialValue`.
  // The dialog uses this as its dirty-check baseline so round-trip
  // normalization (e.g. `*` bullets → `-`) doesn't read as an unsaved edit.
  onReady: (markdown: string) => void;
  // Fires on every change with the current markdown.
  onChange: (markdown: string) => void;
};

// A single toolbar button. `active` reflects the current selection's marks so
// the button can show a pressed state.
function ToolbarButton({
  onClick,
  active = false,
  disabled = false,
  label,
  children,
}: {
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-pressed={active}
      title={label}
      className={`flex h-8 min-w-8 items-center justify-center rounded px-2 text-sm font-medium transition-colors disabled:opacity-40 ${
        active
          ? "bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900"
          : "text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
      }`}
    >
      {children}
    </button>
  );
}

function Toolbar({ editor }: { editor: Editor }) {
  // Prompt-based link entry is intentionally minimal for the MVP; a proper
  // link popover is Phase 2 (see plans/2026-09-05-wysiwyg-editor.md).
  function toggleLink() {
    if (editor.isActive("link")) {
      editor.chain().focus().unsetLink().run();
      return;
    }
    const url = window.prompt("Link URL");
    if (url) editor.chain().focus().setLink({ href: url }).run();
  }

  return (
    <div className="flex flex-wrap items-center gap-0.5 border-b border-gray-200 px-2 py-1.5 dark:border-gray-800">
      <ToolbarButton
        label="Bold"
        active={editor.isActive("bold")}
        onClick={() => editor.chain().focus().toggleBold().run()}
      >
        <strong>B</strong>
      </ToolbarButton>
      <ToolbarButton
        label="Italic"
        active={editor.isActive("italic")}
        onClick={() => editor.chain().focus().toggleItalic().run()}
      >
        <em>I</em>
      </ToolbarButton>

      <span className="mx-1 h-5 w-px bg-gray-200 dark:bg-gray-700" />

      {([1, 2, 3] as const).map((level) => (
        <ToolbarButton
          key={level}
          label={`Heading ${level}`}
          active={editor.isActive("heading", { level })}
          onClick={() => editor.chain().focus().toggleHeading({ level }).run()}
        >
          H{level}
        </ToolbarButton>
      ))}

      <span className="mx-1 h-5 w-px bg-gray-200 dark:bg-gray-700" />

      <ToolbarButton
        label="Bullet list"
        active={editor.isActive("bulletList")}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
      >
        •
      </ToolbarButton>
      <ToolbarButton
        label="Numbered list"
        active={editor.isActive("orderedList")}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
      >
        1.
      </ToolbarButton>
      <ToolbarButton
        label="Quote"
        active={editor.isActive("blockquote")}
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
      >
        &ldquo;
      </ToolbarButton>
      <ToolbarButton
        label="Code"
        active={editor.isActive("code")}
        onClick={() => editor.chain().focus().toggleCode().run()}
      >
        {"</>"}
      </ToolbarButton>
      <ToolbarButton label="Link" active={editor.isActive("link")} onClick={toggleLink}>
        🔗
      </ToolbarButton>

      <span className="mx-1 h-5 w-px bg-gray-200 dark:bg-gray-700" />

      <ToolbarButton
        label="Undo"
        disabled={!editor.can().undo()}
        onClick={() => editor.chain().focus().undo().run()}
      >
        ↶
      </ToolbarButton>
      <ToolbarButton
        label="Redo"
        disabled={!editor.can().redo()}
        onClick={() => editor.chain().focus().redo().run()}
      >
        ↷
      </ToolbarButton>
    </div>
  );
}

export default function RichTextEditor({ initialValue, onReady, onChange }: Props) {
  const editor = useEditor({
    // Client-only (loaded via ssr:false dynamic import), but false is the safe
    // default and avoids any hydration edge case.
    immediatelyRender: false,
    extensions: richTextExtensions,
    content: initialValue, // parsed as markdown thanks to the Markdown extension
    editorProps: {
      attributes: {
        class:
          "prose prose-sm dark:prose-invert max-w-none min-h-[45vh] px-4 py-3 focus:outline-none",
      },
    },
    onCreate: ({ editor }) => onReady(getMarkdown(editor)),
    onUpdate: ({ editor }) => onChange(getMarkdown(editor)),
  });

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {editor && <Toolbar editor={editor} />}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
