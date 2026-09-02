#!/bin/bash
# =============================================================================
# LOCAL RESTORE SCRIPT — load a PROD backup into LOCAL dev
# =============================================================================
#
# Companion to scripts/restore.sh (which runs ON the prod server). This one
# runs on your laptop against the LOCAL docker-compose.yml stack, and does the
# extra work needed to make a prod backup usable in dev:
#
#   1. Restores the Postgres dump into the local `db` container.
#   2. Restores the MinIO tar into the local `minio_data` volume.
#   3. REWRITES records.image_path — prod stores absolute URLs
#      (https://records.beforeiforgetthis.space/uploads/<uuid>.ext); locally
#      those must point at the local MinIO (http://localhost:9000/cogext-uploads/
#      <uuid>.ext). The object filenames are preserved by the tar, so only the
#      base URL changes.
#
# Prereqs:
#   - Local stack up:  docker compose up -d   (db + minio + minio-init)
#   - .env set to the local MinIO block (STORAGE_PROVIDER=minio, localhost:9000)
#   - A backup downloaded locally via scripts/download-backups.sh
#
# Usage:
#   ./scripts/restore-local.sh <timestamp>            # e.g. 20260902_020000
#   ./scripts/restore-local.sh /path/to/backup/dir    # explicit dir
#   ./scripts/restore-local.sh <timestamp> --db-only  # skip MinIO/images
#
# ⚠️  Overwrites your LOCAL database and MinIO bucket. Never point this at prod.
# =============================================================================

set -euo pipefail

# --- Config -----------------------------------------------------------------
# Where download-backups.sh drops backups locally (see DEPLOY.md).
LOCAL_BACKUP_ROOT="${LOCAL_BACKUP_ROOT:-$HOME/Projects/Backups/cogext}"

# Local Postgres creds — match docker-compose.yml (db service).
PG_USER="${POSTGRES_USER:-cogext}"
PG_DB="${POSTGRES_DB:-cogext}"

# Local MinIO public base — must match STORAGE_PUBLIC_URL in .env.
LOCAL_PUBLIC_URL="${STORAGE_PUBLIC_URL:-http://localhost:9000/cogext-uploads}"

# Run everything from the repo root so `docker compose` finds the local file.
REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"

# Compose project name → volume prefix (defaults to the repo dir name).
PROJECT="${COMPOSE_PROJECT_NAME:-$(basename "$REPO_ROOT")}"
MINIO_VOLUME="${PROJECT}_minio_data"

# --- Args -------------------------------------------------------------------
DB_ONLY=false
TARGET=""
for arg in "$@"; do
  case "$arg" in
    --db-only) DB_ONLY=true ;;
    *) TARGET="$arg" ;;
  esac
done

if [[ -z "$TARGET" ]]; then
  echo "Usage: $0 <timestamp|backup-dir> [--db-only]"
  echo ""
  echo "Available under $LOCAL_BACKUP_ROOT:"
  find "$LOCAL_BACKUP_ROOT" -maxdepth 1 -type d -not -path "$LOCAL_BACKUP_ROOT" 2>/dev/null \
    | sort | sed 's|.*/|  |' || echo "  (none)"
  exit 1
fi

# Resolve TARGET to a backup dir: accept a full path or a bare timestamp.
if [[ -d "$TARGET" ]]; then
  BACKUP_DIR="$TARGET"
else
  BACKUP_DIR="$LOCAL_BACKUP_ROOT/$TARGET"
fi

if [[ ! -d "$BACKUP_DIR" ]]; then
  echo "❌ Backup dir not found: $BACKUP_DIR"
  exit 1
fi

TIMESTAMP="$(basename "$BACKUP_DIR")"
POSTGRES_DUMP="$BACKUP_DIR/postgres_${TIMESTAMP}.sql.gz"
MINIO_BACKUP="$BACKUP_DIR/minio_${TIMESTAMP}.tar.gz"

if [[ ! -f "$POSTGRES_DUMP" ]]; then
  echo "❌ Postgres dump not found: $POSTGRES_DUMP"
  exit 1
fi

