// ============================================================================
// ADMIN — RETAG UNTAGGED RECORDS BUTTON
// ============================================================================
//
// Runs retagUntaggedRecords() one batch per click. Remembers the ids that
// failed during this visit and sends them back, so the next click moves on
// to records it hasn't tried instead of retrying the same failures first.
// ============================================================================

"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { retagUntaggedRecords } from "@/lib/actions/admin/maintenance";

export default function RetagButton() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [failedIds, setFailedIds] = useState<string[]>([]);
  const [message, setMessage] = useState<{ text: string; isError: boolean } | null>(null);

  function handleClick() {
    setMessage(null);
    startTransition(async () => {
      const result = await retagUntaggedRecords(failedIds);
      if (!result.success) {
        setMessage({ text: result.error, isError: true });
        return;
      }
      const allFailed = [...failedIds, ...result.failedIds];
      setFailedIds(allFailed);
      if (result.tagged === 0 && result.failedIds.length === 0 && result.remaining > 0) {
        setMessage({
          text: `All ${result.remaining} untagged records failed this visit. Reload the page to retry them.`,
          isError: true,
        });
        return;
      }
      const parts = [`Tagged ${result.tagged}`];
      if (result.failedIds.length > 0) parts.push(`${result.failedIds.length} failed`);
      parts.push(`${result.remaining} still untagged`);
      setMessage({ text: parts.join(" · "), isError: result.failedIds.length > 0 });
      router.refresh();
    });
  }

  return (
    <div className="mt-3 flex flex-wrap items-center gap-3">
      <button
        type="button"
        onClick={handleClick}
        disabled={isPending}
        className="rounded-md bg-gray-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-gray-700 disabled:cursor-wait disabled:opacity-60 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-gray-300"
      >
        {isPending ? "Tagging…" : "Retag next 10"}
      </button>
      {message && (
        <span
          role={message.isError ? "alert" : "status"}
          className={`text-xs ${
            message.isError
              ? "text-amber-700 dark:text-amber-400"
              : "text-gray-500 dark:text-gray-400"
          }`}
        >
          {message.text}
        </span>
      )}
    </div>
  );
}
