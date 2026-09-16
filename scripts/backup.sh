#!/bin/bash
# =============================================================================
# BACKUP SCRIPT — Postgres + MinIO
# =============================================================================
#
# Creates a timestamped backup of:
#   1. PostgreSQL database (via pg_dump → gzip)
#   2. MinIO object storage (via Docker volume snapshot → tar.gz)
#
# Then rotates backups older than RETENTION_DAYS.
#
# Usage:
#   ./scripts/backup.sh                     # manual run (Postgres + MinIO)
#   ./scripts/backup.sh --db-only           # Postgres only, skip MinIO
#   ./scripts/backup.sh --dry-run           # print what would happen, no writes
#
# Cron (daily at 2am):
#   0 2 * * * /path/to/cogext/scripts/backup.sh >> /var/log/cogext-backup.log 2>&1
#
# Requirements on the host:
#   - docker (to exec into containers)
#   - rclone (optional, for offsite upload — install with: apt install rclone)
# =============================================================================

# `set -euo pipefail` is critical for backup scripts:
#   -e           exit immediately if any command fails
#   -u           treat unset variables as errors (catches typos)
#   -o pipefail  the WHOLE pipe fails if ANY command in it fails
#
# Why -o pipefail matters here:
#   `pg_dump | gzip` — if pg_dump crashes, gzip still exits 0 and produces
#   a valid but EMPTY .gz file. Without pipefail, the script thinks it
#   succeeded and you discover the corruption only when you try to restore.
set -euo pipefail

# =============================================================================
# CONFIGURATION — edit these for your server
# =============================================================================

# Docker Compose project name (determined by the directory name when you run
# `docker compose up`). Check with: docker volume ls | grep cogext
COMPOSE_PROJECT="cogext"

# Absolute path to the docker-compose.prod.yml file.
# This script must be run from a user who can run docker commands.
COMPOSE_FILE="/opt/cogext/docker-compose.prod.yml"

# Where to store backups on this server.
# Make sure this directory exists and the backup user has write access.
BACKUP_ROOT="/opt/backups/cogext"

# How many days of backups to keep locally.
# At ~50MB per backup (compressed), 7 days ≈ 350MB.
RETENTION_DAYS=7

# Env file path — we source it to get DB credentials.
# Alternatively, export POSTGRES_USER/POSTGRES_PASSWORD/POSTGRES_DB in cron.
ENV_FILE="/opt/cogext/.env"

# Offsite backup via rclone (optional).
# Set OFFSITE_ENABLED=true and configure OFFSITE_REMOTE to enable.
# rclone remote name (configure with: rclone config)
# Example: "b2:my-bucket/cogext-backups" for Backblaze B2
OFFSITE_ENABLED="${OFFSITE_ENABLED:-false}"
OFFSITE_REMOTE="${OFFSITE_REMOTE:-}"

# How many timestamped backup folders to KEEP offsite. Older ones are purged
# after each successful upload, so the remote doesn't grow forever. Local
# retention is separate (RETENTION_DAYS above); offsite is by count, not age,
# because you typically want a fixed handful of recent restore points off-box.
OFFSITE_RETAIN="${OFFSITE_RETAIN:-5}"

# =============================================================================
# SETUP
# =============================================================================

DRY_RUN=false
DB_ONLY=false
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=true; echo "🔍 DRY RUN — no files will be written" ;;
    --db-only) DB_ONLY=true; echo "📦 DB-ONLY mode — skipping MinIO backup" ;;
  esac
done

# Load environment variables from .env so we have $POSTGRES_USER etc.
if [[ -f "$ENV_FILE" ]]; then
  # shellcheck disable=SC1090
  source "$ENV_FILE"
else
  echo "❌ Env file not found: $ENV_FILE"
  exit 1
fi

# Timestamp for this backup set. Format: 20260324_020000
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="$BACKUP_ROOT/$TIMESTAMP"

