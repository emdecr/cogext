#!/bin/bash
# =============================================================================
# RESTORE SCRIPT — Postgres + MinIO
# =============================================================================
#
# Restores a backup created by backup.sh.
#
# ⚠️  THIS WILL OVERWRITE ALL CURRENT DATA. Use with extreme care.
#
# Usage:
#   ./scripts/restore.sh <backup-timestamp>
#   ./scripts/restore.sh 20260324_020000
#
# To list available backups:
#   ls /opt/backups/brain-extension/
#
# What this does:
#   1. Stops the app container (keeps DB and MinIO running)
#   2. Drops and recreates the Postgres database from the SQL dump
#   3. Restores MinIO files from the tar archive
#   4. Restarts the app
#
# The DB and MinIO stay running during restore — we connect to them directly.
# Only the app is stopped to prevent writes during the restore window.
# =============================================================================

set -euo pipefail

# =============================================================================
# CONFIGURATION — must match backup.sh
# =============================================================================

COMPOSE_PROJECT="brain-extension"
COMPOSE_FILE="/opt/brain-extension/docker-compose.prod.yml"
BACKUP_ROOT="/opt/backups/brain-extension"
ENV_FILE="/opt/brain-extension/.env.prod"

# =============================================================================
# VALIDATION
# =============================================================================

# Require a backup timestamp argument.
if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <backup-timestamp>"
  echo ""
  echo "Available backups:"
  find "$BACKUP_ROOT" -maxdepth 1 -type d -not -path "$BACKUP_ROOT" \
    | sort | while read -r dir; do
      SIZE=$(du -sh "$dir" 2>/dev/null | cut -f1 || echo "?")
      echo "  $SIZE  $(basename "$dir")"
    done
  exit 1
fi

TIMESTAMP="$1"
BACKUP_DIR="$BACKUP_ROOT/$TIMESTAMP"

if [[ ! -d "$BACKUP_DIR" ]]; then
  echo "❌ Backup not found: $BACKUP_DIR"
  exit 1
fi

# Load env for credentials
if [[ -f "$ENV_FILE" ]]; then
  # shellcheck disable=SC1090
  source "$ENV_FILE"
else
  echo "❌ Env file not found: $ENV_FILE"
  exit 1
fi

# =============================================================================
# CONFIRM
# =============================================================================
# This is a destructive operation. Require explicit confirmation.
echo "============================================================"
echo "⚠️  RESTORE — Brain Extension"
echo "============================================================"
echo ""
echo "Backup:    $BACKUP_DIR"
echo "Database:  $POSTGRES_DB"
echo ""
echo "This will OVERWRITE all current data with the backup."
echo "Type 'yes' to continue, anything else to abort:"
read -r CONFIRM

if [[ "$CONFIRM" != "yes" ]]; then
  echo "Aborted."
  exit 0
fi

# =============================================================================
# STEP 1: STOP THE APP
# =============================================================================
# Stop only the app container, not the DB or MinIO.
# This prevents new writes during the restore window.
# The app will restart automatically at the end.

echo ""
echo "⏹️  [1/4] Stopping app container..."
docker compose -f "$COMPOSE_FILE" stop app
echo "   ✅ App stopped."


# =============================================================================
# STEP 2: RESTORE POSTGRES
# =============================================================================
# We use psql (not pg_restore) because we dumped in plain SQL format.
#
# Steps:
#   a. Drop all connections to the database (can't drop a DB with active connections)
#   b. Drop and recreate the database
#   c. Pipe the gunzipped SQL dump into psql
#
# --single-transaction: wraps the entire restore in one transaction.
# If any statement fails, the whole restore rolls back cleanly.
# Without this, a partial restore is worse than no restore.

echo ""
echo "🔄 [2/4] Restoring PostgreSQL..."

POSTGRES_DUMP="$BACKUP_DIR/postgres_${TIMESTAMP}.sql.gz"

if [[ ! -f "$POSTGRES_DUMP" ]]; then
  echo "❌ Postgres dump not found: $POSTGRES_DUMP"
  exit 1
fi

# Terminate all active connections to the database.
# `pg_terminate_backend` is a Postgres function that kicks out connected clients.
# Required before you can drop or restore into the database.
docker compose -f "$COMPOSE_FILE" exec -T db \
  psql \
    --username="$POSTGRES_USER" \
    --dbname=postgres \
    --command="SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$POSTGRES_DB' AND pid <> pg_backend_pid();"

# Restore: pipe the compressed dump into psql.
# pg_dump --clean included DROP statements, so this handles re-creation.
gunzip -c "$POSTGRES_DUMP" | \
  docker compose -f "$COMPOSE_FILE" exec -T db \
    psql \
      --username="$POSTGRES_USER" \
      --dbname="$POSTGRES_DB" \
      --single-transaction \
      --quiet

echo "   ✅ PostgreSQL restored."


# =============================================================================
# STEP 3: RESTORE MINIO FILES
# =============================================================================
# We restore by:
#   1. Clearing the existing volume contents (tar --overwrite handles this)
#   2. Extracting the backup tar into the volume via a temp Alpine container
#
# The volume must exist (it was created by docker compose up).
# We DON'T recreate the volume — that would require stopping MinIO.
# Instead we extract files on top of the existing volume contents.

echo ""
echo "🗄️  [3/4] Restoring MinIO files..."

MINIO_BACKUP="$BACKUP_DIR/minio_${TIMESTAMP}.tar.gz"
MINIO_VOLUME="${COMPOSE_PROJECT}_minio_data"

if [[ ! -f "$MINIO_BACKUP" ]]; then
  echo "❌ MinIO backup not found: $MINIO_BACKUP"
  exit 1
fi

# Stop MinIO before restoring its data (avoid corrupted state from concurrent writes)
docker compose -f "$COMPOSE_FILE" stop minio

# Clear existing volume contents and extract backup
docker run --rm \
  -v "${MINIO_VOLUME}:/data" \
  -v "${BACKUP_DIR}:/backup:ro" \
  alpine \
  sh -c "rm -rf /data/* && tar xzf /backup/minio_${TIMESTAMP}.tar.gz -C /data"

# Restart MinIO
docker compose -f "$COMPOSE_FILE" start minio

echo "   ✅ MinIO restored."


# =============================================================================
# STEP 4: RESTART APP
# =============================================================================
# Start the app back up. The entrypoint will run migrations (idempotent — safe
# to run even though we just restored, since the backup already includes the
# migration state in the __drizzle_migrations table).

echo ""
echo "🚀 [4/4] Restarting app..."
docker compose -f "$COMPOSE_FILE" start app
echo "   ✅ App restarted."


# =============================================================================
# DONE
# =============================================================================

echo ""
echo "============================================================"
echo "✅ Restore complete — $(date)"
echo "   Restored from: $BACKUP_DIR"
echo "============================================================"
