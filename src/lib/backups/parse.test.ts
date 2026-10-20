// ============================================================================
// UNIT TESTS — backup status parsing + warnings
// ============================================================================
//
// Pure module, no mocks. The run fixtures below are real output from
// write_status() in scripts/backup.sh (escaping included), so a drift between
// the shell writer and the zod schema shows up here.
// ============================================================================

import {
  deriveBackupWarnings,
  formatBytes,
  formatRelative,
  formatUtc,
  lastWrittenBackup,
  parseBackupHistory,
  parseBackupRun,
  parseHcCheck,
  type HcResult,
} from "@/lib/backups/parse";

// --- Fixtures ---------------------------------------------------------------

const LOCAL_LINE =
  '{"finishedAt":"2026-10-18T02:00:12Z","startedAt":"2026-10-18T02:00:03Z","exitCode":0,"outcome":"local","timestamp":"20261018_020003","dbSizeBytes":48211234,"minioSizeBytes":null,"offsiteRemote":null,"localBackupsKept":2,"host":"cogext"}';
const OFFSITE_LINE =
  '{"finishedAt":"2026-10-19T02:00:12Z","startedAt":"2026-10-19T02:00:03Z","exitCode":0,"outcome":"offsite","timestamp":"20261019_020003","dbSizeBytes":48211234,"minioSizeBytes":120334112,"offsiteRemote":"gdrive:\\"weird\\"\\\\path","localBackupsKept":2,"host":"cogext"}';
const SKIPPED_LINE =
  '{"finishedAt":"2026-10-20T02:00:05Z","startedAt":"2026-10-20T02:00:03Z","exitCode":0,"outcome":"skipped","timestamp":null,"dbSizeBytes":null,"minioSizeBytes":null,"offsiteRemote":null,"localBackupsKept":2,"host":"cogext"}';
const FAILED_LINE =
  '{"finishedAt":"2026-10-20T02:00:09Z","startedAt":"2026-10-20T02:00:03Z","exitCode":3,"outcome":"failed","timestamp":null,"dbSizeBytes":null,"minioSizeBytes":null,"offsiteRemote":null,"localBackupsKept":2,"host":"cogext"}';

const HC_RESPONSE = {
  name: "cogext-backup",
  slug: "cogext-backup",
  tags: "",
  desc: "",
  grace: 1800,
  n_pings: 42,
  status: "up",
  started: false,
  last_ping: "2026-10-20T02:00:12+00:00",
  next_ping: "2026-10-21T02:00:00+00:00",
  manual_resume: false,
  methods: "",
  unique_key: "abc123",
  schedule: "0 2 * * *",
  tz: "UTC",
};

function hcOk(overrides: Partial<{ status: string; lastPing: string | null }> = {}): HcResult {
  const check = parseHcCheck(HC_RESPONSE)!;
  return { state: "ok", check: { ...check, ...overrides } };
}

const NOW = new Date("2026-10-20T09:00:00Z");

// --- parseHcCheck -----------------------------------------------------------

describe("parseHcCheck", () => {
  it("maps a read-only API response to HcCheck", () => {
    expect(parseHcCheck(HC_RESPONSE)).toEqual({
      name: "cogext-backup",
      status: "up",
      lastPing: "2026-10-20T02:00:12+00:00",
      nextPing: "2026-10-21T02:00:00+00:00",
      graceSeconds: 1800,
      nPings: 42,
      schedule: "0 2 * * *",
      tz: "UTC",
    });
  });

  it("accepts a never-pinged check (null pings) and unknown statuses", () => {
    const c = parseHcCheck({ ...HC_RESPONSE, status: "started", last_ping: null, next_ping: null });
    expect(c?.status).toBe("started");
    expect(c?.lastPing).toBeNull();
  });

  it("returns null for an unexpected shape", () => {
    expect(parseHcCheck({ error: "wrong api key" })).toBeNull();
    expect(parseHcCheck(null)).toBeNull();
  });
});

// --- parseBackupRun / parseBackupHistory -------------------------------------

