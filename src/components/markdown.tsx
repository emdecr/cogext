// ============================================================================
// MARKDOWN
// ============================================================================
//
// One shared wrapper around react-markdown so every surface that renders
// markdown — chat replies, weekly reflections, and (as of the WYSIWYG work)
// record content/notes — goes through the same path and stays visually
// consistent.
//
// Design notes:
//   - The wrapper owns the `prose` container div AND the <Markdown> call, so
//     call sites shrink to `<Markdown className="...">{content}</Markdown>`.
//   - `className` sets the Tailwind Typography flavor. Each surface passes its
//     own (chat uses prose-sm, reflections adds heading/blockquote tweaks);
//     the default is a sensible base used by the record detail view.
//   - By default, links to `/records/<uuid>` render as record chips with a
//     hover preview (RecordRefLink) — these are what the editor's `[[` picker
//     inserts (plans/2026-10-28-inline-record-links.md). Other links render
//     as plain anchors.
//   - `components` is merged over that default. The reflection view overrides
//     `a` to keep its inline citation style and open external links in a new
//     tab — see plans/2026-07-24-record-urls-and-reflection-refs.md (Phase 3).
//   - SECURITY: no `rehype-raw`. react-markdown does not render embedded raw
//     HTML by default, which is what keeps user-authored markdown safe to
//     render. Do not add it. (See plans/2026-09-05-wysiwyg-editor.md, Chunk 6.)
// ============================================================================

import ReactMarkdown, { type Components } from "react-markdown";
import RecordRefLink from "@/components/record-ref-link";
import { isRecordType, parseRecordRefHref } from "@/lib/record-ref";

type Props = {
  children: string;
  // Tailwind classes for the prose container. Defaults to a base flavor; chat
  // and reflections override with their own.
  className?: string;
  // Element overrides passed to react-markdown (e.g. custom <a> rendering).
  components?: Components;
};

const defaultComponents: Components = {
  a({ href, title, children }) {
    if (parseRecordRefHref(href)) {
      return (
        <RecordRefLink href={href!} variant="chip" type={isRecordType(title) ? title : null}>
          {children}
        </RecordRefLink>
      );
    }
    return (
      <a href={href} title={title}>
        {children}
      </a>
    );
  },
};

// Base flavor used when a call site doesn't pass its own (e.g. record detail).
const DEFAULT_CLASS =
  "prose prose-gray dark:prose-invert max-w-none " +
  "[&>*:first-child]:mt-0 [&>*:last-child]:mb-0";

export default function Markdown({ children, className, components }: Props) {
  return (
    <div className={className ?? DEFAULT_CLASS}>
      <ReactMarkdown components={{ ...defaultComponents, ...components }}>
        {children}
      </ReactMarkdown>
    </div>
  );
}
