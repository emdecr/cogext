// ============================================================================
// ADMIN — SYSTEM TAB
// ============================================================================
//
// Server component. Shows:
//   - dependency readiness (same checks as /api/health/ready, in-process)
//   - runtime: deployed commit, uptime, Node version
//   - which AI model runs which feature, where the value came from, and the
//     model each feature last actually used (from ai_usage)
//   - storage config and the in-memory rate limiter caveat
// Names only — never keys. See src/lib/actions/admin/system.ts.
// ============================================================================

import Link from "next/link";
import { requireAdmin } from "@/lib/auth/admin";
import { getSystemOverview } from "@/lib/actions/admin/system";
import type { CheckResult, CheckStatus } from "@/lib/health";
import {
  commitUrl,
  compareLastUsed,
  formatUptime,
  shortSha,
} from "@/lib/system-info";
import { Badge, When, TabHeading, card, cardTitle, muted, type Tone } from "../ui";

const STATUS: Record<CheckStatus, { label: string; color: Tone }> = {
  ok: { label: "OK", color: "green" },
  degraded: { label: "Degraded", color: "amber" },
  error: { label: "Down", color: "red" },
};

const PROVIDER_LABEL = { claude: "Claude", voyage: "Voyage AI", ollama: "Ollama" };

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className={muted}>{label}</dt>
      <dd className="min-w-0 truncate text-right text-sm text-gray-900 dark:text-gray-100">
        {children}
      </dd>
    </div>
  );
}

function CheckRow({ label, check }: { label: string; check: CheckResult }) {
  const s = STATUS[check.status];
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className={muted}>{label}</dt>
      <dd className="text-right text-sm text-gray-900 dark:text-gray-100">
        <Badge color={s.color}>{s.label}</Badge>
        {check.latencyMs !== undefined && (
          <span className={`ml-2 ${muted}`}>{check.latencyMs} ms</span>
        )}
        {check.note && <div className={`mt-0.5 text-xs ${muted}`}>{check.note}</div>}
      </dd>
    </div>
  );
}

export default async function AdminSystemPage() {
  await requireAdmin();
  const o = await getSystemOverview();
  const now = new Date(o.generatedAt);
  const overall = STATUS[o.readiness.status];
  const sha = o.runtime.gitSha;
  const link = commitUrl(o.runtime.gitRepository, sha);

  return (
    <section>
      <TabHeading slug="system" />

      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
        {/* ---- Readiness ---- */}
        <div className={card}>
          <div className="flex items-center justify-between gap-2">
            <h3 className={cardTitle}>Readiness</h3>
            <Badge color={overall.color}>{overall.label}</Badge>
          </div>
          <dl className="mt-3 space-y-2">
            <CheckRow label="Database" check={o.readiness.checks.database} />
            <CheckRow label="Storage" check={o.readiness.checks.storage} />
          </dl>
        </div>

        {/* ---- Runtime ---- */}
        <div className={card}>
          <h3 className={cardTitle}>Runtime</h3>
          <dl className="mt-3 space-y-1.5">
            <Row label="Version">
              {link ? (
                <a
                  href={link}
                  target="_blank"
                  rel="noreferrer"
                  className="font-mono underline decoration-gray-300 underline-offset-2 hover:decoration-gray-500 dark:decoration-gray-600"
                >
                  {shortSha(sha)}
                </a>
              ) : (
                <span className="font-mono">{shortSha(sha)}</span>
              )}
            </Row>
            <Row label="Uptime">
              <span title={`Started ${new Date(now.getTime() - o.runtime.uptimeSeconds * 1000).toISOString()}`}>
                {formatUptime(o.runtime.uptimeSeconds)}
              </span>
            </Row>
            <Row label="Node">{o.runtime.nodeVersion}</Row>
            <Row label="Environment">{o.runtime.nodeEnv}</Row>
            <Row label="Storage">
              {o.storage.provider === "minio"
                ? `MinIO · ${o.storage.bucket}`
                : "Local (public/uploads)"}
            </Row>
          </dl>
        </div>
      </div>

      {/* ---- AI models by feature ---- */}
      <div className={`${card} mt-4 overflow-x-auto p-0`}>
        <div className="px-4 pt-4">
          <h3 className={cardTitle}>AI models by feature</h3>
          <p className={`mt-1 text-xs ${muted}`}>
            &ldquo;Last used&rdquo; is the newest <code>ai_usage</code> row for
            the feature. A different model there usually means the container
            hasn&apos;t picked up an env change yet.
          </p>
        </div>
        <table className="mt-2 w-full text-left text-sm">
          <thead className={muted}>
            <tr className="border-b border-gray-200 dark:border-gray-800">
              <th className="px-4 py-2 font-medium">Feature</th>
              <th className="px-4 py-2 font-medium">Model</th>
              <th className="px-4 py-2 font-medium">Set by</th>
              <th className="px-4 py-2 font-medium">Last used</th>
            </tr>
          </thead>
          <tbody className="text-gray-900 dark:text-gray-100">
            {o.models.map((m) => {
              const cmp = compareLastUsed(m.model, m.lastUsed?.model ?? null);
              return (
                <tr
                  key={m.feature}
                  className="border-b border-gray-100 align-top last:border-0 dark:border-gray-800/60"
                >
                  <td className="whitespace-nowrap px-4 py-2">
                    {m.label}
                    <div className={`text-xs ${muted}`}>
                      {PROVIDER_LABEL[m.provider]}
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-4 py-2 font-mono text-xs">
                    {m.model}
                    {m.note && (
                      <div className={`font-sans ${muted} text-xs`}>{m.note}</div>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2">
                    <code className="text-xs">{m.setting}</code>
                    <div className={`text-xs ${muted}`}>
                      {m.source === "env" ? ".env" : "code default"}
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-4 py-2 text-xs">
                    {!o.lastUsedAvailable ? (
                      <span className={muted}>unknown</span>
                    ) : cmp === "none" ? (
                      <span className={muted}>
                        never
                      </span>
                    ) : (
                      <>
                        {cmp === "mismatch" ? (
                          <Badge color="amber">{m.lastUsed!.model}</Badge>
                        ) : (
                          <span className="font-mono">{m.lastUsed!.model}</span>
                        )}
                        <div className={muted}>
                          <When iso={m.lastUsed!.at} now={now} />
                        </div>
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ---- Caveats ---- */}
      <p className={`mt-4 ${muted}`}>
        Rate limits are kept in memory, so they reset whenever the app
        restarts (uptime above). Model defaults live in{" "}
        <code>src/lib/ai/models.ts</code>; their env vars are read in{" "}
        <code>src/lib/config.ts</code>. Per-record embedding models are on the{" "}
        <Link href="/admin/data" className="underline underline-offset-2">
          Data tab
        </Link>
        .
      </p>
    </section>
  );
}
