// ============================================================================
// SYSTEM INFO — pure helpers for the admin System tab
// ============================================================================
//
// Formatting and comparison logic, kept free of db/config/process imports so
// it's unit-testable without mocks. The data gathering lives in
// src/lib/actions/admin/system.ts.
// ============================================================================

/** "3d 4h", "2h 5m", "4m 10s", "45s" — the two largest non-zero units. */
export function formatUptime(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const parts: [number, string][] = [
    [Math.floor(s / 86400), "d"],
    [Math.floor((s % 86400) / 3600), "h"],
    [Math.floor((s % 3600) / 60), "m"],
    [s % 60, "s"],
  ];
  const first = parts.findIndex(([n]) => n > 0);
  if (first === -1) return "0s";
  return parts
    .slice(first, first + 2)
    .filter(([n]) => n > 0)
    .map(([n, unit]) => `${n}${unit}`)
    .join(" ");
}

/** First 7 chars of a commit SHA; non-SHA values ("dev") pass through. */
export function shortSha(sha: string): string {
  return /^[0-9a-f]{40}$/i.test(sha) ? sha.slice(0, 7) : sha;
}

/**
 * GitHub commit URL for a build, or null when it can't be linked (local
 * "dev" builds, or no repository stamped into the image).
 */
export function commitUrl(repository: string, sha: string): string | null {
  if (!repository || !/^[\w.-]+\/[\w.-]+$/.test(repository)) return null;
  if (!/^[0-9a-f]{40}$/i.test(sha)) return null;
  return `https://github.com/${repository}/commit/${sha}`;
}

/**
 * Compare a feature's configured model with the model its latest ai_usage row
 * recorded. "mismatch" usually means a stale container (env changed, not yet
 * recreated) or calls made before a model switch that haven't recurred since.
 */
export function compareLastUsed(
  configured: string,
  lastUsed: string | null
): "match" | "mismatch" | "none" {
  if (!lastUsed) return "none";
  return lastUsed === configured ? "match" : "mismatch";
}