describe("parseBackupRun", () => {
  it("parses backup.sh output, including escaped strings", () => {
    const run = parseBackupRun(JSON.parse(OFFSITE_LINE));
    expect(run?.outcome).toBe("offsite");
    expect(run?.offsiteRemote).toBe('gdrive:"weird"\\path');
    expect(run?.minioSizeBytes).toBe(120334112);
  });

  it("rejects an unknown outcome", () => {
    expect(parseBackupRun({ ...JSON.parse(LOCAL_LINE), outcome: "partial" })).toBeNull();
  });
});

describe("parseBackupHistory", () => {
  it("returns runs newest first and skips malformed lines", () => {
    const text = [LOCAL_LINE, "{not json", OFFSITE_LINE, "", SKIPPED_LINE, '{"outcome":"local"}'].join("\n");
    const runs = parseBackupHistory(text);
    expect(runs.map((r) => r.outcome)).toEqual(["skipped", "offsite", "local"]);
  });
});

describe("lastWrittenBackup", () => {
  it("skips skipped/failed runs to find the last real backup", () => {
    const history = parseBackupHistory([LOCAL_LINE, OFFSITE_LINE, SKIPPED_LINE, FAILED_LINE].join("\n"));
    expect(lastWrittenBackup(history)?.outcome).toBe("offsite");
  });

  it("returns null when nothing was written", () => {
    expect(lastWrittenBackup(parseBackupHistory(SKIPPED_LINE))).toBeNull();
  });
});

// --- deriveBackupWarnings ----------------------------------------------------

describe("deriveBackupWarnings", () => {
  const skipped = parseBackupRun(JSON.parse(SKIPPED_LINE))!;
  const failed = parseBackupRun(JSON.parse(FAILED_LINE))!;

  it("no warnings when HC is up and the file matches its last ping", () => {
    // File finished 02:00:05, HC pinged 02:00:12 — within tolerance.
    expect(deriveBackupWarnings({ hc: hcOk(), latest: skipped, now: NOW })).toEqual([]);
  });

  it("errors when HC is down, warns when in grace", () => {
    expect(deriveBackupWarnings({ hc: hcOk({ status: "down" }), latest: skipped, now: NOW })[0].level).toBe("error");
    expect(deriveBackupWarnings({ hc: hcOk({ status: "grace" }), latest: skipped, now: NOW })[0].level).toBe("warning");
  });

  it("errors on a failed last run, quoting the exit code", () => {
    const w = deriveBackupWarnings({ hc: { state: "unconfigured" }, latest: failed, now: NOW });
    expect(w).toEqual([expect.objectContaining({ level: "error", message: expect.stringContaining("exit 3") })]);
  });

  it("warns when the status file lags HC's last ping (stale mount / old script)", () => {
    const w = deriveBackupWarnings({
      hc: hcOk({ lastPing: "2026-10-20T08:00:00+00:00" }),
      latest: skipped,
      now: NOW,
    });
    expect(w.map((x) => x.message).join()).toMatch(/older than healthchecks/);
  });

  it("without HC, warns when no run is recorded for over a day", () => {
    const later = new Date("2026-10-21T06:00:00Z"); // 28h after the run
    expect(deriveBackupWarnings({ hc: { state: "unavailable", reason: "x" }, latest: skipped, now: later })).toHaveLength(1);
    // With HC configured, HC is the missed-run detector instead.
    expect(deriveBackupWarnings({ hc: hcOk(), latest: skipped, now: later })).toEqual([]);
  });
});

// --- Formatting --------------------------------------------------------------

describe("formatting", () => {
  it("formatBytes", () => {
    expect(formatBytes(null)).toBe("—");
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(formatBytes(48211234)).toBe("46 MB");
  });

  it("formatRelative picks the coarsest unit", () => {
    expect(formatRelative("2026-10-20T02:00:00Z", NOW)).toBe("7 hours ago");
    expect(formatRelative("2026-10-20T08:58:00Z", NOW)).toBe("2 minutes ago");
    expect(formatRelative("2026-10-21T02:00:00Z", NOW)).toBe("in 17 hours");
    expect(formatRelative("2026-10-18T09:00:00Z", NOW)).toBe("2 days ago");
    // Truncates: 1d 14h is "yesterday", not rounded up to 2 days.
    expect(formatRelative("2026-10-18T19:00:00Z", NOW)).toBe("yesterday");
  });

  it("formatUtc is timezone-independent", () => {
    expect(formatUtc("2026-10-20T02:00:12+00:00")).toBe("2026-10-20 02:00 UTC");
  });
});