# --- Confirm ----------------------------------------------------------------
echo "============================================================"
echo "⚠️  LOCAL RESTORE — CogExt dev"
echo "============================================================"
echo "Backup:      $BACKUP_DIR"
echo "Into DB:     $PG_DB (local db container)"
echo "Images:      $([[ "$DB_ONLY" == true ]] && echo 'skipped (--db-only)' || echo "$MINIO_VOLUME → $LOCAL_PUBLIC_URL")"
echo ""
echo "This OVERWRITES your local database$([[ "$DB_ONLY" == true ]] || echo ' and MinIO bucket')."
echo "Type 'yes' to continue:"
read -r CONFIRM
[[ "$CONFIRM" == "yes" ]] || { echo "Aborted."; exit 0; }

# --- Step 1: Postgres -------------------------------------------------------
echo ""
echo "🔄 [1/3] Restoring Postgres..."

# Kick out active connections (the dev server may be attached) so DROPs don't block.
docker compose exec -T db \
  psql --username="$PG_USER" --dbname=postgres \
    --command="SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$PG_DB' AND pid <> pg_backend_pid();" \
  >/dev/null

# The dump was made with --clean --if-exists, so it drops+recreates as it goes.
gunzip -c "$POSTGRES_DUMP" \
  | docker compose exec -T db \
      psql --username="$PG_USER" --dbname="$PG_DB" --single-transaction --quiet
echo "   ✅ Postgres restored."

# --- Step 2: MinIO ----------------------------------------------------------
if [[ "$DB_ONLY" == false ]]; then
  echo ""
  echo "🗄️  [2/3] Restoring MinIO files..."

  if [[ ! -f "$MINIO_BACKUP" ]]; then
    echo "❌ MinIO tar not found: $MINIO_BACKUP"
    echo "   (Run with --db-only to skip images, or download the full backup.)"
    exit 1
  fi

  # Stop MinIO so we can safely replace the volume contents.
  docker compose stop minio >/dev/null

  # Wipe + extract the prod volume snapshot into the local volume.
  docker run --rm \
    -v "${MINIO_VOLUME}:/data" \
    -v "${BACKUP_DIR}:/backup:ro" \
    alpine \
    sh -c "rm -rf /data/* && tar xzf /backup/minio_${TIMESTAMP}.tar.gz -C /data"

  docker compose start minio >/dev/null

  # Re-apply the anonymous-download policy (the volume snapshot usually carries
  # it, but re-running is harmless and covers older backups). Uses a throwaway
  # mc container on the compose network.
  docker compose run --rm --entrypoint /bin/sh minio-init -c "
    until mc alias set local http://minio:9000 minioadmin minioadmin; do sleep 1; done;
    mc mb --ignore-existing local/cogext-uploads;
    mc anonymous set download local/cogext-uploads;
  " >/dev/null
  echo "   ✅ MinIO restored + bucket policy applied."
else
  echo ""
  echo "⏭️  [2/3] MinIO restore skipped (--db-only)."
fi

# --- Step 3: Rewrite image URLs --------------------------------------------
echo ""
echo "🔗 [3/3] Rewriting image_path URLs → local MinIO..."

# Replace everything up to and including the last '/' with the local base,
# keeping the <uuid>.<ext> filename. Idempotent: rows already pointing at the
# local base are skipped. Works regardless of what the prod domain was.
docker compose exec -T db \
  psql --username="$PG_USER" --dbname="$PG_DB" --quiet \
    --command="UPDATE records
               SET image_path = '${LOCAL_PUBLIC_URL}/' || regexp_replace(image_path, '^.*/', '')
               WHERE image_path IS NOT NULL
                 AND image_path <> ''
                 AND image_path NOT LIKE '${LOCAL_PUBLIC_URL}/%';"

echo "   ✅ image_path rewritten."

# --- Step 4: Apply migrations newer than the backup -------------------------
# A backup taken before a schema change restores an OLD schema; the local code
# expects the current one. `npm run dev` does NOT auto-migrate (only the prod
# Docker entrypoint does), so apply pending migrations here.
#
# We use scripts/migrate.mjs (drizzle-orm's runtime migrator — the exact path
# prod uses), NOT `drizzle-kit migrate`: drizzle-kit fails on migrations with
# `ALTER TYPE ... ADD VALUE` (enum additions), the runtime migrator handles them.
echo ""
echo "🧬 [4/4] Applying migrations newer than the backup..."
if node scripts/migrate.mjs; then
  echo "   ✅ migrations up to date."
else
  echo "   ⚠️  Migration failed — inspect the error above and finish by hand."
fi

echo ""
echo "============================================================"
echo "✅ Local restore complete — from $TIMESTAMP"
echo "   Restart the dev server if it was running: npm run dev"
echo "============================================================"
