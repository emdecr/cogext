// ============================================================================
// ADMIN — AI SPEND TAB
// ============================================================================
//
// Server component. Estimated LLM token spend over a window (?window=7d|30d|
// all): a headline total, spend by feature as a ranked bar list (the job is
// "which parts of the app cost what, and how much"), and a per-model table.
// Instance-wide (all users). Cost is derived at read time from token counts
// (src/lib/ai/pricing.ts), so changing a price re-prices history.
//
// Chart: one series, so one hue — magnitude is bar length, not color
// (validated: #2a78d6 light / #3987e5 dark, ≥3:1 on both card surfaces).
// Every value is printed beside its bar, so the list doubles as the table.
// ============================================================================

import Link from "next/link";
import { requireAdmin } from "@/lib/auth/admin";
import { getAiSpend } from "@/lib/actions/admin/ai-spend";
import {
  SPEND_WINDOWS,
  WINDOW_LABELS,
  barPercent,
  displayUsd,
  formatTokens,
  parseSpendWindow,
  type SpendLine,
} from "@/lib/ai-spend";
import { formatUsd } from "@/lib/ai/pricing";
import { percentOf } from "@/lib/data-health";
import { Badge, TabHeading, card, cardTitle, muted, tone, When } from "../ui";

const FEATURE_LABELS: Record<string, string> = {
  chat: "Chat",
  reflection: "Weekly reflections",
  recommendation: "Recommendations",
  image_analysis: "Image analysis",
  profile: "AI profile",
  tagging: "Auto-tagging",
};

const pill =
  "whitespace-nowrap rounded-full px-3 py-1 text-xs font-medium transition-colors";

function lineDetail(l: SpendLine): string {
  const parts = [
    `${l.calls} call${l.calls === 1 ? "" : "s"}`,
    `${formatTokens(l.inputTokens)} in`,
    `${formatTokens(l.outputTokens)} out`,
  ];
  if (l.unpricedCalls > 0) parts.push(`${l.unpricedCalls} unpriced`);
  return parts.join(" · ");
}

// One rule everywhere: a line whose calls are ALL unpriced shows "unpriced",
// never "$0.00" (see displayUsd).
function Cost({ line }: { line: SpendLine }) {
  const usd = displayUsd(line);
  return usd === null ? <Badge color="amber">unpriced</Badge> : <>{formatUsd(usd)}</>;
}

function FeatureBars({ lines, total }: { lines: SpendLine[]; total: number }) {
  const max = Math.max(...lines.map((l) => l.usd), 0);
  return (
    <ul className="mt-3 space-y-3">
      {lines.map((l) => {
        const label = FEATURE_LABELS[l.key] ?? l.key;
        return (
          <li key={l.key} title={`${label}: ${formatUsd(displayUsd(l))} · ${lineDetail(l)}`}>
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="text-gray-900 dark:text-gray-100">{label}</span>
              <span className="whitespace-nowrap tabular-nums text-gray-900 dark:text-gray-100">
                <Cost line={l} />
                {displayUsd(l) !== null && (
                  <span className={`ml-2 text-xs ${muted}`}>{percentOf(l.usd, total)}</span>
                )}
              </span>
            </div>
            {/* Bar: anchored at the left baseline, 4px rounded data end only. */}
            <div className="mt-1 h-2" aria-hidden="true">
              <div
                className="h-2 rounded-r-[4px] bg-[#2a78d6] dark:bg-[#3987e5]"
                style={{ width: `${barPercent(l.usd, max)}%` }}
              />
            </div>
            <div className={`mt-1 text-xs ${muted}`}>{lineDetail(l)}</div>
          </li>
        );
      })}
    </ul>
  );
}

