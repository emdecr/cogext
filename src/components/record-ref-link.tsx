// ============================================================================
// RECORD REF LINK
// ============================================================================
//
// Renders an inline `/records/<id>` link (emitted by reflections in Phase 2)
// as a normal link that ALSO shows a hover-card preview of the record. The
// preview is fetched from GET /api/records/[id] on hover-intent and cached at
// module scope, so repeat hovers — and multiple links to the same record — are
// free for the lifetime of the page.
//
// The link itself still navigates to the record (page or intercepting modal),
// so the popover is a pure enhancement: no hover, no behavior lost.
// ============================================================================

"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import * as HoverCard from "@radix-ui/react-hover-card";

type RecordPreview = {
  id: string;
  type: string;
  title: string | null;
  excerpt: string;
  imagePath: string | null;
  sourceAuthor: string | null;
  tags: string[];
};

// Module-level cache keyed by record id. Stores the in-flight promise so two
// links to the same record share one request. Lives for the page's lifetime.
const previewCache = new Map<string, Promise<RecordPreview | null>>();

function fetchPreview(id: string): Promise<RecordPreview | null> {
  const cached = previewCache.get(id);
  if (cached) return cached;

  const promise = fetch(`/api/records/${id}`)
    .then((res) => (res.ok ? (res.json() as Promise<RecordPreview>) : null))
    .catch(() => null);

  previewCache.set(id, promise);
  return promise;
}

type LoadState = "idle" | "loading" | "loaded" | "error";

export default function RecordRefLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  // href is always "/records/<id>" (guaranteed by the caller). Pull the id out
  // defensively in case of a trailing slash/query/hash.
  const id = href.replace(/^\/records\//, "").split(/[/?#]/)[0];

  const [preview, setPreview] = useState<RecordPreview | null>(null);
  const [state, setState] = useState<LoadState>("idle");

  // Fetch on hover-intent (the first time the card opens). HoverCard's openDelay
  // means we don't fire on an incidental pass-over.
  const load = useCallback(() => {
    if (state !== "idle") return;
    setState("loading");
    fetchPreview(id).then((p) => {
      if (p) {
        setPreview(p);
        setState("loaded");
      } else {
        setState("error");
      }
    });
  }, [id, state]);

  return (
    <HoverCard.Root
      openDelay={120}
      closeDelay={80}
      onOpenChange={(open) => {
        if (open) load();
      }}
    >
      <HoverCard.Trigger asChild>
        <Link
          href={href}
          className="text-violet-600 underline decoration-violet-300 underline-offset-2 transition-colors hover:decoration-violet-500 dark:text-violet-400 dark:decoration-violet-700"
        >
          {children}
        </Link>
      </HoverCard.Trigger>

      <HoverCard.Portal>
        <HoverCard.Content
          side="top"
          align="start"
          sideOffset={6}
          collisionPadding={12}
          className="z-50 w-72 rounded-lg border border-gray-200 bg-white p-3 text-left shadow-lg animate-[popoverIn_120ms_ease-out] focus:outline-none dark:border-gray-700 dark:bg-gray-900"
        >
          {state === "loaded" && preview ? (
            <div className="space-y-2">
              {preview.imagePath && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={preview.imagePath}
                  alt={preview.title ?? ""}
                  className="h-28 w-full rounded border border-gray-100 object-cover dark:border-gray-800"
                />
              )}
              <div className="flex items-center gap-2">
                <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium capitalize text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                  {preview.type}
                </span>
                {preview.title && (
                  <span className="truncate text-sm font-semibold text-gray-900 dark:text-gray-100">
                    {preview.title}
                  </span>
                )}
              </div>
              {preview.excerpt && (
                <p className="line-clamp-3 text-xs leading-5 text-gray-600 dark:text-gray-400">
                  {preview.excerpt}
                </p>
              )}
              {preview.sourceAuthor && (
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  — {preview.sourceAuthor}
                </p>
              )}
              {preview.tags.length > 0 && (
                <p className="truncate text-[11px] text-gray-400 dark:text-gray-500">
                  {preview.tags.map((t) => `#${t}`).join(" ")}
                </p>
              )}
            </div>
          ) : state === "error" ? (
            <p className="text-xs text-gray-400">Preview unavailable</p>
          ) : (
            <p className="text-xs text-gray-400">Loading…</p>
          )}
          <HoverCard.Arrow className="fill-white dark:fill-gray-900" />
        </HoverCard.Content>
      </HoverCard.Portal>
    </HoverCard.Root>
  );
}
