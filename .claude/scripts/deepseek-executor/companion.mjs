#!/usr/bin/env node
// Thin job runner that forwards tasks to a DeepSeek-backed Claude Code instance
// (CLAUDE_CONFIG_DIR=~/.claude-deepseek for hook/memory/agent isolation only).
// Mirrors the shape of the Codex plugin's companion.mjs (task/status/result/
// cancel over a job store) but much smaller: there is no app-server/JSON-RPC
// protocol here, just the same `claude` binary pointed at a different
// backend, so jobs are plain spawned processes tracked by PID.
//
// DeepSeek connection info (base URL / model / key) is injected as plain
// process env on every spawn, NOT via ~/.claude-deepseek/settings.json or
// apiKeyHelper. 2026-08-05 finding: Claude Code 2.1.222 rejects the API key
// with "Invalid API key · Fix external API key" whenever a settings.json
// exists in the CLAUDE_CONFIG_DIR (env block OR apiKeyHelper, either one) for
// a custom ANTHROPIC_BASE_URL — verified via direct curl that the key and
// base URL are fine, and via a from-scratch config dir that plain shell env
// vars work while any settings.json in that dir does not. This looks like a
// regression between 2.1.208 (worked) and 2.1.222 (broken); the workaround is
// to keep ~/.claude-deepseek free of settings.json entirely and always pass
// the connection env vars directly on the spawn.
//
// Every subcommand requires --cwd, and --cwd must NOT be $HOME: home is where
// the user's real ~/.claude lives, and Claude Code resolves project-level
// .claude/ relative to cwd regardless of CLAUDE_CONFIG_DIR — running from
// $HOME leaks the main config's permissions into this "isolated" session
// (see the $HOME guard in the `claude-deepseek` shell function this mirrors).
// --cwd also has no default (unlike Codex's, which defaults to process.cwd()):
// this executor is meant to run in its OWN dedicated worktree, never whatever
// directory the caller happens to be in.

import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";

const HOME = os.homedir();
const DEEPSEEK_CONFIG_DIR = path.join(HOME, ".claude-deepseek");
const DEEPSEEK_SECRET_FILE = path.join(HOME, ".deepseek-secret");
const RUNS_ROOT = path.join(HOME, ".claude-deepseek-runs");
const DEFAULT_ALLOWED_TOOLS = ["Read", "Edit", "Write", "Glob", "Grep", "Bash"];

function deepseekEnv() {
  const key = fs.readFileSync(DEEPSEEK_SECRET_FILE, "utf8").trim();
  if (!key) {
    throw new Error(`${DEEPSEEK_SECRET_FILE} is empty — fill in your DeepSeek API key first.`);
  }
  return {
    CLAUDE_CONFIG_DIR: DEEPSEEK_CONFIG_DIR,
    ANTHROPIC_BASE_URL: "https://api.deepseek.com/anthropic",
    ANTHROPIC_MODEL: "deepseek-v4-pro",
    ANTHROPIC_SMALL_FAST_MODEL: "deepseek-v4-flash",
    ANTHROPIC_API_KEY: key
  };
}

function printUsage() {
  console.log(
    [
      "Usage:",
      "  node companion.mjs task --cwd <dir> [--background] [--resume <job-id|last>] <prompt>",
      "  node companion.mjs status --cwd <dir> [job-id] [--all]",
      "  node companion.mjs result --cwd <dir> <job-id>",
      "  node companion.mjs cancel --cwd <dir> <job-id>"
    ].join("\n")
  );
}

function resolveCwd(rawCwd) {
  if (!rawCwd) {
    throw new Error("Missing required --cwd <dir> — this executor must target a dedicated worktree, never the caller's current directory.");
  }
  const resolved = path.resolve(rawCwd);
  if (resolved === path.resolve(HOME)) {
    throw new Error(
      `Refusing to run in $HOME (${HOME}): project-level .claude/ resolution happens relative to cwd regardless of CLAUDE_CONFIG_DIR, so this would leak your main ~/.claude/settings.json into the DeepSeek session. Pass a real project or worktree directory.`
    );
  }
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) {
    throw new Error(`--cwd ${rawCwd} is not a directory.`);
  }
  return resolved;
}

