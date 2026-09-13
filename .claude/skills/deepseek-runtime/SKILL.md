---
name: deepseek-runtime
description: Internal helper contract for calling the DeepSeek executor companion script from Claude Code
user-invocable: false
---

# DeepSeek Executor Runtime

Use this skill only inside the `deepseek-exec` subagent.

Primary helper:
- `node ~/.claude/scripts/deepseek-executor/companion.mjs task --cwd <worktree> [--background] [--resume <job-id|last>] <prompt>`

What this actually runs: the companion spawns the real `claude` CLI (not a different tool) with `CLAUDE_CONFIG_DIR=~/.claude-deepseek`, which points `ANTHROPIC_BASE_URL`/`ANTHROPIC_MODEL` at DeepSeek instead of the subscription-backed Anthropic endpoint. Project-level `CLAUDE.md` and any project `.claude/` config in the target worktree still load normally — only the personal `~/.claude` layer (hooks, memory, agents, skills) is swapped out.

Execution rules:
- The subagent is a forwarder, not an orchestrator. Its only job is to invoke `task` once and return that stdout unchanged.
- `--cwd` is mandatory on every call and must be a dedicated worktree, never the caller's primary working directory and never `$HOME`. The script hard-rejects `$HOME` itself (leaking the main `~/.claude/settings.json` permissions into an "isolated" session), but only the calling agent can tell a dedicated worktree apart from the primary one.
- Do not call `status`, `result`, or `cancel` from `deepseek-exec` unless the caller explicitly asked to check on or stop a specific background job — the default flow is one `task` call in, one result out.
- You may use the `deepseek-prompting` skill to rewrite the caller's request into a tighter DeepSeek prompt before the single `task` call. That prompt drafting is the only Claude-side work allowed — do not inspect the repo, solve the task yourself, or add independent analysis outside the forwarded prompt text.

Command selection:
- Foreground (no `--background`): blocks until DeepSeek finishes, returns the full JSON result immediately. Use for small, clearly bounded work.
- `--background`: returns `{jobId, status: "running", logFile}` immediately; the actual run continues in a detached worker process. Use for open-ended, multi-file, or long-running work. Report the `jobId` to the caller and stop — do not poll.
- `--resume last`: continue the most recently completed job in this worktree's job store (reuses the DeepSeek session, so it has the prior conversation's context). Use for "continue" / "keep going" / "now also do X" follow-ups in the same worktree.
- `--resume <job-id>`: continue a specific prior job by id instead of the most recent one.
- Every subcommand (`task`, `status`, `result`, `cancel`) needs its own `--cwd`, since jobs are stored per-worktree (hashed path under `~/.claude-deepseek-runs/`), not in a global registry.

Output shape (all JSON, from the companion's stdout):
- `status`: `"succeeded" | "failed" | "running" | "cancelled"`
- `exitCode`: the underlying `claude` process exit code (foreground/status/result only)
- `sessionId`: the DeepSeek-side Claude Code session id, present once the run has produced at least one turn — needed for `--resume`
- `costUsd`: reported cost of the run, if the underlying CLI reported one
- `result`: the actual response text from the DeepSeek instance — this is the payload to hand off to `deepseek-result-handling`

Safety rules:
- Preserve the caller's task text as-is apart from stripping routing flags (`--background`, `--resume`, `--cwd`).
- Do not inspect the repository, read files, grep, monitor progress, poll status, fetch results, cancel jobs, summarize output, or do any follow-up work of your own beyond the single forwarding call.
- Return the stdout of the `task` command exactly as-is.
- If the Bash call fails or DeepSeek cannot be invoked (e.g. `~/.deepseek-secret` is empty, network error), return that failure output. Do not retry with a different approach and do not fall back to doing the task yourself on the main model.
