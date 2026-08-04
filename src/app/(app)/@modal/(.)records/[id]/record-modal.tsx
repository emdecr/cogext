// ============================================================================
// RECORD MODAL (intercepting-route client wrapper)
// ============================================================================
//
// Renders RecordDetail inside a Radix Dialog for the intercepted
// /records/[id] navigation. The Dialog starts open; closing it (Esc, overlay
// click, or the ✕ button) navigates back, which unmounts the intercepting
// route and returns to the page underneath.
//
// RecordDetail is Dialog-agnostic, so we supply the accessible title here
// (visually hidden) and pass `onClose` to wire its close button to router.back.
// ============================================================================

"use client";

import { useRouter } from "next/navigation";
import * as Dialog from "@radix-ui/react-dialog";
import RecordDetail from "@/components/record-detail";

type Tag = {
  id: string;
  name: string;
  isAi: boolean;
};

type RecordWithTags = {
  id: string;
  type: "image" | "quote" | "article" | "link" | "note";
  title: string | null;
  content: string;
  sourceUrl: string | null;
  sourceAuthor: string | null;
  imagePath: string | null;
  note: string | null;
  createdAt: Date;
  recordTags: { tag: Tag }[];
};

export default function RecordModal({ record }: { record: RecordWithTags }) {
  const router = useRouter();

  // Any close intent (Esc / overlay / ✕) navigates back to the underlying page.
  function handleOpenChange(open: boolean) {
    if (!open) router.back();
  }

  return (
    <Dialog.Root open onOpenChange={handleOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50 animate-[fadeIn_150ms_ease-out]" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 flex h-[90vh] w-[90vw] max-w-6xl -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-xl bg-white shadow-xl focus:outline-none animate-[scaleFadeIn_200ms_ease-out] dark:bg-gray-900">
          {/* Accessible title required by Radix Dialog; visually hidden since
              RecordDetail renders its own visible "Record Details" heading. */}
          <Dialog.Title asChild>
            <span className="sr-only">Record Details</span>
          </Dialog.Title>
          <RecordDetail record={record} onClose={() => router.back()} />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
