#!/bin/sh
set -e

# Default values if not set
: "${API_URL:=http://localhost:3000}"
: "${PORT:=80}"

# Use envsubst to replace variables in nginx config template
# Only substitute API_URL and PORT to avoid breaking nginx variables like $uri, $host, etc.
envsubst '${API_URL} ${PORT}' < /etc/nginx/templates/default.conf.template > /etc/nginx/conf.d/default.conf

echo "Starting nginx on port ${PORT} with API_URL=${API_URL}"

# Start nginx in foreground
exec nginx -g 'daemon off;'
