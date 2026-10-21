// ============================================================================
// ADMIN — BACKUPS TAB
// ============================================================================
//
// Server component. Shows:
//   - warnings derived from both sources (down / late / failed / stale file)
//   - healthchecks.io status (read-only API key)
//   - the latest backup.sh run, and the latest run that actually wrote a backup
//   - recent run history from backup-history.jsonl
// Each source degrades independently to "not configured" / "unavailable".
// See src/lib/actions/admin/backups.ts and src/lib/backups/.
// ============================================================================

import { requireAdmin } from "@/lib/auth/admin";
import { getBackupOverview } from "@/lib/actions/admin/backups";
import {
  formatBytes,
  type BackupOutcome,
  type BackupRun,
  type HcResult,
} from "@/lib/backups/parse";
import { Badge, When, TabHeading, card, cardTitle, muted, tone, type Tone } from "../ui";

// ---------------------------------------------------------------------------
// Status labels
// ---------------------------------------------------------------------------

const HC_STATUS: Record<string, { label: string; color: Tone }> = {
  up: { label: "Up", color: "green" },
  grace: { label: "Late (grace)", color: "amber" },
  down: { label: "Down", color: "red" },
  paused: { label: "Paused", color: "gray" },
  new: { label: "New (no pings yet)", color: "gray" },
};

const OUTCOME: Record<BackupOutcome, { label: string; color: Tone }> = {
  offsite: { label: "Backed up offsite", color: "green" },
  local: { label: "Local only", color: "amber" },
  skipped: { label: "Skipped (no changes)", color: "gray" },
  failed: { label: "Failed", color: "red" },
};

function OutcomeBadge({ run }: { run: BackupRun }) {
  const o = OUTCOME[run.outcome];
  return (
    <Badge color={o.color}>
      {o.label}
      {run.outcome === "failed" ? ` (exit ${run.exitCode})` : ""}
    </Badge>
  );
}

function NotConfigured({ children }: { children: React.ReactNode }) {
  return <p className={`mt-2 ${muted}`}>{children}</p>;
}

// ---------------------------------------------------------------------------
// Cards
// ---------------------------------------------------------------------------

function HealthchecksCard({ hc, now }: { hc: HcResult; now: Date }) {
  return (
    <div className={card}>
      <h3 className={cardTitle}>healthchecks.io</h3>
      {hc.state === "unconfigured" && (
        <NotConfigured>
          Not configured. Set <code>HEALTHCHECKS_API_KEY</code> (read-only) and{" "}
          <code>HEALTHCHECKS_CHECK_ID</code>. See DEPLOY.md.
        </NotConfigured>
      )}
      {hc.state === "unavailable" && (
        <NotConfigured>Status unavailable ({hc.reason}).</NotConfigured>
      )}
      {hc.state === "ok" && (
        <dl className="mt-2 space-y-1.5 text-sm">
          <div>
            <Badge color={HC_STATUS[hc.check.status]?.color ?? "gray"}>
              {HC_STATUS[hc.check.status]?.label ?? hc.check.status}
            </Badge>
          </div>
          <div className="flex justify-between gap-2">
            <dt className={muted}>Last ping</dt>
            <dd className="text-gray-900 dark:text-gray-100">
              {hc.check.lastPing ? <When iso={hc.check.lastPing} now={now} /> : "never"}
            </dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className={muted}>Next expected</dt>
            <dd className="text-gray-900 dark:text-gray-100">
              {hc.check.nextPing ? <When iso={hc.check.nextPing} now={now} /> : "—"}
            </dd>
          </div>
          {hc.check.schedule && (
            <div className="flex justify-between gap-2">
              <dt className={muted}>Schedule</dt>
              <dd className="font-mono text-xs text-gray-900 dark:text-gray-100">
                {hc.check.schedule}
                {hc.check.tz ? ` (${hc.check.tz})` : ""}
              </dd>
            </div>
          )}
        </dl>
      )}
    </div>
  );
}

function LatestRunCard({ run, now }: { run: BackupRun | null; now: Date }) {
  return (
    <div className={card}>
      <h3 className={cardTitle}>Last run</h3>
      {!run ? (
        <NotConfigured>No run recorded yet.</NotConfigured>
      ) : (
        <dl className="mt-2 space-y-1.5 text-sm">
          <div>
            <OutcomeBadge run={run} />
          </div>
          <div className="flex justify-between gap-2">
            <dt className={muted}>Finished</dt>
            <dd className="text-gray-900 dark:text-gray-100">
              <When iso={run.finishedAt} now={now} />
            </dd>
          </div>
          {run.host && (
            <div className="flex justify-between gap-2">
              <dt className={muted}>Host</dt>
              <dd className="truncate text-gray-900 dark:text-gray-100">{run.host}</dd>
            </div>
          )}
        </dl>
      )}
    </div>
  );
}

