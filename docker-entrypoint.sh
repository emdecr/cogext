#!/bin/sh
# =============================================================================
# DOCKER ENTRYPOINT — runs on container startup
# =============================================================================
#
# This script is the container's entry point (PID 1, via dumb-init).
# It runs before the Next.js app starts and ensures the database is ready.
#
# Steps:
#   1. Run database migrations (migrate.mjs)
#   2. If migrations succeed, start the Next.js app (server.js)
#   3. If migrations fail, exit — the container stops and Docker marks it
#      unhealthy, alerting you that something's wrong before traffic is served.
#
# Why sh not bash?
#   Alpine Linux (our base image) doesn't include bash — only sh (ash).
#   Always use #!/bin/sh in Docker entrypoints unless you explicitly
#   install bash in the image.
#
# Why `set -e`?
#   Makes the script exit immediately if any command returns a non-zero exit
#   code. Without it, if `node migrate.mjs` fails, the script would silently
#   continue and start the app with an un-migrated database.
#
# Why `exec node server.js` not just `node server.js`?
#   `exec` replaces the shell process with the Node process (same PID).
#   Without exec, you'd have:  sh (PID 1) → node (PID 2)
#   With exec, you have:       node (PID 1)
#   This matters because Docker sends SIGTERM to PID 1 for graceful shutdown.
#   If node isn't PID 1 (or wrapped in dumb-init as PID 1), it doesn't
#   receive the signal and gets killed hard after the timeout.
#   dumb-init (our PID 1) forwards signals to its children — exec ensures
#   the signal reaches the right process.
# =============================================================================

set -e

echo "⏳ Starting Brain Extension..."

# Run database migrations.
# If this exits with code != 0, `set -e` stops the script here.
# The container exits, Docker marks it unhealthy.
node migrate.mjs

# Migrations succeeded. Start the Next.js standalone server.
# `exec` hands off the process — node becomes the main process.
echo "🚀 Starting Next.js server..."
exec node server.js
