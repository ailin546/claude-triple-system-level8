#!/usr/bin/env bash
# analyze_repo.sh - Clone a repo and use Claude Code to find issues & generate fixes
# Usage: ./analyze_repo.sh <repo_full_name> <output_dir>
# Example: ./analyze_repo.sh "owner/repo" ./output/fixes

set -eo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

REPO_FULL_NAME="$1"
OUTPUT_BASE="${2:-${PROJECT_DIR}/output/fixes}"
WORK_DIR="${3:-${PROJECT_DIR}/workdir}"

# Resolve to absolute paths
OUTPUT_BASE="$(mkdir -p "$OUTPUT_BASE" && cd "$OUTPUT_BASE" && pwd)"
WORK_DIR="$(mkdir -p "$WORK_DIR" && cd "$WORK_DIR" && pwd)"

REPO_NAME=$(echo "$REPO_FULL_NAME" | tr '/' '_')
REPO_DIR="${WORK_DIR}/${REPO_NAME}"
FIX_DIR="${OUTPUT_BASE}/${REPO_NAME}"
LOG_FILE="${FIX_DIR}/analysis.log"

mkdir -p "$FIX_DIR" "$WORK_DIR"

log() {
  echo "[$(date '+%H:%M:%S')] $*" | tee -a "$LOG_FILE"
}

log "=== Analyzing ${REPO_FULL_NAME} ==="

# Step 1: Clone repo (shallow clone for speed)
if [ -d "$REPO_DIR" ]; then
  log "Repo already cloned, pulling latest..."
  cd "$REPO_DIR"
  git pull --ff-only 2>/dev/null || true
else
  log "Cloning ${REPO_FULL_NAME}..."
  gh repo clone "$REPO_FULL_NAME" "$REPO_DIR" -- --depth=1 2>&1 | tee -a "$LOG_FILE" || true
fi

cd "$REPO_DIR"

# Step 2: Gather repo context
LANG=$(gh repo view "$REPO_FULL_NAME" --json primaryLanguage --jq '.primaryLanguage.name // "Unknown"' 2>/dev/null || echo "Unknown")
ISSUES_COUNT=$(gh repo view "$REPO_FULL_NAME" --json issues --jq '.issues.totalCount // 0' 2>/dev/null || echo "0")
HAS_CONTRIBUTING=$([ -f CONTRIBUTING.md ] && echo "yes" || echo "no")
LICENSE=$(gh repo view "$REPO_FULL_NAME" --json licenseInfo --jq '.licenseInfo.spdxId // "None"' 2>/dev/null || echo "Unknown")

log "Language: ${LANG}, Issues: ${ISSUES_COUNT}, Contributing guide: ${HAS_CONTRIBUTING}, License: ${LICENSE}"

# Skip repos without open-source-friendly licenses
case "$LICENSE" in
  MIT|Apache-2.0|BSD-2-Clause|BSD-3-Clause|ISC|MPL-2.0|LGPL-*|GPL-*|AGPL-*|Unlicense|CC0-1.0)
    log "License OK: ${LICENSE}"
    ;;
  *)
    log "WARNING: License is ${LICENSE} - may not accept external PRs. Proceeding with caution."
    ;;
esac

# Step 3: Check existing open issues for easy wins
log "Fetching open issues with 'good first issue' or 'bug' labels..."
gh issue list --repo "$REPO_FULL_NAME" \
  --label "bug,good first issue" \
  --state open \
  --limit 10 \
  --json number,title,body \
  > "${FIX_DIR}/open_issues.json" 2>/dev/null || echo "[]" > "${FIX_DIR}/open_issues.json"

ISSUE_COUNT=$(jq length "${FIX_DIR}/open_issues.json")
log "Found ${ISSUE_COUNT} open issues with bug/good-first-issue labels"

# Step 4: Use Claude Code to analyze and find fixable issues
ANALYSIS_PROMPT="You are analyzing the open-source repository '${REPO_FULL_NAME}' (${LANG}).

Your task: Find 1-3 REAL, CONCRETE issues that can be fixed with a small PR. Focus on:

1. **Bug fixes**: Type errors, null pointer risks, off-by-one errors, resource leaks
2. **Security issues**: SQL injection, XSS, hardcoded secrets, insecure defaults
3. **Documentation fixes**: Broken links, outdated examples, missing API docs
4. **Code quality**: Obvious dead code, unused imports, deprecated API usage
5. **CI/config issues**: Broken CI configs, outdated dependencies with known CVEs

$(if [ "$ISSUE_COUNT" -gt 0 ]; then
  echo "The repo has these open issues that may be fixable:"
  jq -r '.[] | "#\(.number): \(.title)\n\(.body // "" | .[0:200])\n"' "${FIX_DIR}/open_issues.json"
fi)

Rules:
- Only suggest fixes you are CONFIDENT about
- Each fix must be small (< 50 lines changed)
- Do NOT suggest style-only changes (formatting, naming preferences)
- Do NOT suggest adding features
- Respect the project's existing conventions

For EACH issue found, output a JSON object (one per line) with this format:
{
  \"issue_title\": \"Fix: brief description\",
  \"issue_body\": \"Detailed description of the problem and fix\",
  \"fix_type\": \"bug|security|docs|quality|config\",
  \"files_to_change\": [\"path/to/file1\"],
  \"confidence\": \"high|medium\",
  \"branch_name\": \"fix/brief-description\"
}

Output ONLY the JSON objects, one per line. No other text."

log "Running Claude Code analysis..."
claude --print \
  --max-turns 5 \
  --model sonnet \
  "$ANALYSIS_PROMPT" \
  2>>"$LOG_FILE" | tee "${FIX_DIR}/analysis_raw.txt"

# Extract valid JSON lines
grep '^{' "${FIX_DIR}/analysis_raw.txt" | while IFS= read -r line; do
  echo "$line" | jq . >/dev/null 2>&1 && echo "$line"
done | jq -s '.' > "${FIX_DIR}/issues_found.json" 2>/dev/null || echo "[]" > "${FIX_DIR}/issues_found.json"

FOUND=$(jq length "${FIX_DIR}/issues_found.json")
log "Found ${FOUND} fixable issues"

# Save metadata
jq -n \
  --arg repo "$REPO_FULL_NAME" \
  --arg lang "$LANG" \
  --arg license "$LICENSE" \
  --arg date "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  --argjson issues_found "$FOUND" \
  '{
    repo: $repo,
    language: $lang,
    license: $license,
    analyzed_at: $date,
    issues_found: $issues_found
  }' > "${FIX_DIR}/metadata.json"

log "Analysis complete. Results in ${FIX_DIR}/"
echo "$FOUND"
