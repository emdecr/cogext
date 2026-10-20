// ============================================================================
// BACKUP STATUS FILES (written by scripts/backup.sh)
// ============================================================================
//
// Reads, from config.backups.statusDir:
//   backup-last-run.json   — the most recent run (rewritten atomically each run)
//   backup-history.jsonl   — the last ~30 runs, one JSON object per line
//
// In prod the host dir /opt/cogext/status is mounted read-only at /status.
// That dir holds ONLY these status files — never the backups themselves.
//
// Never throws: a missing dir/file (local dev, or before the first run) is
// "missing", an unparseable last-run file is "invalid".
// ============================================================================

import { readFile } from "node:fs/promises";
import path from "node:path";
import { config } from "@/lib/config";
import { logger } from "@/lib/logger";
import { parseBackupHistory, parseBackupRun, type BackupRun } from "./parse";

export const LAST_RUN_FILE = "backup-last-run.json";
export const HISTORY_FILE = "backup-history.jsonl";

export type StatusFileResult =
  | { state: "missing"; dir: string }
  | { state: "invalid"; dir: string }
  | { state: "ok"; dir: string; latest: BackupRun; history: BackupRun[] };

async function readOptional(file: string): Promise<string | null> {
  try {
    return await readFile(file, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    logger.warn("Could not read backup status file", { file, error });
    return null;
  }
}

export async function readBackupStatus(): Promise<StatusFileResult> {
  const dir = config.backups.statusDir;
  const [lastRunText, historyText] = await Promise.all([
    readOptional(path.join(dir, LAST_RUN_FILE)),
    readOptional(path.join(dir, HISTORY_FILE)),
  ]);

  if (lastRunText === null) return { state: "missing", dir };

  let latest: BackupRun | null = null;
  try {
    latest = parseBackupRun(JSON.parse(lastRunText));
  } catch {
    // fall through to "invalid"
  }
  if (!latest) return { state: "invalid", dir };

  return {
    state: "ok",
    dir,
    latest,
    history: historyText ? parseBackupHistory(historyText) : [latest],
  };
}
