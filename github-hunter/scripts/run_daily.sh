#!/usr/bin/env bash
# run_daily.sh - Main orchestrator: fetch trending repos, analyze, and submit PRs
# Usage: ./run_daily.sh [--dry-run] [--max-repos N] [--skip-fetch] [--skip-pr]

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
OUTPUT_DIR="${PROJECT_DIR}/output"
LOG_DIR="${PROJECT_DIR}/logs"
DATE=$(date +%Y-%m-%d)
DAILY_LOG="${LOG_DIR}/daily_${DATE}.log"

# Defaults
DRY_RUN=false
MAX_REPOS=10        # Process top N repos per run (be respectful)
SKIP_FETCH=false
SKIP_PR=false
MAX_PRS_PER_RUN=5   # Safety limit on PRs per run

# Parse args
while [[ $# -gt 0 ]]; do
  case $1 in
    --dry-run)     DRY_RUN=true; shift ;;
    --max-repos)   MAX_REPOS="$2"; shift 2 ;;
    --skip-fetch)  SKIP_FETCH=true; shift ;;
    --skip-pr)     SKIP_PR=true; shift ;;
    *)             echo "Unknown arg: $1"; exit 1 ;;
  esac
done

mkdir -p "$OUTPUT_DIR" "$LOG_DIR"

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$DAILY_LOG"
}

log "=========================================="
log "GitHub Hunter - Daily Run"
log "Date: ${DATE}"
log "Dry run: ${DRY_RUN}"
log "Max repos: ${MAX_REPOS}"
log "=========================================="

# Step 1: Fetch trending repos
TRENDING_FILE="${OUTPUT_DIR}/trending_${DATE}.json"

if [ "$SKIP_FETCH" = false ] || [ ! -f "$TRENDING_FILE" ]; then
  log "Step 1: Fetching trending repos..."
  bash "${SCRIPT_DIR}/fetch_trending.sh" "$OUTPUT_DIR" 2>&1 | tee -a "$DAILY_LOG"
else
  log "Step 1: Skipping fetch (using existing ${TRENDING_FILE})"
fi

if [ ! -f "$TRENDING_FILE" ]; then
  log "ERROR: No trending file found at ${TRENDING_FILE}"
  exit 1
fi

TOTAL_REPOS=$(jq length "$TRENDING_FILE")
log "Total trending repos: ${TOTAL_REPOS}"
log "Will process top ${MAX_REPOS}"

# Step 2: Analyze repos and find issues
log ""
log "Step 2: Analyzing repos..."

PRS_CREATED=0
REPOS_ANALYZED=0
REPOS_WITH_ISSUES=0

# Read repos previously processed to avoid duplicates
PROCESSED_FILE="${OUTPUT_DIR}/processed_repos.jsonl"
touch "$PROCESSED_FILE"

