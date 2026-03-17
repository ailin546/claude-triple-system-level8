#!/usr/bin/env python3
"""
CC Bridge - 让多台设备上的 Claude Code 互相对话

每台设备跑一份，提供 HTTP API:
  POST /chat          - 发送 prompt，支持多轮对话
  GET  /capabilities  - 查询本机 CC 能力
  GET  /health        - 健康检查
  GET  /sessions      - 列出活跃会话

启动: python3 bridge.py [--host 127.0.0.1] [--port 5111] [--token YOUR_SECRET]
"""

import argparse
import hmac
import json
import subprocess
import sys
import threading
import time
import uuid
from http.server import HTTPServer, BaseHTTPRequestHandler
from pathlib import Path
from urllib.parse import urlparse

MAX_BODY_SIZE = 1 * 1024 * 1024  # 1 MB

# ── 会话管理 ─────────────────────────────────────────────

sessions: dict[str, dict] = {}
sessions_lock = threading.Lock()

DEVICE_NAME = subprocess.run(
    ["hostname"], capture_output=True, text=True
).stdout.strip()

AUTH_TOKEN = ""


def cleanup_stale_sessions(max_age: int = 3600):
    """清理超过 max_age 秒未活动的会话"""
    now = time.time()
    with sessions_lock:
        stale = [
            cid for cid, s in sessions.items()
            if now - s.get("last_active", 0) > max_age
        ]
        for cid in stale:
            del sessions[cid]


# ── Claude CLI 调用 ──────────────────────────────────────

def call_claude(prompt: str, conversation_id: str | None = None) -> dict:
    """调用 claude -p，支持多轮 resume"""

    cmd = ["claude", "-p", "--output-format", "json"]

    # 多轮对话: resume 已有会话
    if conversation_id:
        with sessions_lock:
            existing = sessions.get(conversation_id)
            if existing:
                sid = existing.get("session_id")
                if sid:
                    cmd += ["--resume", sid]

    try:
        result = subprocess.run(
            cmd,
            input=prompt,
            capture_output=True,
            text=True,
            timeout=300
        )
    except subprocess.TimeoutExpired:
        return {
            "conversation_id": conversation_id or "",
            "response": "ERROR: Claude CLI timed out (300s)",
            "error": True
        }

    # 解析输出
    is_new = conversation_id is None
    if is_new:
        conversation_id = uuid.uuid4().hex[:8]

    response_text = result.stdout
    session_id = ""

    # claude -p --output-format json 输出 JSON
    try:
        output = json.loads(result.stdout)
        session_id = output.get("session_id", "")
        response_text = output.get("result", result.stdout)
    except (json.JSONDecodeError, TypeError):
        # 非 JSON 输出，直接用 stdout
        if result.returncode != 0 and result.stderr:
            response_text = f"ERROR: {result.stderr.strip()}"

    # 更新会话
    with sessions_lock:
        turns = sessions.get(conversation_id, {}).get("turns", 0) + 1
        sessions[conversation_id] = {
            "session_id": session_id,
            "last_active": time.time(),
            "turns": turns
        }

    return {
        "conversation_id": conversation_id,
        "response": response_text,
        "session_id": session_id,
        "device": DEVICE_NAME,
        "turns": turns
    }


def discover_capabilities() -> dict:
    """发现本机 CC 的 MCP 工具和能力"""
    tools = []

    # 检查项目级 MCP 配置
    for mcp_path in [".claude/mcp.json", ".claude.json"]:
        p = Path(mcp_path)
        if p.exists():
            try:
                conf = json.loads(p.read_text())
                servers = conf.get("mcpServers", {})
                tools.extend(list(servers.keys()))
            except (json.JSONDecodeError, KeyError):
                pass

    # 检查全局 MCP 配置
    global_mcp = Path.home() / ".claude" / "mcp.json"
    if global_mcp.exists():
        try:
            conf = json.loads(global_mcp.read_text())
            servers = conf.get("mcpServers", {})
            tools.extend(list(servers.keys()))
        except (json.JSONDecodeError, KeyError):
            pass

    # 检查 skills
    skills_dir = Path(".claude/skills")
    skills = []
    if skills_dir.exists():
        skills = [f.stem for f in skills_dir.glob("*.md")]

    # 检查 agents
    agents_dir = Path(".claude/agents")
    agents = []
    if agents_dir.exists():
        agents = [f.stem for f in agents_dir.glob("*.md")]

    return {
        "device": DEVICE_NAME,
        "status": "online",
        "mcp_tools": list(set(tools)),
        "skills_count": len(skills),
        "agents_count": len(agents),
        "claude_version": subprocess.run(
            ["claude", "--version"], capture_output=True, text=True
        ).stdout.strip()
    }


