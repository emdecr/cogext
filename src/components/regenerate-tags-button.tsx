// ============================================================================
// REGENERATE TAGS BUTTON
// ============================================================================
//
// Small text button beside a record's "Tags" label that re-runs AI tagging
// (regenerateTags). The retry for when background auto-tagging failed on
// save. New tags are added; existing ones stay. Shows the outcome inline.
// ============================================================================

"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { regenerateTags } from "@/lib/actions/tags";

export default function RegenerateTagsButton({ recordId }: { recordId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ text: string; isError: boolean } | null>(null);

  function handleClick() {
    setMessage(null);
    startTransition(async () => {
      const result = await regenerateTags(recordId);
      if (result.success) {
        const n = result.tags.length;
        setMessage({ text: `Added ${n} tag${n === 1 ? "" : "s"}`, isError: false });
        router.refresh();
      } else {
        setMessage({ text: result.error, isError: true });
      }
    });
  }

  return (
    <span className="flex items-center gap-2 text-xs">
      {message && (
        <span
          role={message.isError ? "alert" : "status"}
          className={
            message.isError
              ? "text-red-600 dark:text-red-400"
              : "text-gray-500 dark:text-gray-400"
          }
        >
          {message.text}
        </span>
      )}
      <button
        type="button"
        onClick={handleClick}
        disabled={isPending}
        className="font-medium text-blue-500 hover:underline disabled:cursor-wait disabled:opacity-60 dark:text-blue-400"
      >
        {isPending ? "Generating…" : "Generate tags"}
      </button>
    </span>
  );
}
