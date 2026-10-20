// ============================================================================
// HEALTHCHECKS.IO CLIENT (read-only)
// ============================================================================
//
// Fetches the backup check's status via the Management API with a READ-ONLY
// key: GET {base}/api/v3/checks/{unique_key}, header X-Api-Key.
//
// Never throws — returns "unconfigured" when the env vars are missing and
// "unavailable" on network errors, non-200s, or an unexpected response shape,
// so the Backups tab always renders. Short timeout so a slow HC can't hang the
// page. No caching: it's an admin page, viewed rarely, and HC's ~100 req/min
// limit is nowhere near reachable.
// ============================================================================

import { config } from "@/lib/config";
import { logger } from "@/lib/logger";
import { parseHcCheck, type HcResult } from "./parse";

const TIMEOUT_MS = 5000;

export async function fetchBackupCheck(): Promise<HcResult> {
  const { healthchecksApiKey, healthchecksCheckId, healthchecksApiBase } =
    config.backups;
  if (!healthchecksApiKey || !healthchecksCheckId) {
    return { state: "unconfigured" };
  }

  const url = `${healthchecksApiBase.replace(/\/+$/, "")}/api/v3/checks/${encodeURIComponent(healthchecksCheckId)}`;

  try {
    const res = await fetch(url, {
      headers: { "X-Api-Key": healthchecksApiKey },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
    if (!res.ok) {
      logger.warn("healthchecks.io check fetch failed", { status: res.status });
      return { state: "unavailable", reason: `HTTP ${res.status}` };
    }
    const check = parseHcCheck(await res.json());
    if (!check) {
      logger.warn("healthchecks.io returned an unexpected response shape");
      return { state: "unavailable", reason: "unexpected response" };
    }
    return { state: "ok", check };
  } catch (error) {
    logger.warn("healthchecks.io check fetch errored", { error });
    const reason =
      error instanceof Error && error.name === "TimeoutError"
        ? "timed out"
        : "network error";
    return { state: "unavailable", reason };
  }
}
