// ============================================================================
// BACKUP STATUS — pure parsing + derivation
// ============================================================================
//
// The admin Backups tab combines two sources (see
// plans/2026-10-20-admin-panel.md):
//
//   1. healthchecks.io (read-only API key) — the check's up/grace/down status.
//      The only source that notices a backup that NEVER RAN (cron broken,
//      server down), because it's a dead-man's-switch.
//   2. Files written by scripts/backup.sh on every run — what the run actually
//      did (skipped / local / offsite / failed), sizes, exit code. A read-only
//      HC key can't read ping bodies, so this is where the detail comes from.
//
// Everything here is pure (no fs, no fetch, no config) so it's unit-testable
// without mocks. I/O lives in healthchecks.ts and status-file.ts.
// ============================================================================

import { z } from "zod";

// ---------------------------------------------------------------------------
// healthchecks.io check (GET /api/v3/checks/<unique_key>)
// ---------------------------------------------------------------------------

// Only the fields we use. `status` is kept as a string rather than an enum so
// a status value HC adds later degrades to "unknown" instead of failing parse.
const hcCheckSchema = z.object({
  name: z.string(),
  status: z.string(),
  last_ping: z.string().nullable(),
  next_ping: z.string().nullable(),
  grace: z.number(),
  n_pings: z.number(),
  schedule: z.string().optional(),
  tz: z.string().optional(),
});

export type HcCheck = {
  name: string;
  status: string;
  lastPing: string | null;
  nextPing: string | null;
  graceSeconds: number;
  nPings: number;
  schedule: string | null;
  tz: string | null;
};

export type HcResult =
  | { state: "unconfigured" }
  | { state: "unavailable"; reason: string }
  | { state: "ok"; check: HcCheck };

export function parseHcCheck(json: unknown): HcCheck | null {
  const parsed = hcCheckSchema.safeParse(json);
  if (!parsed.success) return null;
  const c = parsed.data;
  return {
    name: c.name,
    status: c.status,
    lastPing: c.last_ping,
    nextPing: c.next_ping,
    graceSeconds: c.grace,
    nPings: c.n_pings,
    schedule: c.schedule ?? null,
    tz: c.tz ?? null,
  };
}

// ---------------------------------------------------------------------------
// backup.sh run record (backup-last-run.json, one line of backup-history.jsonl)
// ---------------------------------------------------------------------------
// Keep in sync with write_status() in scripts/backup.sh.

const backupRunSchema = z.object({
  finishedAt: z.string(),
  startedAt: z.string().nullable(),
  exitCode: z.number(),
  outcome: z.enum(["skipped", "local", "offsite", "failed"]),
  timestamp: z.string().nullable(),
  dbSizeBytes: z.number().nullable(),
  minioSizeBytes: z.number().nullable(),
  offsiteRemote: z.string().nullable(),
  localBackupsKept: z.number().nullable(),
  host: z.string().nullable(),
});

export type BackupRun = z.infer<typeof backupRunSchema>;
export type BackupOutcome = BackupRun["outcome"];

export function parseBackupRun(json: unknown): BackupRun | null {
  const parsed = backupRunSchema.safeParse(json);
  return parsed.success ? parsed.data : null;
}

/**
 * Parse backup-history.jsonl (one JSON object per line, oldest first) into
 * runs, NEWEST FIRST. Malformed lines are skipped, not fatal — a half-written
 * line must not blank the whole history.
 */
export function parseBackupHistory(text: string): BackupRun[] {
  const runs: BackupRun[] = [];
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    try {
      const run = parseBackupRun(JSON.parse(line));
      if (run) runs.push(run);
    } catch {
      // skip malformed line
    }
  }
  return runs.reverse();
}

// ---------------------------------------------------------------------------
// Derivation — warnings shown at the top of the tab
// ---------------------------------------------------------------------------

export type BackupWarning = { level: "error" | "warning"; message: string };

// How far the status file may lag HC's last ping before we call it stale.
// A run pings HC and writes the file within seconds of each other.
const STALE_FILE_TOLERANCE_MS = 10 * 60 * 1000;

// Without HC, a daily backup with no recorded run for this long is suspicious.
const NO_RUN_THRESHOLD_MS = 26 * 60 * 60 * 1000;

export function deriveBackupWarnings(input: {
  hc: HcResult;
  latest: BackupRun | null;
  now: Date;
}): BackupWarning[] {
  const { hc, latest, now } = input;
  const warnings: BackupWarning[] = [];

  if (hc.state === "ok") {
    if (hc.check.status === "down") {
      warnings.push({
        level: "error",
        message:
          "healthchecks.io reports the backup check DOWN. A run failed or never happened.",
      });
    } else if (hc.check.status === "grace") {
      warnings.push({
        level: "warning",
        message:
          "The backup is late. healthchecks.io is in its grace period waiting for a ping.",
      });
    }
  }

  if (latest?.outcome === "failed") {
    warnings.push({
      level: "error",
      message: `The last backup run failed (exit ${latest.exitCode}). Check /var/log/cogext-backup.log on the server.`,
    });
  }

  if (hc.state === "ok" && hc.check.lastPing && latest) {
    const lag = Date.parse(hc.check.lastPing) - Date.parse(latest.finishedAt);
    if (lag > STALE_FILE_TOLERANCE_MS) {
      warnings.push({
        level: "warning",
        message:
          "The status file is older than healthchecks.io's last ping. The /status mount or backup.sh on the server may be out of date.",
      });
    }
  }

  // HC is the real missed-run detector; this is only a fallback without it.
  if (hc.state !== "ok" && latest) {
    if (now.getTime() - Date.parse(latest.finishedAt) > NO_RUN_THRESHOLD_MS) {
      warnings.push({
        level: "warning",
        message: "No backup run has been recorded in over a day.",
      });
    }
  }

  return warnings;
}

/** Most recent run that actually wrote a backup (skips "skipped"/"failed"). */
export function lastWrittenBackup(history: BackupRun[]): BackupRun | null {
  return (
    history.find((r) => r.outcome === "local" || r.outcome === "offsite") ??
    null
  );
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

export function formatBytes(bytes: number | null): string {
  if (bytes === null) return "—";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i++;
  }
  return `${value < 10 && i > 0 ? value.toFixed(1) : Math.round(value)} ${units[i]}`;
}

/** "2026-10-20 02:00 UTC" — explicit UTC so server TZ never matters. */
export function formatUtc(iso: string): string {
  return `${new Date(iso).toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

const relativeFormat = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

/**
 * "3 hours ago" / "in 20 minutes". Coarsest unit that fits, TRUNCATED rather
 * than rounded — 1 day 14 hours reads "1 day ago", not "2 days ago", so a
 * nightly run never looks a night older than it is.
 */
export function formatRelative(iso: string, now: Date): string {
  const diffSec = Math.trunc((Date.parse(iso) - now.getTime()) / 1000);
  const abs = Math.abs(diffSec);
  if (abs < 60) return relativeFormat.format(diffSec, "second");
  if (abs < 3600) return relativeFormat.format(Math.trunc(diffSec / 60), "minute");
  if (abs < 86400) return relativeFormat.format(Math.trunc(diffSec / 3600), "hour");
  return relativeFormat.format(Math.trunc(diffSec / 86400), "day");
}
