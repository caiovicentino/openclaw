#!/bin/sh
set -e

# Default values if not set
: "${API_URL:=http://localhost:3000}"
: "${PORT:=80}"

# ── Inject frontend runtime env vars ──
# Vite bakes VITE_* vars at build time, but on Railway these may only
# be available at runtime. Generate env-config.js so the SPA can read them.
cat > /usr/share/nginx/html/env-config.js <<ENVEOF
window.__ENV__ = {
  VITE_STACK_AUTH_PROJECT_ID: "${VITE_STACK_AUTH_PROJECT_ID:-}",
  VITE_STACK_AUTH_PUBLISHABLE_KEY: "${VITE_STACK_AUTH_PUBLISHABLE_KEY:-}",
  VITE_CHAT_URL: "${VITE_CHAT_URL:-}"
};
ENVEOF

# Use envsubst to replace variables in nginx config template
# Only substitute API_URL and PORT to avoid breaking nginx variables like $uri, $host, etc.
envsubst '${API_URL} ${PORT}' < /etc/nginx/templates/default.conf.template > /etc/nginx/conf.d/default.conf

echo "Starting nginx on port ${PORT} with API_URL=${API_URL}"

# Start nginx in foreground
exec nginx -g 'daemon off;'