# ── HTTP Server ──────────────────────────────────────────

class BridgeHandler(BaseHTTPRequestHandler):

    def _check_auth(self) -> bool:
        if not AUTH_TOKEN:
            return True
        token = self.headers.get("Authorization", "").replace("Bearer ", "")
        if not hmac.compare_digest(token, AUTH_TOKEN):
            self._respond(401, {"error": "Unauthorized"})
            return False
        return True

    def _respond(self, status: int, data: dict):
        body = json.dumps(data, ensure_ascii=False, indent=2).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _read_body(self) -> dict | None:
        try:
            length = int(self.headers.get("Content-Length", 0))
        except (ValueError, TypeError):
            self._respond(400, {"error": "Invalid Content-Length header"})
            return None
        if length == 0:
            return {}
        if length > MAX_BODY_SIZE:
            self._respond(413, {"error": f"Request body too large (max {MAX_BODY_SIZE} bytes)"})
            return None
        raw = self.rfile.read(length)
        try:
            return json.loads(raw)
        except (json.JSONDecodeError, UnicodeDecodeError):
            self._respond(400, {"error": "Invalid JSON in request body"})
            return None

    def do_GET(self):
        if not self._check_auth():
            return

        path = urlparse(self.path).path

        if path == "/health":
            self._respond(200, {"status": "ok", "device": DEVICE_NAME})

        elif path == "/capabilities":
            self._respond(200, discover_capabilities())

        elif path == "/sessions":
            cleanup_stale_sessions()
            with sessions_lock:
                data = {
                    cid: {"turns": s["turns"], "last_active": s["last_active"]}
                    for cid, s in sessions.items()
                }
            self._respond(200, {"sessions": data})

        else:
            self._respond(404, {"error": f"Not found: {path}"})

    def do_POST(self):
        if not self._check_auth():
            return

        path = urlparse(self.path).path

        if path == "/chat":
            body = self._read_body()
            if body is None:
                return
            prompt = body.get("prompt", "")
            if not prompt:
                self._respond(400, {"error": "Missing 'prompt' field"})
                return
            conversation_id = body.get("conversation_id")
            result = call_claude(prompt, conversation_id)
            self._respond(200, result)

        else:
            self._respond(404, {"error": f"Not found: {path}"})

    def log_message(self, format, *args):
        # 简化日志
        sys.stderr.write(f"[bridge] {args[0]}\n")


def main():
    global AUTH_TOKEN

    parser = argparse.ArgumentParser(description="CC Bridge Server")
    parser.add_argument("--port", type=int, default=5111)
    parser.add_argument("--host", type=str, default="127.0.0.1", help="Bind address (default: 127.0.0.1)")
    parser.add_argument("--token", type=str, default="", help="Auth token (optional)")
    args = parser.parse_args()

    # 也从 peers.json 读取配置
    peers_file = Path(__file__).parent / "peers.json"
    if peers_file.exists():
        conf = json.loads(peers_file.read_text())
        if not args.port or args.port == 5111:
            args.port = conf.get("port", 5111)
        if args.host == "127.0.0.1":
            args.host = conf.get("host", "127.0.0.1")
        if not args.token:
            args.token = conf.get("auth_token", "")

    AUTH_TOKEN = args.token

    server = HTTPServer((args.host, args.port), BridgeHandler)
    print(f"🌉 CC Bridge running on {args.host}:{args.port}")
    print(f"   Device: {DEVICE_NAME}")
    if AUTH_TOKEN:
        print(f"   Auth: token required")
    else:
        print(f"   Auth: WARNING - no token set, server is unauthenticated")
    print(f"   Endpoints:")
    print(f"     POST /chat           - 对话 (支持多轮)")
    print(f"     GET  /capabilities   - 查询能力")
    print(f"     GET  /sessions       - 活跃会话")
    print(f"     GET  /health         - 健康检查")
    print()

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down...")
        server.shutdown()


if __name__ == "__main__":
    main()
