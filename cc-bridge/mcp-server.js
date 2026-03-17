#!/usr/bin/env node
/**
 * CC Bridge MCP Server
 *
 * 注册为 Claude Code 的 MCP Server，让本地 CC 能：
 *   1. ask_peer     - 向远程 CC 发送 prompt（支持多轮）
 *   2. list_peers   - 列出所有 peer 及其能力/在线状态
 *   3. peer_status  - 查看某个 peer 的详细能力
 *
 * 配置文件: peers.json (同目录)
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── 加载 peers 配置（启动时加载一次）─────────────────────

let cachedConfig = null;

function loadConfig() {
  if (cachedConfig) return cachedConfig;
  const configPath = join(__dirname, "peers.json");
  try {
    const raw = readFileSync(configPath, "utf-8");
    cachedConfig = JSON.parse(raw);
  } catch (e) {
    console.error(`Failed to load peers.json: ${e.message}`);
    cachedConfig = {};
  }
  return cachedConfig;
}

function loadPeers() {
  return loadConfig().peers || {};
}

function loadToken() {
  return loadConfig().auth_token || "";
}

// ── HTTP helpers ────────────────────────────────────────

async function fetchPeer(peerUrl, path, method = "GET", body = null) {
  const token = loadToken();
  const headers = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const opts = { method, headers };
  if (body) opts.body = JSON.stringify(body);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 300000); // 5 min
  opts.signal = controller.signal;

  try {
    const resp = await fetch(`${peerUrl}${path}`, opts);
    clearTimeout(timeout);
    return await resp.json();
  } catch (e) {
    clearTimeout(timeout);
    throw new Error(`Peer unreachable: ${e.message}`);
  }
}

// ── MCP Server ──────────────────────────────────────────

const server = new Server(
  { name: "cc-bridge", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler("tools/list", async () => {
  const peers = loadPeers();
  const peerNames = Object.keys(peers);

  return {
    tools: [
      {
        name: "ask_peer",
        description:
          "Send a prompt to a Claude Code instance on another device. " +
          "Supports multi-turn conversations via conversation_id. " +
          `Available peers: ${peerNames.join(", ")}`,
        inputSchema: {
          type: "object",
          properties: {
            peer: {
              type: "string",
              description: `Target device name. One of: ${peerNames.join(", ")}`,
              enum: peerNames,
            },
            prompt: {
              type: "string",
              description: "The message/prompt to send",
            },
            conversation_id: {
              type: "string",
              description:
                "For multi-turn: pass the conversation_id from a previous response to continue that conversation",
            },
          },
          required: ["peer", "prompt"],
        },
      },
      {
        name: "list_peers",
        description:
          "List all configured CC peers with their online status and capabilities",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "peer_sessions",
        description: "List active conversation sessions on a peer device",
        inputSchema: {
          type: "object",
          properties: {
            peer: {
              type: "string",
              description: "Target device name",
              enum: peerNames,
            },
          },
          required: ["peer"],
        },
      },
    ],
  };
});

server.setRequestHandler("tools/call", async (request) => {
  const { name, arguments: args } = request.params;
  const peers = loadPeers();

  try {
    // ── ask_peer ──────────────────────────────────────
    if (name === "ask_peer") {
      const peer = peers[args.peer];
      if (!peer) {
        return {
          content: [
            {
              type: "text",
              text: `Unknown peer: "${args.peer}". Available: ${Object.keys(peers).join(", ")}`,
            },
          ],
        };
      }

      const payload = {
        prompt: args.prompt,
        conversation_id: args.conversation_id || null,
      };

      const data = await fetchPeer(peer.url, "/chat", "POST", payload);

      const header = `📡 Response from [${data.device || args.peer}]`;
      const meta = `conversation_id: ${data.conversation_id} | turn: ${data.turns || 1}`;

      return {
        content: [
          {
            type: "text",
            text: `${header}\n${meta}\n${"─".repeat(50)}\n\n${data.response}`,
          },
        ],
      };
    }

    // ── list_peers ────────────────────────────────────
    if (name === "list_peers") {
      const results = [];

      for (const [peerName, peerConf] of Object.entries(peers)) {
        try {
          const caps = await fetchPeer(peerConf.url, "/capabilities");
          results.push({
            name: peerName,
            description: peerConf.description || "",
            status: "online",
            ...caps,
          });
        } catch {
          results.push({
            name: peerName,
            description: peerConf.description || "",
            url: peerConf.url,
            status: "offline",
          });
        }
      }

      return {
        content: [
          { type: "text", text: JSON.stringify(results, null, 2) },
        ],
      };
    }

    // ── peer_sessions ─────────────────────────────────
    if (name === "peer_sessions") {
      const peer = peers[args.peer];
      if (!peer) {
        return {
          content: [
            {
              type: "text",
              text: `Unknown peer: "${args.peer}"`,
            },
          ],
        };
      }

      const data = await fetchPeer(peer.url, "/sessions");
      return {
        content: [
          { type: "text", text: JSON.stringify(data, null, 2) },
        ],
      };
    }

    return {
      content: [{ type: "text", text: `Unknown tool: ${name}` }],
    };
  } catch (e) {
    return {
      content: [{ type: "text", text: `Error: ${e.message}` }],
    };
  }
});

// ── 启动 ────────────────────────────────────────────────

const transport = new StdioServerTransport();
await server.connect(transport);
