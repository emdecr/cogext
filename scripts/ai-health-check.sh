#!/bin/bash
# =============================================================================
# AI HEALTH CHECK — turn AI call failures into a healthchecks.io alert
# =============================================================================
#
# Runs ON the prod server from cron, every 6 hours:
#   0 */6 * * * deploy /opt/cogext/scripts/ai-health-check.sh >> /var/log/cogext-ai-health.log 2>&1
#
# Asks the app whether any AI call failed in the last AI_ALERT_WINDOW_HOURS
# (GET /api/health/ai, authenticated with CRON_SECRET), then pings a
# healthchecks.io check:
#   status "ok"    → ping <AI_HEALTHCHECK_URL>        (check stays / goes UP)
#   status "alert" → ping <AI_HEALTHCHECK_URL>/fail   (check goes DOWN → email)
#   check couldn't run (app down, 401, 500, timeout) → /fail as well, so a
#     broken check can never look healthy
# The ping body is the endpoint's JSON (reasons + latest errors), which
# healthchecks.io includes in the alert email.
#
# healthchecks.io emails on state CHANGES only, so an incident is one "down"
# email, then one "up" email after the next clean window. If this script stops
# running entirely (cron broken, server down), the check misses its period
# and goes down too — the dead-man's-switch, same as the backup check.
#
# Config (read from /opt/cogext/.env, like backup.sh):
#   AI_HEALTHCHECK_URL  — the check's ping URL. Unset/empty → do nothing.
#   CRON_SECRET         — already set for the app; authenticates the request.
# The alert rule's knobs (AI_ALERT_MIN_ERRORS, AI_ALERT_WINDOW_HOURS) are read
# by the APP, not here. The window must match this cron interval (6h).
#
# Usage:
#   ./scripts/ai-health-check.sh            # check + ping
#   ./scripts/ai-health-check.sh --dry-run  # check, print the ping it WOULD send
#
# Overrides (for testing): AI_HEALTH_ENV_FILE, AI_HEALTH_ENDPOINT.
# See DEPLOY.md → "AI failure alerts" and plans/2026-10-21-ai-failure-alerts.md.
# =============================================================================

set -euo pipefail

ENV_FILE="${AI_HEALTH_ENV_FILE:-/opt/cogext/.env}"
# The app's port is bound to 127.0.0.1 on the host (docker-compose.prod.yml),
# so this stays on the box — nothing crosses the network but the ping.
ENDPOINT="${AI_HEALTH_ENDPOINT:-http://localhost:3000/api/health/ai}"

DRY_RUN=false
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=true ;;
    *) echo "Unknown arg: $arg"; echo "Usage: $0 [--dry-run]"; exit 2 ;;
  esac
done

if [[ -f "$ENV_FILE" ]]; then
  # shellcheck disable=SC1090
  source "$ENV_FILE"
else
  echo "$(date -u +%FT%TZ) ❌ Env file not found: $ENV_FILE"
  exit 1
fi

AI_HEALTHCHECK_URL="${AI_HEALTHCHECK_URL:-}"
CRON_SECRET="${CRON_SECRET:-}"

if [[ -z "$AI_HEALTHCHECK_URL" ]]; then
  echo "$(date -u +%FT%TZ) AI_HEALTHCHECK_URL not set — nothing to report to. Skipping."
  exit 0
fi

# --- Ask the app -------------------------------------------------------------
body_file="$(mktemp)"
trap 'rm -f "$body_file"' EXIT

code="$(curl -sS -m 30 \
  -H "Authorization: Bearer ${CRON_SECRET}" \
  -o "$body_file" -w '%{http_code}' \
  "$ENDPOINT" 2>/dev/null)" || code="000"
body="$(cat "$body_file" 2>/dev/null || true)"

# --- Decide the ping -----------------------------------------------------------
# The endpoint returns compact JSON with "status" first; a plain grep keeps
# this free of a jq dependency on the host.
if [[ "$code" == "200" ]] && grep -q '"status":"ok"' <<<"$body"; then
  suffix=""
  summary="ok"
elif [[ "$code" == "200" ]] && grep -q '"status":"alert"' <<<"$body"; then
  suffix="/fail"
  summary="ALERT"
else
  suffix="/fail"
  summary="CHECK FAILED (HTTP $code)"
  body="AI health check could not run: HTTP $code from $ENDPOINT. ${body:0:500}"
fi

echo "$(date -u +%FT%TZ) $summary"

if [[ "$DRY_RUN" == "true" ]]; then
  echo "[dry-run] would ping: ${AI_HEALTHCHECK_URL}${suffix}"
  echo "[dry-run] body: ${body:0:1000}"
  exit 0
fi

# Never let the ping itself fail the script; short timeout + retries.
curl -fsS -m 10 --retry 3 \
  --user-agent "cogext-ai-health" \
  --data-raw "$body" \
  -o /dev/null \
  "${AI_HEALTHCHECK_URL}${suffix}" || echo "$(date -u +%FT%TZ) ⚠️  ping to healthchecks.io failed"
