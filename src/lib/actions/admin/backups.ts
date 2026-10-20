"use server";

// ============================================================================
// ADMIN — BACKUP STATUS (read-only)
// ============================================================================
//
// Combines healthchecks.io and the backup.sh status files into one view for
// the admin Backups tab. See src/lib/backups/parse.ts for why there are two
// sources. Admin-only: requireAdmin() 404s anyone else, including a direct
// POST to this action.
// ============================================================================

import { requireAdmin } from "@/lib/auth/admin";
import { fetchBackupCheck } from "@/lib/backups/healthchecks";
import { readBackupStatus } from "@/lib/backups/status-file";
import {
  deriveBackupWarnings,
  lastWrittenBackup,
  type BackupRun,
  type BackupWarning,
  type HcResult,
} from "@/lib/backups/parse";
import type { StatusFileResult } from "@/lib/backups/status-file";

export type BackupOverview = {
  hc: HcResult;
  file: StatusFileResult;
  // Most recent run that actually wrote a backup — differs from the latest
  // run when recent nights were skipped (no content changes).
  lastWritten: BackupRun | null;
  warnings: BackupWarning[];
  generatedAt: string;
};

export async function getBackupOverview(): Promise<BackupOverview> {
  await requireAdmin();

  const [hc, file] = await Promise.all([fetchBackupCheck(), readBackupStatus()]);
  const now = new Date();
  const latest = file.state === "ok" ? file.latest : null;
  const history = file.state === "ok" ? file.history : [];

  return {
    hc,
    file,
    lastWritten: lastWrittenBackup(history),
    warnings: deriveBackupWarnings({ hc, latest, now }),
    generatedAt: now.toISOString(),
  };
}
