#!/usr/bin/env bash
# Proves the e2e stack is usable BEFORE any Playwright test runs, and prints the
# evidence of each phase (container start times, plugin registration, backend
# health). A plugin that failed to load otherwise surfaces as 15 obscure red tests;
# here it fails once, early, with the Grafana log attached.
#
# Used by CI (output appended to the step summary) and locally: npm run e2e:stack:verify
set -euo pipefail

GRAFANA_URL="${GRAFANA_URL:-http://localhost:3000}"
PLUGIN_ID="clevercloud-warp10-datasource"
# Default credentials of the official Grafana image; the stack is disposable
AUTH="admin:admin"
COMPOSE=(docker compose -f "$(dirname "$0")/docker-compose-plugin.yaml")

api() {
  curl -fsS -u "$AUTH" "$GRAFANA_URL/api$1"
}

fail() {
  echo "::error::$1"
  echo "--- grafana log (tail) ---"
  "${COMPOSE[@]}" logs --no-color grafana | tail -60
  exit 1
}

echo "### Stack ($(date -u +%FT%TZ))"
"${COMPOSE[@]}" ps --format 'table {{.Service}}\t{{.Image}}\t{{.Status}}'
for svc in warp10 grafana; do
  cid=$("${COMPOSE[@]}" ps -q "$svc")
  [ -n "$cid" ] || fail "service $svc is not running"
  docker inspect --format "- $svc: started={{.State.StartedAt}} health={{.State.Health.Status}}" "$cid"
done

echo "### Plugin"
plugin=$(api "/plugins" | jq -c --arg id "$PLUGIN_ID" '[.[] | select(.id == $id)] | first')
[ "$plugin" != "null" ] || fail "plugin $PLUGIN_ID is not registered in Grafana"
echo "$plugin" | jq -r '"- \(.id) type=\(.type) version=\(.info.version) signature=\(.signature)"'
"${COMPOSE[@]}" logs --no-color grafana 2>/dev/null | grep -E "Plugin registered.*pluginId=$PLUGIN_ID" | head -1 | sed 's/^/- /' || true

echo "### Provisioned datasource"
ds=$(api "/datasources" | jq -c --arg id "$PLUGIN_ID" '[.[] | select(.type == $id)] | first')
[ "$ds" != "null" ] || fail "no provisioned datasource of type $PLUGIN_ID"
echo "$ds" | jq -r '"- \(.name) url=\(.url)"'

# The health check goes through the backend binary: this is the proof the linux
# executable shipped in dist/ actually starts (a lost +x bit dies here, not in the tests)
uid=$(echo "$ds" | jq -r .uid)
health=$(api "/datasources/uid/$uid/health") || fail "backend health check failed for datasource $uid"
echo "- health: $(echo "$health" | jq -c .)"
[ "$(echo "$health" | jq -r .status | tr '[:upper:]' '[:lower:]')" = "ok" ] || fail "backend health check returned: $health"

echo "### Ready ($(date -u +%FT%TZ))"
