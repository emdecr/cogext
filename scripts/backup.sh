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
  docker compose \
    -f "$COMPOSE_FILE" \
    exec -T db \
    pg_dump \
      --username="$POSTGRES_USER" \
      --no-password \
      --clean \            # include DROP statements before CREATE (safe for restore)
      --if-exists \        # makes DROP statements non-fatal if table doesn't exist
      --format=plain \     # plain SQL (readable, portable, restorable with psql)
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
