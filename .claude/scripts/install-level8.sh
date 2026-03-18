#!/bin/bash
# ============================================================
# Level 8 Autonomous Agent Team — Install Script
# ============================================================
# Adds three capabilities to any ECC-based project:
#   1. Shared State (multi-agent coordination)
#   2. Sprint Memory (mid-term cross-session memory)
#   3. Autonomous Permissions (allowedTools whitelist)
#
# Usage:
#   cd your-project
#   bash .claude/scripts/install-level8.sh
#
# Or from a remote ECC fork:
#   curl -sL https://raw.githubusercontent.com/YOUR/REPO/main/.claude/scripts/install-level8.sh | bash
# ============================================================

set -e

PROJECT_ROOT="${CLAUDE_PROJECT_ROOT:-$(pwd)}"
CLAUDE_DIR="$PROJECT_ROOT/.claude"

echo "🔧 Installing Level 8 Autonomous Agent capabilities..."
echo "   Project: $PROJECT_ROOT"
echo ""

# ── 1. Shared State Directory ──────────────────────────────
echo "📂 [1/4] Creating shared-state directory..."
mkdir -p "$CLAUDE_DIR/shared-state/artifacts"

# board.json (runtime, will be gitignored)
if [ ! -f "$CLAUDE_DIR/shared-state/board.json" ]; then
cat > "$CLAUDE_DIR/shared-state/board.json" << 'BOARDEOF'
{
  "$schema": "shared-state-board",
  "version": "1.0.0",
  "description": "Global task board for multi-agent coordination.",
  "lastUpdated": null,
  "activeWorkflow": null,
  "tasks": [],
  "agents": [],
  "conflicts": []
}
BOARDEOF
fi

# decisions.log (runtime, will be gitignored)
if [ ! -f "$CLAUDE_DIR/shared-state/decisions.log" ]; then
cat > "$CLAUDE_DIR/shared-state/decisions.log" << 'LOGEOF'
# Agent Decision Log
# Format: [ISO-timestamp] [agent-id] [action] description
# ---
LOGEOF
fi

echo "   ✅ shared-state/board.json + decisions.log + artifacts/"

# ── 2. Sprint Memory Directory ─────────────────────────────
echo "📂 [2/4] Creating memory directory..."
mkdir -p "$CLAUDE_DIR/memory"
echo "   ✅ memory/ (sprint files auto-created by hook)"

# ── 3. Register Hooks ──────────────────────────────────────
echo "🔗 [3/4] Checking hook scripts..."

# Verify hook scripts exist
MISSING_HOOKS=0
for script in shared-state-sync.js sprint-memory.js; do
  if [ ! -f "$CLAUDE_DIR/scripts/hooks/$script" ]; then
    echo "   ❌ Missing: scripts/hooks/$script"
    MISSING_HOOKS=1
  else
    echo "   ✅ scripts/hooks/$script"
  fi
done

if [ "$MISSING_HOOKS" -eq 1 ]; then
  echo ""
  echo "   FATAL: Required hook scripts are missing."
  echo "   Copy them from the ECC Level 8 template or run this from the repo root."
  exit 1
fi

# Check if hooks are registered in settings.json
if grep -q "shared-state-sync.js" "$CLAUDE_DIR/settings.json" 2>/dev/null; then
  echo "   ✅ Hooks already registered in settings.json"
else
  echo "   ⚠️  Add these Stop hooks to .claude/settings.json manually:"
  echo '      { "matcher": "", "hooks": [{ "type": "command", "command": "node \"${CLAUDE_PROJECT_ROOT}/.claude/scripts/hooks/shared-state-sync.js\"", "async": true, "timeout": 10 }], "description": "Shared state sync" }'
  echo '      { "matcher": "", "hooks": [{ "type": "command", "command": "node \"${CLAUDE_PROJECT_ROOT}/.claude/scripts/hooks/sprint-memory.js\"", "async": true, "timeout": 10 }], "description": "Sprint memory" }'
fi

# ── 4. Permissions Template ────────────────────────────────
echo "🔑 [4/4] Checking permissions..."

if [ ! -f "$CLAUDE_DIR/settings.local.json" ]; then
  echo "   Creating settings.local.json with development permissions..."
  cat > "$CLAUDE_DIR/settings.local.json" << 'PERMEOF'
{
  "permissions": {
    "allow": [
      "Bash(npm test*)",
      "Bash(npm run *)",
      "Bash(npx jest*)",
      "Bash(npx vitest*)",
      "Bash(npx tsc*)",
      "Bash(npx eslint*)",
      "Bash(npx prettier*)",
      "Bash(node .claude/*)",
      "Bash(git status*)",
      "Bash(git diff*)",
      "Bash(git log*)",
      "Bash(git branch*)",
      "Bash(git stash*)",
      "Bash(git add *)",
      "Bash(git commit *)",
      "Bash(git checkout -b *)",
      "Bash(gh pr *)",
      "Bash(gh issue *)",
      "Bash(gh run *)",
      "Bash(mkdir -p *)",
      "Bash(ls *)"
    ]
  }
}
PERMEOF
  echo "   ✅ settings.local.json created (local only, gitignored)"
else
  echo "   ✅ settings.local.json already exists"
fi

# ── Done ───────────────────────────────────────────────────
echo ""
echo "════════════════════════════════════════════"
echo "✅ Level 8 installation complete!"
echo ""
echo "Portable (commit these):       Local only (gitignored):"
echo "  .claude/skills/                .claude/settings.local.json"
echo "  .claude/scripts/hooks/         .claude/memory/"
echo "  .claude/strategies/            .claude/shared-state/board.json"
echo "  .claude/settings.json          .claude/shared-state/decisions.log"
echo "  .claude/shared-state/README.md .claude/shared-state/artifacts/"
echo ""
echo "Add .gitignore entries:"
echo "  .claude/memory/"
echo "  .claude/shared-state/artifacts/"
echo "  .claude/shared-state/board.json"
echo "  .claude/shared-state/decisions.log"
echo "  .claude/settings.local.json"
echo "════════════════════════════════════════════"
