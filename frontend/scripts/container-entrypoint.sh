#!/bin/sh
set -eu

cd /app
export SERVER_API_URL="${SERVER_API_URL:-http://backend:8080}"

if node scripts/wait-for-backend.mjs && node_modules/.bin/astro build; then
  cp -a dist/. /srv/
else
  echo "[frontend] Backend rendering failed; serving the bundled sample menus."
fi

exec "$@"
