#!/bin/bash
#
# CC Bridge 测试脚本
# 用法: bash test.sh [peer_url]
#

PEER_URL="${1:-http://localhost:5111}"

echo "═══════════════════════════════════════"
echo "  CC Bridge Test Suite"
echo "  Target: $PEER_URL"
echo "═══════════════════════════════════════"
echo

PASS=0
FAIL=0

check() {
    local name="$1"
    local status="$2"
    local body="$3"

    if [ "$status" = "200" ]; then
        echo "  ✓ $name"
        PASS=$((PASS + 1))
    else
        echo "  ✗ $name (HTTP $status)"
        echo "    $body" | head -3
        FAIL=$((FAIL + 1))
    fi
}

# ── Test 1: Health Check ───────────────────────────────

echo "▸ Test 1: Health Check"
RESP=$(curl -s -w "\n%{http_code}" "$PEER_URL/health" 2>/dev/null)
HTTP_CODE=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | sed '$d')
check "GET /health" "$HTTP_CODE" "$BODY"

# ── Test 2: Capabilities ──────────────────────────────

echo "▸ Test 2: Capabilities"
RESP=$(curl -s -w "\n%{http_code}" "$PEER_URL/capabilities" 2>/dev/null)
HTTP_CODE=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | sed '$d')
check "GET /capabilities" "$HTTP_CODE" "$BODY"
if [ "$HTTP_CODE" = "200" ]; then
    echo "    Device: $(echo "$BODY" | python3 -c 'import sys,json; print(json.load(sys.stdin).get("device","?"))' 2>/dev/null)"
    echo "    Version: $(echo "$BODY" | python3 -c 'import sys,json; print(json.load(sys.stdin).get("claude_version","?"))' 2>/dev/null)"
fi

# ── Test 3: Single Chat ───────────────────────────────

echo "▸ Test 3: Single-turn Chat"
RESP=$(curl -s -w "\n%{http_code}" -X POST "$PEER_URL/chat" \
    -H "Content-Type: application/json" \
    -d '{"prompt":"Reply with exactly: BRIDGE_TEST_OK"}' 2>/dev/null)
HTTP_CODE=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | sed '$d')
check "POST /chat (single)" "$HTTP_CODE" "$BODY"
if [ "$HTTP_CODE" = "200" ]; then
    CID=$(echo "$BODY" | python3 -c 'import sys,json; print(json.load(sys.stdin).get("conversation_id",""))' 2>/dev/null)
    echo "    conversation_id: $CID"
fi

# ── Test 4: Multi-turn Chat ───────────────────────────

if [ -n "$CID" ] && [ "$CID" != "" ]; then
    echo "▸ Test 4: Multi-turn Chat (resume)"
    RESP=$(curl -s -w "\n%{http_code}" -X POST "$PEER_URL/chat" \
        -H "Content-Type: application/json" \
        -d "{\"prompt\":\"What was my previous message?\",\"conversation_id\":\"$CID\"}" 2>/dev/null)
    HTTP_CODE=$(echo "$RESP" | tail -1)
    BODY=$(echo "$RESP" | sed '$d')
    check "POST /chat (multi-turn)" "$HTTP_CODE" "$BODY"
    TURNS=$(echo "$BODY" | python3 -c 'import sys,json; print(json.load(sys.stdin).get("turns",0))' 2>/dev/null)
    echo "    turns: $TURNS"
else
    echo "▸ Test 4: Skipped (no conversation_id from Test 3)"
    FAIL=$((FAIL + 1))
fi

# ── Test 5: Sessions List ─────────────────────────────

echo "▸ Test 5: Sessions List"
RESP=$(curl -s -w "\n%{http_code}" "$PEER_URL/sessions" 2>/dev/null)
HTTP_CODE=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | sed '$d')
check "GET /sessions" "$HTTP_CODE" "$BODY"

# ── Summary ───────────────────────────────────────────

echo
echo "═══════════════════════════════════════"
echo "  Results: $PASS passed, $FAIL failed"
echo "═══════════════════════════════════════"

[ $FAIL -eq 0 ] && exit 0 || exit 1