echo "============================================================"
echo "CogExt Backup — $(date)"
echo "Destination: $BACKUP_DIR"
echo "============================================================"

if [[ "$DRY_RUN" == "false" ]]; then
  mkdir -p "$BACKUP_DIR"
fi

# =============================================================================
# STEP 1: POSTGRES BACKUP
# =============================================================================
# pg_dump creates a complete SQL dump of the database.
# It's safe to run against a live database — Postgres handles consistency.
#
# We use `docker compose exec -T` (not `docker exec`):
#   - Works by service name, not container name (more stable)
#   - `-T` disables pseudo-TTY allocation (required for piping output)
#
# Output: postgres_TIMESTAMP.sql.gz (~10-50MB depending on your data)
# =============================================================================

POSTGRES_BACKUP="$BACKUP_DIR/postgres_${TIMESTAMP}.sql.gz"

echo ""
echo "📦 [1/3] Backing up PostgreSQL..."

if [[ "$DRY_RUN" == "false" ]]; then
  # Flag notes (kept off the continuation lines — an inline `# comment` after a
  # trailing backslash breaks the line-continuation and truncates the command):
  #   --clean      include DROP statements before CREATE (safe for restore)
  #   --if-exists  makes DROP statements non-fatal if table doesn't exist
  #   --format=plain  plain SQL (readable, portable, restorable with psql)
  docker compose \
    -f "$COMPOSE_FILE" \
    exec -T db \
    pg_dump \
      --username="$POSTGRES_USER" \
      --no-password \
      --clean \
      --if-exists \
      --format=plain \
      "$POSTGRES_DB" \
  | gzip -9 > "$POSTGRES_BACKUP"

  POSTGRES_SIZE=$(du -sh "$POSTGRES_BACKUP" | cut -f1)
  echo "   ✅ Postgres backup: $POSTGRES_BACKUP ($POSTGRES_SIZE)"
else
  echo "   [dry-run] Would create: $POSTGRES_BACKUP"
fi


# =============================================================================
# STEP 2: MINIO FILES BACKUP
# =============================================================================
# MinIO stores its data in a Docker named volume (`minio_data`).
# We back it up by mounting the volume READ-ONLY into a temporary Alpine
# container and creating a tar archive.
#
# Why not use `mc mirror` (MinIO client)?
#   - Would require network access to MinIO's API
#   - More complex: needs credentials, bucket name, endpoint
#   - Volume approach is simpler and doesn't depend on MinIO being up
#
# The volume name is: {compose_project}_{volume_name}
#   e.g., cogext_minio_data
#
# Verify with: docker volume ls | grep minio
# =============================================================================

if [[ "$DB_ONLY" == "false" ]]; then

MINIO_BACKUP="$BACKUP_DIR/minio_${TIMESTAMP}.tar.gz"
MINIO_VOLUME="${COMPOSE_PROJECT}_minio_data"

echo ""
echo "🗄️  [2/3] Backing up MinIO files..."

if [[ "$DRY_RUN" == "false" ]]; then
  docker run --rm \
    --name "cogext-backup-minio-$$" \
    -v "${MINIO_VOLUME}:/data:ro" \
    -v "${BACKUP_DIR}:/backup" \
    alpine \
    tar czf "/backup/minio_${TIMESTAMP}.tar.gz" -C /data .

  MINIO_SIZE=$(du -sh "$MINIO_BACKUP" | cut -f1)
  echo "   ✅ MinIO backup: $MINIO_BACKUP ($MINIO_SIZE)"
else
  echo "   [dry-run] Would create: $MINIO_BACKUP (from volume: $MINIO_VOLUME)"
fi

fi  # end DB_ONLY check