export default async function AdminAiSpendPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdmin();
  const window = parseSpendWindow((await searchParams).window);
  const s = await getAiSpend(window);
  const now = new Date(s.generatedAt);
  const loggedFeatures = new Set(s.byFeature.map((l) => l.key));

  return (
    <section>
      <TabHeading slug="ai-spend" />

      {/* ---- Window ---- */}
      <nav aria-label="Time window" className="mt-4 flex flex-wrap gap-2">
        {SPEND_WINDOWS.map((w) => {
          const active = s.window === w;
          return (
            <Link
              key={w}
              href={w === "30d" ? "/admin/ai-spend" : `/admin/ai-spend?window=${w}`}
              aria-current={active ? "page" : undefined}
              className={`${pill} ${
                active
                  ? "bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900"
                  : `${tone.gray} hover:bg-gray-200 dark:hover:bg-gray-700`
              }`}
            >
              {WINDOW_LABELS[w]}
            </Link>
          );
        })}
      </nav>

      {s.total.calls === 0 ? (
        <div className={`${card} mt-4`}>
          <p className={muted}>
            No AI calls recorded in this window.
            {s.window !== "all" && (
              <>
                {" "}
                <Link href="/admin/ai-spend?window=all" className="underline underline-offset-2">
                  See all time
                </Link>
                .
              </>
            )}
          </p>
        </div>
      ) : (
        <>
          {/* ---- Headline ---- */}
          <div className={`${card} mt-4`}>
            <h3 className={cardTitle}>Estimated LLM spend · {WINDOW_LABELS[s.window]}</h3>
            <div className="mt-1 text-3xl font-semibold tabular-nums text-gray-900 dark:text-gray-100">
              <Cost line={s.total} />
            </div>
            <p className={`mt-1 text-xs ${muted}`}>
              {lineDetail(s.total)}
              {s.window === "all" && s.firstRecordedAt && (
                <>
                  {" "}
                  · since <When iso={s.firstRecordedAt} now={now} />
                </>
              )}
            </p>
          </div>

          {/* ---- By feature ---- */}
          <div className={`${card} mt-4`}>
            <h3 className={cardTitle}>Spend by feature</h3>
            <FeatureBars lines={s.byFeature} total={s.total.usd} />
          </div>

          {/* ---- By model ---- */}
          <div className={`${card} mt-4 overflow-x-auto p-0`}>
            <h3 className={`${cardTitle} px-4 pt-4`}>By model</h3>
            <table className="mt-2 w-full text-left text-sm">
              <thead className={muted}>
                <tr className="border-b border-gray-200 dark:border-gray-800">
                  <th className="px-4 py-2 font-medium">Model</th>
                  <th className="px-4 py-2 text-right font-medium">Calls</th>
                  <th className="px-4 py-2 text-right font-medium">Input</th>
                  <th className="px-4 py-2 text-right font-medium">Output</th>
                  <th className="px-4 py-2 text-right font-medium">Est. cost</th>
                </tr>
              </thead>
              <tbody className="tabular-nums text-gray-900 dark:text-gray-100">
                {s.byModel.map((m) => (
                  <tr
                    key={m.key}
                    className="border-b border-gray-100 last:border-0 dark:border-gray-800/60"
                  >
                    <td className="whitespace-nowrap px-4 py-2 font-mono text-xs">{m.key}</td>
                    <td className="px-4 py-2 text-right">{m.calls}</td>
                    <td className="px-4 py-2 text-right">{formatTokens(m.inputTokens)}</td>
                    <td className="px-4 py-2 text-right">{formatTokens(m.outputTokens)}</td>
                    <td className="whitespace-nowrap px-4 py-2 text-right">
                      <Cost line={m} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ---- What this covers ---- */}
      <ul className={`mt-4 list-disc space-y-1 pl-5 text-xs ${muted}`}>
        <li>
          Estimates from token counts × Anthropic list prices as of {s.pricesAsOf}{" "}
          (<code>src/lib/ai/pricing.ts</code>). Prompt-cache discounts and web
          search fees on recommendations aren&apos;t included.
        </li>
        {!loggedFeatures.has("tagging") && (
          <li>Auto-tagging calls aren&apos;t logged yet, so they&apos;re missing here.</li>
        )}
        <li>Embeddings (Voyage) aren&apos;t logged yet, so they&apos;re not included.</li>
        <li>All users combined.</li>
      </ul>
    </section>
  );
}
