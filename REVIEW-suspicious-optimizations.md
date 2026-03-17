# Code Review: Suspicious Optimizations & Issues

**Date**: 2026-03-17
**Scope**: cc-bridge/, github-hunter/scripts/

---

## Critical Issues

### 1. Bash Subshell Variable Bug — Counters Always Zero

**File**: `github-hunter/scripts/run_daily.sh:76-149`

The `while` loop reads from a pipe (`jq ... | while`), creating a subshell. All variable modifications inside (`PRS_CREATED`, `REPOS_ANALYZED`, `REPOS_WITH_ISSUES`) are **lost** when the loop exits. The summary at lines 156-159 always shows 0.

```bash
# Line 76 — pipe creates subshell
jq -c ".[:${MAX_REPOS}][]" "$TRENDING_FILE" | while IFS= read -r repo_json; do
  PRS_CREATED=$((PRS_CREATED + 1))     # Increment lost after loop
  REPOS_ANALYZED=$((REPOS_ANALYZED + 1)) # Increment lost after loop
done
# PRS_CREATED is still 0 here
```

**Fix**: Use process substitution: `while ... done < <(jq ...)`

### 2. Safety Limit Never Triggers — Unlimited PRs

**File**: `github-hunter/scripts/run_daily.sh:109`

Because of bug #1, `PRS_CREATED` never increments in the parent shell. The `MAX_PRS_PER_RUN=5` safety limit at line 109 **never fires**. The bot could create unlimited PRs per run.

---

## Security Issues

### 3. Timing-Unsafe Token Comparison

**File**: `cc-bridge/bridge.py:169`

```python
if token != AUTH_TOKEN:  # Vulnerable to timing attacks
```

**Fix**: Use `hmac.compare_digest(token, AUTH_TOKEN)`.

### 4. Server Binds to 0.0.0.0 with No Auth by Default

**File**: `cc-bridge/bridge.py:256` + `cc-bridge/peers.json:13`

The HTTP server binds to all interfaces, and `auth_token` ships empty. Anyone on the network can POST arbitrary prompts to Claude — effectively an **open RCE**.

**Fix**: Default to `127.0.0.1`; require token configuration on first run.

### 5. No Request Body Size Limit — DoS Vector

**File**: `cc-bridge/bridge.py:183-187`

```python
length = int(self.headers.get("Content-Length", 0))
raw = self.rfile.read(length)  # No upper bound
```

An attacker can send `Content-Length: 10737418240` to exhaust memory.

**Fix**: Cap at a reasonable maximum (e.g., 1 MB).

### 6. `git add -A` Stages Everything in Automated PRs

**File**: `github-hunter/scripts/create_fix_pr.sh:101`

```bash
git add -A  # Could stage secrets, .env files, or unintended changes
```

**Fix**: Stage only the specific files identified in `files_to_change`.

---

## Correctness Issues

### 7. Race Condition on Session Access

**File**: `cc-bridge/bridge.py:108`

```python
with sessions_lock:
    sessions[conversation_id] = { ... }
# Outside lock:
return {
    "turns": sessions[conversation_id]["turns"]  # Race condition
}
```

**Fix**: Build the return dict inside the `with sessions_lock` block.

### 8. macOS-Only Date Commands

- `github-hunter/scripts/fetch_trending.sh:56`: `date -v-1d` (macOS only)
- `github-hunter/scripts/run_daily.sh:85`: `date -jf "%Y-%m-%d"` (macOS only)

Both fail on Linux. Use `date -d "yesterday"` on Linux or detect platform.

---

## Minor Efficiency Issues

### 9. Config Reloaded on Every MCP Request

**File**: `cc-bridge/mcp-server.js:78,140`

`loadPeers()` and `loadToken()` re-read and parse `peers.json` from disk on every tool invocation. Should load once at startup (optionally with file watch for hot reload).

---

## Summary

| # | Severity | File | Issue |
|---|----------|------|-------|
| 1 | **CRITICAL** | run_daily.sh:76 | Subshell bug — counters always zero |
| 2 | **CRITICAL** | run_daily.sh:109 | PR safety limit never triggers |
| 3 | HIGH | bridge.py:169 | Timing-unsafe token comparison |
| 4 | HIGH | bridge.py:256 | 0.0.0.0 bind + no auth = open RCE |
| 5 | HIGH | bridge.py:183 | No body size limit — DoS |
| 6 | MEDIUM | create_fix_pr.sh:101 | `git add -A` stages unintended files |
| 7 | MEDIUM | bridge.py:108 | Race condition on session data |
| 8 | LOW | fetch_trending.sh:56, run_daily.sh:85 | macOS-only date commands |
| 9 | LOW | mcp-server.js:78 | Unnecessary disk I/O per request |
