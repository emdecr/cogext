#!/bin/bash
# =============================================================================
# DOWNLOAD MINIO IMAGES — run from your local Mac
# =============================================================================
#
# On-demand script to download all uploaded images from MinIO on the server.
# Uses an SSH tunnel so MinIO doesn't need to be publicly accessible.
#
# Usage:
#   ./scripts/download-minio-images.sh
#
# Prerequisites:
#   - SSH access to the server as the deploy user
#   - MinIO client (mc) installed locally:
#       brew install minio/stable/mc
#   - MINIO_ROOT_USER and MINIO_ROOT_PASSWORD from your .env.prod
#     (set them as env vars or edit the defaults below)
# =============================================================================

set -euo pipefail

REMOTE_USER="deploy"
REMOTE_HOST="records.beforeiforgetthis.space"
LOCAL_DIR="$HOME/Projects/Backups/brain-extension/images"
BUCKET="brain-uploads"
TUNNEL_PORT=9099  # Use non-standard port to avoid conflicts

# MinIO credentials — set these or export them before running
MINIO_USER="${MINIO_ROOT_USER:-}"
MINIO_PASS="${MINIO_ROOT_PASSWORD:-}"

if [[ -z "$MINIO_USER" || -z "$MINIO_PASS" ]]; then
  echo "Set MINIO_ROOT_USER and MINIO_ROOT_PASSWORD environment variables."
  echo "These should match the values in your .env.prod on the server."
  echo ""
  echo "Example:"
  echo "  MINIO_ROOT_USER=myuser MINIO_ROOT_PASSWORD=mypass ./scripts/download-minio-images.sh"
  exit 1
fi

# Check for mc
if ! command -v mc &> /dev/null; then
  echo "MinIO client (mc) not found. Install with: brew install minio/stable/mc"
  exit 1
fi

mkdir -p "$LOCAL_DIR"

# Open SSH tunnel in the background
echo "Opening SSH tunnel to MinIO (port $TUNNEL_PORT)..."
ssh -fNL "$TUNNEL_PORT:localhost:9000" "$REMOTE_USER@$REMOTE_HOST"
TUNNEL_PID=$(lsof -ti :"$TUNNEL_PORT" -sTCP:LISTEN | head -1)

# Cleanup tunnel on exit
cleanup() {
  if [[ -n "${TUNNEL_PID:-}" ]]; then
    echo "Closing SSH tunnel (PID $TUNNEL_PID)..."
    kill "$TUNNEL_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT

# Configure mc alias for this session
mc alias set brain-remote "http://localhost:$TUNNEL_PORT" "$MINIO_USER" "$MINIO_PASS" --quiet

# Mirror all files from the bucket
echo "Downloading images from $BUCKET..."
mc mirror --overwrite "brain-remote/$BUCKET" "$LOCAL_DIR/"

echo ""
echo "Images saved to: $LOCAL_DIR"
du -sh "$LOCAL_DIR"
