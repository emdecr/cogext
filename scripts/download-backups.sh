#!/bin/bash
# =============================================================================
# DOWNLOAD BACKUPS — run from your local Mac
# =============================================================================
#
# Downloads database backups from the server to your local machine.
#
# Usage:
#   ./scripts/download-backups.sh              # sync all backups
#   ./scripts/download-backups.sh 20260328     # download a specific date
#
# Prerequisites:
#   - SSH access to the server as the deploy user
#   - SSH key configured (ssh deploy@$DEPLOY_HOST works)
#   - DEPLOY_HOST env var set to your server hostname
# =============================================================================

set -euo pipefail

REMOTE_USER="deploy"
REMOTE_HOST="${DEPLOY_HOST:?Set DEPLOY_HOST to your server hostname}"
REMOTE_DIR="/opt/backups/cogext"
LOCAL_DIR="$HOME/Projects/Backups/cogext"

# Create local directory if it doesn't exist
mkdir -p "$LOCAL_DIR"

if [[ -n "${1:-}" ]]; then
  # Download a specific backup by date prefix
  echo "Downloading backups matching: $1"
  rsync -avz --progress \
    --include="$1*/" \
    --include="$1*/**" \
    --exclude="*" \
    "$REMOTE_USER@$REMOTE_HOST:$REMOTE_DIR/" \
    "$LOCAL_DIR/"
else
  # Sync all backups
  echo "Syncing all backups from $REMOTE_HOST..."
  rsync -avz --progress \
    "$REMOTE_USER@$REMOTE_HOST:$REMOTE_DIR/" \
    "$LOCAL_DIR/"
fi

echo ""
echo "Backups saved to: $LOCAL_DIR"
ls -lh "$LOCAL_DIR"
