#!/bin/bash
# =============================================================================
# HEALTHCHECK / SMOKE TEST — verify the prod stack is up
# =============================================================================
#
# Runs ON the prod server. Confirms, in one command, that the whole stack came
# back cleanly — the thing you want right after a reboot or a deploy instead of
# eyeballing `docker compose ps`.
#
# It checks two layers:
#   1. Container health — app / db / minio all report `healthy` (Docker's own
#      healthchecks from docker-compose.prod.yml).
#   2. Application readiness — GET /api/health/ready, which does a live
#      `SELECT 1` against Postgres and pings MinIO. 200 = DB up (storage may be
#      degraded), 503 = DB unreachable.
#
# Because a reboot takes a bit to settle (the app has a 40s start_period, and
# Postgres/MinIO warm up first), the script POLLS until healthy or it times out.
#
# Usage:
#   ./scripts/healthcheck.sh                 # poll up to ~2 min, then report
#   ./scripts/healthcheck.sh --timeout 300   # wait up to 5 min
#   ./scripts/healthcheck.sh --once          # single check, no polling
#
# Exit codes:
#   0 — all containers healthy AND readiness returned 200 (ok or degraded)
#   1 — timed out / a container unhealthy / readiness not 200
#
# Handy after a reboot from your laptop:
#   ssh deploy@<ip> '/opt/cogext/scripts/healthcheck.sh'
# =============================================================================

set -euo pipefail

# --- Config -----------------------------------------------------------------
COMPOSE_FILE="/opt/cogext/docker-compose.prod.yml"
SERVICES=(app db minio)
READY_URL="http://localhost:3000/api/health/ready"

# --- Args -------------------------------------------------------------------
TIMEOUT=120       # seconds to keep polling before giving up
INTERVAL=5        # seconds between attempts
ONCE=false
while [[ $# -gt 0 ]]; do
  case "$1" in
    --timeout) TIMEOUT="$2"; shift 2 ;;
    --once)    ONCE=true; shift ;;
    *) echo "Unknown arg: $1"; echo "Usage: $0 [--timeout <seconds>] [--once]"; exit 1 ;;
  esac
done

# --- Helpers ----------------------------------------------------------------

# Health of one compose service, e.g. "healthy" / "starting" / "unhealthy".
# Falls back to the running state for services without a healthcheck.
service_health() {
  local svc="$1" cid
  cid="$(docker compose -f "$COMPOSE_FILE" ps -q "$svc" 2>/dev/null || true)"
  [[ -n "$cid" ]] || { echo "absent"; return; }
  docker inspect --format \
    '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' \
    "$cid" 2>/dev/null || echo "unknown"
}

# One full pass. Prints a per-check summary. Returns 0 only if everything's good.
run_checks() {
  local all_ok=true

  echo "  Containers:"
  for svc in "${SERVICES[@]}"; do
    local status; status="$(service_health "$svc")"
    # "running" counts as healthy for a service that has no healthcheck.
    if [[ "$status" == "healthy" || "$status" == "running" ]]; then
      printf "    ✅ %-6s %s\n" "$svc" "$status"
    else
      printf "    ❌ %-6s %s\n" "$svc" "$status"
      all_ok=false
    fi
  done

  echo "  Readiness ($READY_URL):"
  local code
  code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "$READY_URL" 2>/dev/null || echo 000)"
  if [[ "$code" == "200" ]]; then
    printf "    ✅ HTTP %s (database reachable)\n" "$code"
  else
    printf "    ❌ HTTP %s (expected 200; 503=DB down, 000=app unreachable)\n" "$code"
    all_ok=false
  fi

  $all_ok
}

# --- Main -------------------------------------------------------------------
echo "============================================================"
echo "🩺 CogExt healthcheck"
echo "============================================================"

if [[ ! -f "$COMPOSE_FILE" ]]; then
  echo "❌ Compose file not found: $COMPOSE_FILE"
  echo "   Run this on the prod server (or fix COMPOSE_FILE)."
  exit 1
fi

deadline=$(( $(date +%s) + TIMEOUT ))
attempt=1
while true; do
  echo ""
  echo "Attempt $attempt ($(date '+%H:%M:%S')):"
  if run_checks; then
    echo ""
    echo "============================================================"
    echo "✅ Healthy — stack is up and serving."
    echo "============================================================"
    exit 0
  fi

  if [[ "$ONCE" == true ]] || [[ $(date +%s) -ge $deadline ]]; then
    echo ""
    echo "============================================================"
    echo "❌ Not healthy$([[ "$ONCE" == true ]] || echo " after ${TIMEOUT}s")."
    echo "   Inspect: docker compose -f $COMPOSE_FILE ps"
    echo "            docker compose -f $COMPOSE_FILE logs --tail 100 app"
    echo "============================================================"
    exit 1
  fi

  echo "  … not ready yet, retrying in ${INTERVAL}s"
  sleep "$INTERVAL"
  attempt=$((attempt + 1))
done