function LastWrittenCard({ run, now }: { run: BackupRun | null; now: Date }) {
  return (
    <div className={card}>
      <h3 className={cardTitle}>Last backup written</h3>
      {!run ? (
        <NotConfigured>None in the recorded history.</NotConfigured>
      ) : (
        <dl className="mt-2 space-y-1.5 text-sm">
          <div className="flex justify-between gap-2">
            <dt className={muted}>When</dt>
            <dd className="text-gray-900 dark:text-gray-100">
              <When iso={run.finishedAt} now={now} />
            </dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className={muted}>Database</dt>
            <dd className="text-gray-900 dark:text-gray-100">{formatBytes(run.dbSizeBytes)}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className={muted}>Files (MinIO)</dt>
            <dd className="text-gray-900 dark:text-gray-100">{formatBytes(run.minioSizeBytes)}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className={muted}>Offsite</dt>
            <dd className="truncate text-gray-900 dark:text-gray-100">
              {run.offsiteRemote ?? "not uploaded"}
            </dd>
          </div>
          {run.localBackupsKept !== null && (
            <div className="flex justify-between gap-2">
              <dt className={muted}>Kept locally</dt>
              <dd className="text-gray-900 dark:text-gray-100">{run.localBackupsKept}</dd>
            </div>
          )}
        </dl>
      )}
    </div>
  );
}

function HistoryTable({ history, now }: { history: BackupRun[]; now: Date }) {
  if (history.length === 0) return null;
  return (
    <div className={`${card} mt-4 overflow-x-auto p-0`}>
      <h3 className={`${cardTitle} px-4 pt-4`}>Recent runs</h3>
      <table className="mt-2 w-full text-left text-sm">
        <thead className={muted}>
          <tr className="border-b border-gray-200 dark:border-gray-800">
            <th className="px-4 py-2 font-medium">Finished</th>
            <th className="px-4 py-2 font-medium">Outcome</th>
            <th className="px-4 py-2 text-right font-medium">Database</th>
            <th className="px-4 py-2 text-right font-medium">Files</th>
          </tr>
        </thead>
        <tbody className="text-gray-900 dark:text-gray-100">
          {history.map((run, i) => (
            <tr
              key={`${run.finishedAt}-${i}`}
              className="border-b border-gray-100 last:border-0 dark:border-gray-800/60"
            >
              <td className="whitespace-nowrap px-4 py-2">
                <When iso={run.finishedAt} now={now} />
              </td>
              <td className="whitespace-nowrap px-4 py-2">
                <OutcomeBadge run={run} />
              </td>
              <td className="whitespace-nowrap px-4 py-2 text-right">
                {run.outcome === "local" || run.outcome === "offsite"
                  ? formatBytes(run.dbSizeBytes)
                  : "—"}
              </td>
              <td className="whitespace-nowrap px-4 py-2 text-right">
                {run.outcome === "local" || run.outcome === "offsite"
                  ? formatBytes(run.minioSizeBytes)
                  : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function AdminBackupsPage() {
  await requireAdmin();
  const overview = await getBackupOverview();
  const now = new Date(overview.generatedAt);
  const { hc, file, warnings, lastWritten } = overview;
  const latest = file.state === "ok" ? file.latest : null;

  return (
    <section>
      <TabHeading slug="backups" />

      {warnings.length > 0 && (
        <ul className="mt-4 space-y-2">
          {warnings.map((w) => (
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
        <HealthchecksCard hc={hc} now={now} />
        <LatestRunCard run={latest} now={now} />
        <LastWrittenCard run={lastWritten} now={now} />
      </div>

      {file.state === "missing" && (
        <p className={`mt-4 ${muted}`}>
          No status file in <code>{file.dir}</code>. backup.sh writes one on
          every run once the status dir is set up (see DEPLOY.md).
        </p>
      )}
      {file.state === "invalid" && (
        <p className={`mt-4 ${muted}`}>
          The status file in <code>{file.dir}</code> couldn&apos;t be parsed.
          backup.sh and the app may be out of sync.
        </p>
      )}

      {file.state === "ok" && <HistoryTable history={file.history} now={now} />}
    </section>
  );
}
