#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

echo "═══════════════════════════════════════"
echo "  CC Bridge Setup"
echo "═══════════════════════════════════════"
echo

# 1. Install Node.js dependencies
echo "▸ Installing npm dependencies..."
npm install --silent 2>/dev/null
echo "  ✓ Done"

# 2. Make scripts executable
chmod +x bridge.py mcp-server.js test.sh 2>/dev/null || true
echo "  ✓ Scripts marked executable"

# 3. Register MCP server in project config
CLAUDE_DIR="$SCRIPT_DIR/../.claude"
MCP_JSON="$CLAUDE_DIR/mcp.json"

mkdir -p "$CLAUDE_DIR"

if [ -f "$MCP_JSON" ]; then
    # 检查是否已经配置
    if grep -q "cc-bridge" "$MCP_JSON" 2>/dev/null; then
        echo "  ✓ MCP already configured"
    else
        echo "  ⚠ $MCP_JSON exists, please add cc-bridge manually (see below)"
    fi
else
    cat > "$MCP_JSON" << MCPEOF
{
  "mcpServers": {
    "cc-bridge": {
      "command": "node",
      "args": ["$SCRIPT_DIR/mcp-server.js"]
    }
  }
}
MCPEOF
    echo "  ✓ Created $MCP_JSON"
fi

echo
echo "═══════════════════════════════════════"
echo "  Setup Complete!"
echo "═══════════════════════════════════════"
echo
echo "Step 1 - Edit peers.json to add your devices:"
echo "  vi $SCRIPT_DIR/peers.json"
echo
echo "Step 2 - Start the bridge on THIS machine:"
echo "  python3 $SCRIPT_DIR/bridge.py"
echo
echo "Step 3 - Test it:"
echo "  bash $SCRIPT_DIR/test.sh"
echo
echo "Step 4 - Start Claude Code, it now has 'cc-bridge' tools:"
echo "  ask_peer, list_peers, peer_sessions"
echo
echo "═══════════════════════════════════════"
echo "  Remote device setup (copy & run):"
echo "═══════════════════════════════════════"
echo
echo "  scp -r $SCRIPT_DIR user@remote:~/cc-bridge"
echo "  ssh user@remote 'cd ~/cc-bridge && bash setup.sh && python3 bridge.py &'"
echo
