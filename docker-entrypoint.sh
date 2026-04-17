#!/bin/sh
set -e
# Fix Railway Volume permissions — mounted as root, chown to node before dropping privileges
chown -R node:node /app/data 2>/dev/null || true
chmod 755 /app/data 2>/dev/null || true
# Drop to node user and run the app
exec su-exec node "$@"