while IFS= read -r repo_json; do
  REPO_NAME=$(echo "$repo_json" | jq -r '.full_name')
  REPO_STARS=$(echo "$repo_json" | jq -r '.stars')
  REPO_LANG=$(echo "$repo_json" | jq -r '.language // "Unknown"')
  REPO_CATEGORY=$(echo "$repo_json" | jq -r '.category')

  # Skip if already processed recently (within 7 days)
  if grep -q "\"${REPO_NAME}\"" "$PROCESSED_FILE" 2>/dev/null; then
    LAST_DATE=$(grep "\"${REPO_NAME}\"" "$PROCESSED_FILE" | tail -1 | jq -r '.date')
    if date -jf "%Y-%m-%d" "$LAST_DATE" +%s >/dev/null 2>&1; then
      LAST_TS=$(date -jf "%Y-%m-%d" "$LAST_DATE" +%s)
    else
      LAST_TS=$(date -d "$LAST_DATE" +%s 2>/dev/null || echo 0)
    fi
    DAYS_AGO=$(( ($(date +%s) - LAST_TS) / 86400 ))
    if [ "$DAYS_AGO" -lt 7 ]; then
      log "  SKIP: ${REPO_NAME} (processed ${DAYS_AGO} days ago)"
      continue
    fi
  fi

  log ""
  log "--- [${REPOS_ANALYZED}/${MAX_REPOS}] ${REPO_NAME} (${REPO_CATEGORY}, ${REPO_LANG}, ⭐${REPO_STARS}) ---"

  # Analyze repo
  FIXES_DIR="${OUTPUT_DIR}/fixes/$(echo "$REPO_NAME" | tr '/' '_')"

  ISSUES_FOUND=$(bash "${SCRIPT_DIR}/analyze_repo.sh" "$REPO_NAME" "${OUTPUT_DIR}/fixes" "${PROJECT_DIR}/workdir" 2>&1 | tail -1)

  if [ "$ISSUES_FOUND" -gt 0 ] 2>/dev/null; then
    REPOS_WITH_ISSUES=$((REPOS_WITH_ISSUES + 1))
    log "  Found ${ISSUES_FOUND} fixable issues"

    # Step 3: Create PRs for each issue
    if [ "$SKIP_PR" = false ] && [ "$DRY_RUN" = false ]; then
      ISSUES_FILE="${FIXES_DIR}/issues_found.json"

      for i in $(seq 0 $((ISSUES_FOUND - 1))); do
        if [ "$PRS_CREATED" -ge "$MAX_PRS_PER_RUN" ]; then
          log "  LIMIT: Max PRs per run (${MAX_PRS_PER_RUN}) reached"
          break 2
        fi

        CONFIDENCE=$(jq -r ".[$i].confidence" "$ISSUES_FILE")
        if [ "$CONFIDENCE" != "high" ]; then
          log "  SKIP: Issue $i has ${CONFIDENCE} confidence"
          continue
        fi

        TITLE=$(jq -r ".[$i].issue_title" "$ISSUES_FILE")
        log "  Creating PR: ${TITLE}"

        PR_URL=$(bash "${SCRIPT_DIR}/create_fix_pr.sh" \
          "$REPO_NAME" "$ISSUES_FILE" "$i" \
          "${PROJECT_DIR}/workdir" "$LOG_DIR" 2>&1 | tail -1) || true

        if [ -n "$PR_URL" ] && echo "$PR_URL" | grep -q "github.com"; then
          PRS_CREATED=$((PRS_CREATED + 1))
          log "  PR created: ${PR_URL}"
        else
          log "  PR creation failed or skipped"
        fi

        sleep 5  # Be respectful of rate limits
      done
    elif [ "$DRY_RUN" = true ]; then
      log "  DRY RUN: Would create PRs for ${ISSUES_FOUND} issues"
    fi
  else
    log "  No fixable issues found"
  fi

  # Mark as processed
  jq -n --arg repo "$REPO_NAME" --arg date "$DATE" --argjson issues "${ISSUES_FOUND:-0}" \
    '{repo: $repo, date: $date, issues_found: $issues}' >> "$PROCESSED_FILE"

  REPOS_ANALYZED=$((REPOS_ANALYZED + 1))
  sleep 3  # Rate limit between repos
done < <(jq -c ".[:${MAX_REPOS}][]" "$TRENDING_FILE")

# Summary
log ""
log "=========================================="
log "Daily Run Summary"
log "=========================================="
log "Repos analyzed: ${REPOS_ANALYZED}"
log "Repos with fixable issues: ${REPOS_WITH_ISSUES}"
log "PRs created: ${PRS_CREATED}"
log "Full log: ${DAILY_LOG}"

# Save daily summary
jq -n \
  --arg date "$DATE" \
  --argjson analyzed "$REPOS_ANALYZED" \
  --argjson with_issues "$REPOS_WITH_ISSUES" \
  --argjson prs "$PRS_CREATED" \
  '{date: $date, repos_analyzed: $analyzed, repos_with_issues: $with_issues, prs_created: $prs}' \
  > "${OUTPUT_DIR}/summary_${DATE}.json"

log "Done!"
