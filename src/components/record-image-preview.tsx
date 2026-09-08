// ============================================================================
// RECORD IMAGE PREVIEW
// ============================================================================
//
// Wraps a search-result row so that hovering ANYWHERE on the row pops a larger
// preview of the record's image. Used in the ⌘K command palette and the add-
// connection picker, where a 40px inline crop alone often isn't enough to tell
// one image record from another.
//
// The row itself (a Link or a button) is the hover trigger via Radix's
// `asChild`, so the whole row is the target — not just the little thumbnail.
// When `src` is null (non-image records) the children render untouched, no
// hover card. The image URL is already in hand, so there's no fetch. z-index
// sits above the command palette (z-50) and the connection dialog (z-[60]).
// ============================================================================

"use client";

import * as HoverCard from "@radix-ui/react-hover-card";

export default function RecordImagePreview({
  src,
  alt = "",
  side = "left",
  children,
}: {
  src: string | null;
  alt?: string;
  side?: "top" | "right" | "bottom" | "left";
  children: React.ReactNode;
}) {
  if (!src) return <>{children}</>;

  return (
    <HoverCard.Root openDelay={120} closeDelay={80}>
      <HoverCard.Trigger asChild>{children}</HoverCard.Trigger>
      <HoverCard.Portal>
        <HoverCard.Content
          side={side}
          align="start"
          sideOffset={8}
          collisionPadding={12}
          className="z-[70] rounded-lg border border-gray-200 bg-white p-1.5 shadow-lg animate-[popoverIn_120ms_ease-out] focus:outline-none dark:border-gray-700 dark:bg-gray-900"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={src}
            alt={alt}
            className="max-h-72 max-w-72 rounded object-contain"
          />
          <HoverCard.Arrow className="fill-white dark:fill-gray-900" />
        </HoverCard.Content>
      </HoverCard.Portal>
    </HoverCard.Root>
  );
}
