#!/usr/bin/env bash
# create_fix_pr.sh - Generate fix code and submit PR for a specific issue
# Usage: ./create_fix_pr.sh <repo_full_name> <issue_json_file> <issue_index>

set -euo pipefail

REPO_FULL_NAME="$1"
ISSUES_FILE="$2"
ISSUE_INDEX="${3:-0}"
WORK_DIR="${4:-$(dirname "$0")/../workdir}"
LOG_DIR="${5:-$(dirname "$0")/../logs}"

REPO_NAME=$(echo "$REPO_FULL_NAME" | tr '/' '_')
REPO_DIR="${WORK_DIR}/${REPO_NAME}"
DATE=$(date +%Y-%m-%d)
LOG_FILE="${LOG_DIR}/pr_${REPO_NAME}_${ISSUE_INDEX}_${DATE}.log"

mkdir -p "$LOG_DIR"

log() {
  echo "[$(date '+%H:%M:%S')] $*" | tee -a "$LOG_FILE"
}

# Extract issue details
ISSUE=$(jq ".[$ISSUE_INDEX]" "$ISSUES_FILE")
if [ "$ISSUE" = "null" ] || [ -z "$ISSUE" ]; then
  log "ERROR: No issue at index ${ISSUE_INDEX}"
  exit 1
fi

ISSUE_TITLE=$(echo "$ISSUE" | jq -r '.issue_title')
ISSUE_BODY=$(echo "$ISSUE" | jq -r '.issue_body')
FIX_TYPE=$(echo "$ISSUE" | jq -r '.fix_type')
BRANCH_NAME=$(echo "$ISSUE" | jq -r '.branch_name')
FILES=$(echo "$ISSUE" | jq -r '.files_to_change | join(", ")')
CONFIDENCE=$(echo "$ISSUE" | jq -r '.confidence')

log "=== Creating fix PR for ${REPO_FULL_NAME} ==="
log "Issue: ${ISSUE_TITLE}"
log "Type: ${FIX_TYPE}, Confidence: ${CONFIDENCE}"
log "Files: ${FILES}"
log "Branch: ${BRANCH_NAME}"

# Skip low confidence fixes
if [ "$CONFIDENCE" = "low" ]; then
  log "SKIP: Low confidence fix"
  exit 0
fi

cd "$REPO_DIR"

# Step 1: Fork the repo (if not already forked)
log "Ensuring fork exists..."
gh repo fork "$REPO_FULL_NAME" --clone=false 2>&1 | tee -a "$LOG_FILE" || true

# Get our fork name
GH_USER=$(gh api user --jq '.login' 2>/dev/null)
FORK_NAME="${GH_USER}/$(echo "$REPO_FULL_NAME" | cut -d'/' -f2)"
log "Fork: ${FORK_NAME}"

# Step 2: Set up remote and branch
git remote get-url fork 2>/dev/null || git remote add fork "https://github.com/${FORK_NAME}.git" 2>/dev/null || true

# Create fix branch from default branch
DEFAULT_BRANCH=$(git symbolic-ref refs/remotes/origin/HEAD 2>/dev/null | sed 's@^refs/remotes/origin/@@' || echo "main")
git checkout "$DEFAULT_BRANCH" 2>/dev/null || git checkout main 2>/dev/null
git checkout -b "$BRANCH_NAME" 2>/dev/null || git checkout "$BRANCH_NAME"

# Step 3: Use Claude Code to write the actual fix
FIX_PROMPT="You are fixing a real issue in the repository '${REPO_FULL_NAME}'.

Issue: ${ISSUE_TITLE}
Description: ${ISSUE_BODY}
Files to change: ${FILES}

Instructions:
1. Read the relevant files carefully
2. Make the MINIMUM changes needed to fix the issue
3. Follow the project's existing code style exactly
4. Do NOT add unnecessary comments or changes
5. Write the fix using the Edit tool

After making changes, output a brief summary of what you changed and why."

log "Running Claude Code to generate fix..."
claude --print \
  --max-turns 10 \
  --model sonnet \
  --allowedTools "Read,Edit,Grep,Glob,Bash(git diff)" \
  "$FIX_PROMPT" \
  2>>"$LOG_FILE" | tee "${LOG_DIR}/fix_output_${REPO_NAME}_${ISSUE_INDEX}.txt"

# Step 4: Check if there are actual changes
if git diff --quiet && git diff --cached --quiet; then
  log "No changes made - skipping PR"
  git checkout "$DEFAULT_BRANCH" 2>/dev/null
  exit 0
fi

# Step 5: Commit changes (only stage files that were meant to be changed)
IFS=',' read -ra CHANGE_FILES <<< "$FILES"
for f in "${CHANGE_FILES[@]}"; do
  f=$(echo "$f" | xargs)  # trim whitespace
  if [ -f "$f" ]; then
    git add "$f"
  fi
done
# Fallback: if nothing was staged, add tracked changes only
if git diff --cached --quiet; then
  log "WARNING: No specified files found, staging tracked changes only"
  git add -u
fi
git commit -m "$(cat <<EOF
${ISSUE_TITLE}

${ISSUE_BODY}

Fix type: ${FIX_TYPE}
EOF
)"

# Step 6: Push to fork
log "Pushing to fork..."
git push fork "$BRANCH_NAME" --force-with-lease 2>&1 | tee -a "$LOG_FILE"

# Step 7: Create PR
PR_BODY="## Summary

${ISSUE_BODY}

## Changes

- Fix type: \`${FIX_TYPE}\`
- Files changed: \`${FILES}\`

## How to test

1. Review the diff for correctness
2. Run the existing test suite
3. Verify the fix addresses the described issue

---
*This PR was generated with automated analysis. Please review carefully.*"

log "Creating PR..."
PR_URL=$(gh pr create \
  --repo "$REPO_FULL_NAME" \
  --head "${GH_USER}:${BRANCH_NAME}" \
  --title "$ISSUE_TITLE" \
  --body "$PR_BODY" \
  2>&1 | tail -1)

log "PR created: ${PR_URL}"

# Save PR info
jq -n \
  --arg repo "$REPO_FULL_NAME" \
  --arg pr_url "$PR_URL" \
  --arg title "$ISSUE_TITLE" \
  --arg type "$FIX_TYPE" \
  --arg branch "$BRANCH_NAME" \
  --arg date "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  '{repo: $repo, pr_url: $pr_url, title: $title, fix_type: $type, branch: $branch, created_at: $date}' \
  >> "${LOG_DIR}/prs_created_${DATE}.jsonl"

# Clean up: go back to default branch
git checkout "$DEFAULT_BRANCH" 2>/dev/null

log "Done!"
echo "$PR_URL"