# =============================================================================
# STEP 3: OFFSITE UPLOAD (optional)
# =============================================================================
# rclone syncs the backup directory to remote storage (Backblaze B2, S3, etc.).
#
# Setup:
#   1. Install rclone: apt install rclone (or https://rclone.org/install/)
#   2. Configure a remote: rclone config
#      - For Backblaze B2: https://rclone.org/b2/
#      - For Cloudflare R2: https://rclone.org/s3/#cloudflare-r2
#   3. Set OFFSITE_ENABLED=true and OFFSITE_REMOTE=<name>:<bucket>/<path>
#      in your .env or cron environment.
#
# rclone copy (not sync) — only copies new files, doesn't delete old remote ones.
# We manage retention separately below.
# =============================================================================

if [[ "$OFFSITE_ENABLED" == "true" && -n "$OFFSITE_REMOTE" ]]; then
  echo ""
  echo "☁️  [3/3] Uploading to offsite storage ($OFFSITE_REMOTE)..."

  if [[ "$DRY_RUN" == "false" ]]; then
    rclone copy "$BACKUP_DIR" "$OFFSITE_REMOTE/$TIMESTAMP" \
      --log-level INFO \
      --stats 60s

    echo "   ✅ Offsite upload complete"
  else
    echo "   [dry-run] Would upload: $BACKUP_DIR → $OFFSITE_REMOTE/$TIMESTAMP"
  fi

  # ---- Offsite retention: keep only the newest OFFSITE_RETAIN folders ----
  # The remote holds one folder per run, named by timestamp (YYYYMMDD_HHMMSS),
  # which sorts chronologically. We list them, then purge everything except the
  # newest N. The timestamp regex is a guard so we only ever purge our OWN
  # backup folders, never another file that happens to live under the remote.
  # We compute the count and use a positive `head -n <prune count>` (portable)
  # rather than `head -n -N` (GNU-only), so this behaves the same everywhere.
  echo ""
  echo "🧹 Offsite retention — keeping newest $OFFSITE_RETAIN..."

  # Validate OFFSITE_RETAIN FIRST — this is destructive input. It must be a
  # positive integer: in bash arithmetic a non-numeric value collapses to 0, so
  # `head -n $((count - 0))` would select EVERY folder for purge. Reject 0,
  # negatives, empty, and malformed values (no leading zero → no octal surprise)
  # before any listing or deletion happens.
  if ! [[ "$OFFSITE_RETAIN" =~ ^[1-9][0-9]*$ ]]; then
    echo "❌ OFFSITE_RETAIN must be a positive integer (got: '$OFFSITE_RETAIN'). Aborting before any prune." >&2
    exit 1
  fi

  # List the remote, keeping the lsf exit status separate from grep's. grep
  # exits 1 on "no matches", which is a legitimately EMPTY remote — not a
  # failure — so we run lsf on its own and branch on the exit code:
  #   3  = "directory not found" — the destination folder doesn't exist until
  #        the first upload creates it (a dry-run, or the very first real run),
  #        so treat it as "nothing there yet", not a fault.
  #   !0 = a real problem (auth, network, misconfig) — abort, and surface
  #        rclone's own error so the cron log says WHY. Masking it (as
  #        `2>/dev/null | ... || true` did) would look identical to an empty
  #        remote and silently skip pruning forever.
  lsf_errfile=$(mktemp)
  lsf_status=0
  RAW_REMOTE=$(rclone lsf --dirs-only --dir-slash=false "$OFFSITE_REMOTE" 2>"$lsf_errfile") || lsf_status=$?
  if (( lsf_status == 3 )); then
    RAW_REMOTE=""   # folder not created yet — nothing to prune
  elif (( lsf_status != 0 )); then
    echo "❌ Could not list offsite remote ($OFFSITE_REMOTE) — skipping prune rather than masking the fault." >&2
    [[ -s "$lsf_errfile" ]] && sed 's/^/   rclone: /' "$lsf_errfile" >&2
    rm -f "$lsf_errfile"
    exit 1
  fi
  rm -f "$lsf_errfile"
  ALL_REMOTE=$(printf '%s\n' "$RAW_REMOTE" | grep -E '^[0-9]{8}_[0-9]{6}$' | sort || true)

  OLD_REMOTE=""
  if [[ -n "$ALL_REMOTE" ]]; then
    REMOTE_COUNT=$(printf '%s\n' "$ALL_REMOTE" | wc -l | tr -d ' ')
    if (( REMOTE_COUNT > OFFSITE_RETAIN )); then
      OLD_REMOTE=$(printf '%s\n' "$ALL_REMOTE" | head -n "$(( REMOTE_COUNT - OFFSITE_RETAIN ))")
    fi
  fi

  if [[ -z "$OLD_REMOTE" ]]; then
    echo "   Nothing to prune offsite (≤ $OFFSITE_RETAIN kept)."
  else
    # Attempt every prune, but remember any failure and exit nonzero at the end
    # so a swallowed purge error can't slip past as a "successful" backup run.
    purge_failed=0
    while IFS= read -r old; do
      if [[ "$DRY_RUN" == "false" ]]; then
        if rclone purge "$OFFSITE_REMOTE/$old"; then
          echo "   🗑️  pruned offsite $old"
        else
          echo "   ⚠️  failed to prune offsite $old" >&2
          purge_failed=1
        fi
      else
        echo "   [dry-run] Would purge offsite $old"
      fi
    done <<< "$OLD_REMOTE"

    if (( purge_failed != 0 )); then
      echo "❌ One or more offsite prunes failed — see warnings above." >&2
      exit 1
    fi
  fi