function jobsDirFor(cwd) {
  const hash = createHash("sha256").update(cwd).digest("hex").slice(0, 12);
  const slug = path.basename(cwd).replace(/[^a-zA-Z0-9._-]+/g, "-") || "workspace";
  const dir = path.join(RUNS_ROOT, `${slug}-${hash}`);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function generateJobId() {
  return `ds-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function jobJsonFile(cwd, jobId) {
  return path.join(jobsDirFor(cwd), `${jobId}.json`);
}

function jobLogFile(cwd, jobId) {
  return path.join(jobsDirFor(cwd), `${jobId}.log`);
}

function writeJobRecord(cwd, jobId, patch) {
  const file = jobJsonFile(cwd, jobId);
  const existing = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : {};
  const next = { ...existing, ...patch, id: jobId, updatedAt: new Date().toISOString() };
  fs.writeFileSync(file, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  return next;
}

function readJobRecord(cwd, jobId) {
  const file = jobJsonFile(cwd, jobId);
  if (!fs.existsSync(file)) {
    return null;
  }
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function listJobRecords(cwd) {
  const dir = jobsDirFor(cwd);
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")))
    .sort((a, b) => String(b.updatedAt ?? "").localeCompare(String(a.updatedAt ?? "")));
}

function isPidAlive(pid) {
  if (!pid) {
    return false;
  }
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function parseArgs(argv) {
  const options = {};
  const positionals = [];
  const boolFlags = new Set(["background", "json", "all"]);
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--") {
      options.extra = argv.slice(i + 1);
      break;
    } else if (arg.startsWith("--")) {
      const key = arg.slice(2);
      if (boolFlags.has(key)) {
        options[key] = true;
      } else {
        options[key] = argv[++i];
      }
    } else {
      positionals.push(arg);
    }
  }
  return { options, positionals };
}

function tryParseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function buildClaudeArgs({ prompt, resumeSessionId, allowedTools, extra }) {
  // The prompt MUST come immediately after `-p`/`--print` — putting it at the
  // end of argv (after --allowedTools etc.) makes the CLI report "Input must
  // be provided either through stdin or as a prompt argument when using
  // --print", even though a positional is present later in argv.
  const args = [
    "-p",
    prompt,
    "--output-format",
    "json",
    "--permission-mode",
    "acceptEdits",
    "--allowedTools",
    (allowedTools ?? DEFAULT_ALLOWED_TOOLS).join(",")
  ];
  if (resumeSessionId) {
    args.push("--resume", resumeSessionId);
  }
  if (extra && extra.length) {
    args.push(...extra);
  }
  return args;
}

function runClaude(cwd, claudeArgs) {
  return new Promise((resolve) => {
    const child = spawn("claude", claudeArgs, {
      cwd,
      env: { ...process.env, ...deepseekEnv() },
      // Explicitly close stdin: without this, --print inherits the parent's
      // stdin and waits ~3s for data that will never arrive on every call.
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    child.on("close", (code) => resolve({ code, stdout, stderr }));
    child.on("error", (err) => resolve({ code: 1, stdout, stderr: `${stderr}\n${err.message}` }));
  });
}

function resolveResumeSessionId(cwd, ref) {
  if (ref === "last") {
    const found = listJobRecords(cwd).find((j) => j.sessionId);
    if (!found) {
      throw new Error("No previous DeepSeek session found to resume in this workspace.");
    }
    return found.sessionId;
  }
  const job = readJobRecord(cwd, ref);
  if (!job || !job.sessionId) {
    throw new Error(`Job ${ref} has no resumable session (not finished yet, or failed before a session id was assigned).`);
  }
  return job.sessionId;
}

function summarize(payload) {
  const base = {
    status: payload.status,
    exitCode: payload.exitCode ?? null,
    sessionId: payload.sessionId ?? null,
    costUsd: payload.costUsd ?? null,
    result: payload.result ?? ""
  };
  if (payload.status === "failed" && payload.stderr) {
    base.stderr = payload.stderr;
  }
  return base;
}

function toResultPayload({ code, stdout, stderr }) {
  const parsed = tryParseJson(stdout.trim());
  if (parsed) {
    return {
      status: code === 0 ? "succeeded" : "failed",
      exitCode: code,
      sessionId: parsed.session_id ?? null,
      costUsd: parsed.total_cost_usd ?? null,
      result: parsed.result ?? stdout,
      isError: Boolean(parsed.is_error)
    };
  }
  return {
    status: code === 0 ? "succeeded" : "failed",
    exitCode: code,
    sessionId: null,
    costUsd: null,
    result: stdout,
    stderr
  };
}

async function handleTask(argv) {
  const { options, positionals } = parseArgs(argv);
  const cwd = resolveCwd(options.cwd);
  const prompt = positionals.join(" ").trim();
  if (!prompt) {
    throw new Error("Provide a prompt.");
  }
  const resumeSessionId = options.resume ? resolveResumeSessionId(cwd, options.resume) : null;

  if (options.background) {
    const jobId = generateJobId();
    writeJobRecord(cwd, jobId, {
      status: "running",
      cwd,
      prompt: prompt.slice(0, 300),
      createdAt: new Date().toISOString(),
      logFile: jobLogFile(cwd, jobId)
    });
    const scriptPath = path.resolve(new URL(import.meta.url).pathname);
    const child = spawn(
      process.execPath,
      [scriptPath, "task-worker", "--cwd", cwd, "--job-id", jobId, ...(resumeSessionId ? ["--resume-session", resumeSessionId] : []), "--", prompt],
      { cwd, env: process.env, detached: true, stdio: "ignore" }
    );
    child.unref();
    console.log(JSON.stringify({ jobId, status: "running", logFile: jobLogFile(cwd, jobId) }, null, 2));
    return;
  }

  const claudeArgs = buildClaudeArgs({ prompt, resumeSessionId, extra: options.extra });
  const raw = await runClaude(cwd, claudeArgs);
  const payload = toResultPayload(raw);
  console.log(JSON.stringify(summarize(payload), null, 2));
  if (raw.code !== 0) {
    process.exitCode = raw.code;
  }
}

async function handleTaskWorker(argv) {
  const { options, positionals } = parseArgs(argv);
  const cwd = resolveCwd(options.cwd);
  const jobId = options["job-id"];
  if (!jobId) {
    throw new Error("Missing required --job-id for task-worker.");
  }
  const prompt = (options.extra ?? positionals).join(" ").trim();
  const resumeSessionId = options["resume-session"] ?? null;

  writeJobRecord(cwd, jobId, { status: "running", pid: process.pid });

  const claudeArgs = buildClaudeArgs({ prompt, resumeSessionId, extra: [] });
  const raw = await runClaude(cwd, claudeArgs);
  fs.writeFileSync(jobLogFile(cwd, jobId), `${raw.stdout}\n${raw.stderr}\n`, "utf8");
  const payload = toResultPayload(raw);
  writeJobRecord(cwd, jobId, {
    ...payload,
    pid: null,
    completedAt: new Date().toISOString()
  });
}

function handleStatus(argv) {
  const { options, positionals } = parseArgs(argv);
  const cwd = resolveCwd(options.cwd);
  const jobId = positionals[0];

  if (!jobId) {
    const jobs = listJobRecords(cwd);
    const visible = options.all ? jobs : jobs.slice(0, 10);
    console.log(JSON.stringify(visible.map(summarize).map((s, i) => ({ jobId: visible[i].id, ...s })), null, 2));
    return;
  }

  const job = readJobRecord(cwd, jobId);
  if (!job) {
    throw new Error(`No job ${jobId} found in this workspace.`);
  }
  if (job.status === "running" && job.pid && !isPidAlive(job.pid)) {
    // Worker died without writing a final record (e.g. killed externally).
    writeJobRecord(cwd, jobId, { status: "failed", result: "Worker process is no longer alive but never wrote a final result.", pid: null });
  }
  const fresh = readJobRecord(cwd, jobId);
  console.log(JSON.stringify({ jobId, ...summarize(fresh) }, null, 2));
}

function handleResult(argv) {
  const { options, positionals } = parseArgs(argv);
  const cwd = resolveCwd(options.cwd);
  const jobId = positionals[0];
  if (!jobId) {
    throw new Error("Provide a job id.");
  }
  const job = readJobRecord(cwd, jobId);
  if (!job) {
    throw new Error(`No job ${jobId} found in this workspace.`);
  }
  if (job.status === "running") {
    console.log(JSON.stringify({ jobId, status: "running" }, null, 2));
    return;
  }
  console.log(JSON.stringify({ jobId, ...summarize(job) }, null, 2));
}

function handleCancel(argv) {
  const { options, positionals } = parseArgs(argv);
  const cwd = resolveCwd(options.cwd);
  const jobId = positionals[0];
  if (!jobId) {
    throw new Error("Provide a job id.");
  }
  const job = readJobRecord(cwd, jobId);
  if (!job) {
    throw new Error(`No job ${jobId} found in this workspace.`);
  }
  if (job.pid && isPidAlive(job.pid)) {
    // The task-worker was spawned with detached:true, making it its own
    // process-group leader; the `claude` grandchild it spawns inherits that
    // same group. SIGTERM to the bare pid only kills the worker — the
    // `claude` call it started could keep running as an orphan, silently
    // continuing to burn DeepSeek quota after this reports "cancelled". Kill
    // the whole group (negative pid) instead; fall back to the single pid if
    // the group signal fails (e.g. it was already reaped).
    try {
      process.kill(-job.pid, "SIGTERM");
    } catch {
      try {
        process.kill(job.pid, "SIGTERM");
      } catch {
        // already gone
      }
    }
  }
  writeJobRecord(cwd, jobId, { status: "cancelled", pid: null, completedAt: new Date().toISOString() });
  console.log(JSON.stringify({ jobId, status: "cancelled" }, null, 2));
}

async function main() {
  const [subcommand, ...argv] = process.argv.slice(2);
  if (!subcommand || subcommand === "help" || subcommand === "--help") {
    printUsage();
    return;
  }
  switch (subcommand) {
    case "task":
      await handleTask(argv);
      break;
    case "task-worker":
      await handleTaskWorker(argv);
      break;
    case "status":
      handleStatus(argv);
      break;
    case "result":
      handleResult(argv);
      break;
    case "cancel":
      handleCancel(argv);
      break;
    default:
      throw new Error(`Unknown subcommand: ${subcommand}`);
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
