// ============================================================================
// ADMIN — DATA TAB
// ============================================================================
//
// Server component. Shows:
//   - warnings for background AI work that failed silently (records with no
//     embedding or no tags) and embeddings from an older model
//   - records by type, and totals for the other content tables
//   - which models produced the stored embeddings, vs the current EMBED_MODEL
//   - the newest problem records, linked so they can be fixed
//   - when reflections and the AI profile last ran
// Instance-wide (all users). See src/lib/actions/admin/data.ts.
// ============================================================================

import Link from "next/link";
import { requireAdmin } from "@/lib/auth/admin";
import { getDataOverview, type RecordRef } from "@/lib/actions/admin/data";
import { percentOf } from "@/lib/data-health";
import { Badge, When, TabHeading, card, cardTitle, muted, tone } from "../ui";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className={muted}>{label}</dt>
      <dd className="text-right text-sm text-gray-900 dark:text-gray-100">
        {children}
      </dd>
    </div>
  );
}

function ProblemList({
  title,
  items,
  total,
  now,
}: {
  title: string;
  items: RecordRef[];
  total: number;
  now: Date;
}) {
  if (items.length === 0) return null;
  return (
    <div className={card}>
      <h3 className={cardTitle}>
        {title}
        {total > items.length && (
          <span className="normal-case tracking-normal">
            {" "}
            · newest {items.length} of {total}
          </span>
        )}
      </h3>
      <ul className="mt-2 space-y-1.5 text-sm">
        {items.map((r) => (
          <li key={r.id} className="flex items-baseline justify-between gap-3">
            <Link
              href={`/records/${r.id}`}
              className="min-w-0 truncate text-gray-900 underline decoration-gray-300 underline-offset-2 hover:decoration-gray-500 dark:text-gray-100 dark:decoration-gray-600"
            >
              {r.title || <span className={muted}>Untitled {r.type}</span>}
            </Link>
            <span className={`shrink-0 text-xs ${muted}`}>
              {r.type} · <When iso={r.createdAt} now={now} />
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

const MODEL_STATUS = {
  current: { label: "current", color: "green" },
  stale: { label: "older model", color: "amber" },
  unlabeled: { label: "unknown model", color: "gray" },
} as const;

export default async function AdminDataPage() {
  await requireAdmin();
  const d = await getDataOverview();
  const now = new Date(d.generatedAt);
  const { records: r } = d;

  return (
    <section>
      <TabHeading slug="data" />

      {d.warnings.length > 0 && (
        <ul className="mt-4 space-y-2">
          {d.warnings.map((w) => (
            <li
              key={w.message}
              role={w.level === "error" ? "alert" : undefined}
              className={`rounded-md px-3 py-2 text-sm ${
                w.level === "error" ? tone.red : tone.amber
              }`}
            >
              {w.message}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
        {/* ---- Records ---- */}
        <div className={card}>
          <h3 className={cardTitle}>Records</h3>
          <div className="mt-1 text-2xl font-semibold text-gray-900 dark:text-gray-100">
            {r.total}
          </div>
          <dl className="mt-3 space-y-1.5">
            {r.byType.map((t) => (
              <Row key={t.type} label={t.type}>
                {t.count}
                <span className={`ml-2 text-xs ${muted}`}>
                  {percentOf(t.count, r.total)}
                </span>
              </Row>
            ))}
          </dl>
        </div>

        {/* ---- Health ---- */}
        <div className={card}>
          <h3 className={cardTitle}>Health</h3>
          <dl className="mt-3 space-y-1.5">
            <Row label="No embedding">
              {r.missingEmbedding > 0 ? (
                <Badge color="red">{r.missingEmbedding}</Badge>
              ) : (
                0
              )}
            </Row>
            <Row label="No tags">
              {r.untagged > 0 ? <Badge color="amber">{r.untagged}</Badge> : 0}
            </Row>
            <Row label="Last record saved">
              {r.lastSavedAt ? <When iso={r.lastSavedAt} now={now} /> : "never"}
            </Row>
            <Row label="Last reflection">
              {d.lastReflectionAt ? (
                <When iso={d.lastReflectionAt} now={now} />
              ) : (
                "never"
              )}
            </Row>
            <Row label="AI profile updated">
              {d.lastProfileUpdateAt ? (
                <When iso={d.lastProfileUpdateAt} now={now} />
              ) : (
                "never"
              )}
            </Row>
          </dl>
        </div>

        {/* ---- Everything else ---- */}
        <div className={card}>
          <h3 className={cardTitle}>Other content</h3>
          <dl className="mt-3 space-y-1.5">
            <Row label="Tags">{d.totals.tags}</Row>
            <Row label="Collections">{d.totals.collections}</Row>
            <Row label="Record links">{d.totals.links}</Row>
            <Row label="Conversations">{d.totals.conversations}</Row>
            <Row label="Chat messages">{d.totals.messages}</Row>
            <Row label="Reflections">{d.totals.reflections}</Row>
          </dl>
        </div>
      </div>

      {/* ---- Embedding models ---- */}
      <div className={`${card} mt-4`}>
        <h3 className={cardTitle}>Embeddings by model</h3>
        <p className={`mt-1 text-xs ${muted}`}>
          Current model: <code>{d.currentEmbedModel}</code>. Vectors from
          different models aren&apos;t comparable, so older ones rank poorly in
          search.
        </p>
        {d.embeddingModels.length === 0 ? (
          <p className={`mt-2 ${muted}`}>No embedded records yet.</p>
        ) : (
          <dl className="mt-3 space-y-1.5">
            {d.embeddingModels.map((m) => {
              const s = MODEL_STATUS[m.status];
              return (
                <div key={m.model ?? "unlabeled"} className="flex items-center justify-between gap-3">
                  <dt className="min-w-0 truncate font-mono text-xs text-gray-900 dark:text-gray-100">
                    {m.model ?? "(not recorded)"}{" "}
                    <Badge color={s.color}>{s.label}</Badge>
                  </dt>
                  <dd className="text-sm text-gray-900 dark:text-gray-100">
                    {m.count}
                    <span className={`ml-2 text-xs ${muted}`}>
                      {percentOf(m.count, r.total)}
                    </span>
                  </dd>
                </div>
              );
            })}
          </dl>
        )}
      </div>

      {/* ---- Problem records ---- */}
      {(d.recentMissingEmbedding.length > 0 || d.recentUntagged.length > 0) && (
        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
          <ProblemList
            title="Missing an embedding"
            items={d.recentMissingEmbedding}
            total={r.missingEmbedding}
            now={now}
          />
          <ProblemList
            title="No tags"
            items={d.recentUntagged}
            total={r.untagged}
            now={now}
          />
        </div>
      )}

      {/* ---- Maintenance ---- */}
      <div className={`${card} mt-4`}>
        <h3 className={cardTitle}>Maintenance</h3>
        <ul className={`mt-2 list-disc space-y-1.5 pl-5 ${muted}`}>
          <li>
            <span className="text-gray-900 dark:text-gray-100">
              Fill in missing embeddings:
            </span>{" "}
            run <code>scripts/re-embed-all.ts</code> (see its header for local
            and prod usage). It only embeds records that have none. Records on
            an older model need their embedding cleared first.
          </li>
          <li>
            <span className="text-gray-900 dark:text-gray-100">Export:</span>{" "}
            not built yet. See <code>plans/2026-09-05-export.md</code>.
          </li>
        </ul>
      </div>
    </section>
  );
}