else
  echo ""
  echo "⏭️  [3/3] Offsite upload skipped (OFFSITE_ENABLED=$OFFSITE_ENABLED)"
  echo "   To enable: set OFFSITE_ENABLED=true and OFFSITE_REMOTE=<rclone-remote> in .env"
fi


# =============================================================================
# STEP 4: ROTATE OLD BACKUPS
# =============================================================================
# Delete local backup directories older than RETENTION_DAYS.
# -maxdepth 1: only look at direct children of BACKUP_ROOT (not subdirs)
# -type d: only directories (each backup is a timestamped directory)
# -mtime +N: modified more than N days ago
# =============================================================================

echo ""
echo "🗑️  Rotating backups older than ${RETENTION_DAYS} days..."

if [[ "$DRY_RUN" == "false" ]]; then
  DELETED=$(find "$BACKUP_ROOT" \
    -maxdepth 1 \
    -type d \
    -mtime +"$RETENTION_DAYS" \
    -print \
    -exec rm -rf {} + \
  2>/dev/null || true)

  if [[ -n "$DELETED" ]]; then
    echo "   Deleted: $DELETED"
  else
    echo "   Nothing to rotate."
  fi
else
  OLD_BACKUPS=$(find "$BACKUP_ROOT" -maxdepth 1 -type d -mtime +"$RETENTION_DAYS" 2>/dev/null || true)
  if [[ -n "$OLD_BACKUPS" ]]; then
    echo "   [dry-run] Would delete: $OLD_BACKUPS"
  else
    echo "   [dry-run] Nothing to rotate."
  fi
fi


# =============================================================================
# SUMMARY
# =============================================================================

echo ""
echo "============================================================"
echo "✅ Backup complete — $(date)"
echo "   Location: $BACKUP_DIR"

if [[ "$DRY_RUN" == "false" ]]; then
  TOTAL_SIZE=$(du -sh "$BACKUP_DIR" | cut -f1)
  echo "   Total size: $TOTAL_SIZE"
fi

# List current local backups
echo ""
echo "📋 Current local backups:"
find "$BACKUP_ROOT" -maxdepth 1 -type d -not -path "$BACKUP_ROOT" \
  | sort | while read -r dir; do
    SIZE=$(du -sh "$dir" 2>/dev/null | cut -f1 || echo "?")
    echo "   $SIZE  $(basename "$dir")"
  done

echo "============================================================"
