#!/usr/bin/env bash
# Smoke test for the llm-proxy Worker (run against `wrangler dev`).
#   bash scripts/smoke.sh          -> health, auth-required, validation
#   bash scripts/smoke.sh --real   -> also one real /api/llm completion (small paid call)
# Env: PROXY_URL (default http://127.0.0.1:8787), DEV_VARS (default ../.dev.vars), SMOKE_MODEL (default gpt-5-mini)
# Exit: 0 all pass, 1 a check failed, 2 PROXY_SECRET missing.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROXY_URL="${PROXY_URL:-http://127.0.0.1:8787}"
DEV_VARS="${DEV_VARS:-$SCRIPT_DIR/../.dev.vars}"
SMOKE_MODEL="${SMOKE_MODEL:-gpt-5-mini}"
REAL=0
[ "${1:-}" = "--real" ] && REAL=1

SECRET=""
if [ -f "$DEV_VARS" ]; then
  # Tolerates `export`, spaces around `=`, CRLF, and single or double quotes.
  # Inline trailing comments are not supported (would be ambiguous with secret chars).
  SECRET="$(grep -E '^[[:space:]]*(export[[:space:]]+)?PROXY_SECRET[[:space:]]*=' "$DEV_VARS" | head -n1 \
    | sed -E 's/^[^=]*=[[:space:]]*//' | tr -d '\r' | sed -E 's/[[:space:]]+$//' \
    | sed -e "s/^[\"']//" -e "s/[\"']\$//" || true)"
fi
if [ -z "$SECRET" ]; then
  echo "PROXY_SECRET missing in .dev.vars"
  exit 2
fi
case "$SECRET" in
  \"* | \'* | *\" | *\')
    echo "PROXY_SECRET in .dev.vars has unbalanced or nested quotes; fix the value"
    exit 2
    ;;
esac

HDR_FILE="$(mktemp)"
BODY_FILE="$(mktemp)"
trap 'rm -f "$HDR_FILE" "$BODY_FILE"' EXIT
chmod 600 "$HDR_FILE" "$BODY_FILE"
printf 'Authorization: Bearer %s\n' "$SECRET" > "$HDR_FILE"
unset SECRET

FAILED=0

check() { # name expected actual
  if [ "$2" = "$3" ]; then
    echo "PASS $1 ($3)"
  else
    echo "FAIL $1 (expected $2, got $3)"
    FAILED=1
  fi
}

# (a) health
STATUS="$(curl -s -m 15 -o "$BODY_FILE" -w '%{http_code}' "$PROXY_URL/" || true)"
if [ "$STATUS" = "200" ] && grep -q '"status":"ok"' "$BODY_FILE"; then
  echo "PASS health ($STATUS)"
else
  echo "FAIL health (expected 200 with status ok, got $STATUS)"
  FAILED=1
fi

# (b) auth required
STATUS="$(curl -s -m 15 -o "$BODY_FILE" -w '%{http_code}' -X POST -H 'Content-Type: application/json' \
  -d "{\"model\":\"$SMOKE_MODEL\"}" "$PROXY_URL/api/llm" || true)"
check auth-required 401 "$STATUS"

# (c) validation
STATUS="$(curl -s -m 15 -o "$BODY_FILE" -w '%{http_code}' -X POST -H @"$HDR_FILE" -H 'Content-Type: application/json' \
  -d "{\"model\":\"$SMOKE_MODEL\"}" "$PROXY_URL/api/llm" || true)"
check validation 400 "$STATUS"

# (d) real call
if [ "$REAL" = "1" ]; then
  STATUS="$(curl -s -m 90 -o "$BODY_FILE" -w '%{http_code}' -X POST -H @"$HDR_FILE" -H 'Content-Type: application/json' \
    -d "{\"model\":\"$SMOKE_MODEL\",\"systemPrompt\":\"Reply with the single word ok.\",\"userPrompt\":\"ping\"}" \
    "$PROXY_URL/api/llm" || true)"
  if [ "$STATUS" = "200" ] && grep -q '"ok":true' "$BODY_FILE"; then
    echo "PASS real-call ($STATUS)"
  else
    echo "FAIL real-call (expected 200 with ok:true, got $STATUS)"
    echo "  (upstream error body suppressed; inspect the wrangler dev output for details)"
    FAILED=1
  fi
fi

exit "$FAILED"
