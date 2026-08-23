---
name: deepseek-result-handling
description: Internal guidance for presenting DeepSeek executor output back to the user and deciding what happens next
user-invocable: false
---

# DeepSeek Result Handling

When the `deepseek-exec` helper returns output (JSON with `status`/`sessionId`/`costUsd`/`result`):

- Present `result` as DeepSeek's own output, clearly attributed — do not present it as your own work or blend it silently into your own response.
- If `status` is `"running"` (a `--background` call), report the `jobId` and where to check later (`status`/`result` with the same `--cwd`) — do not wait or poll unless the user explicitly asks you to check now.
- If `status` is `"failed"`, report the failure and stop. Do not silently retry, do not fall back to doing the task yourself on the main model, and do not paper over it by summarizing as if it succeeded.
- If the companion script itself errored (bad `--cwd`, `~/.deepseek-secret` empty, DeepSeek endpoint unreachable), surface that error message directly — do not guess at the cause or improvise a workaround.

**Nothing DeepSeek produces is applied or trusted without independent verification — this is not optional, and it is stricter than the equivalent Codex rule:**

- Do not treat DeepSeek's own claim that tests pass, the build is green, or an invariant is satisfied as evidence. Re-run the actual verification command yourself (`cargo check`, the relevant test file, `npm run build`) and look at the output before reporting the change as good.
- For any change touching a shared accessor, trait implementation, or error path, grep for the specific pattern the `deepseek-prompting` skill told it to avoid (`unwrap_or(0)` on a non-zero-safe value, an un-overridden trait default, a direct field read where an accessor exists) — do not assume the prompt's instructions were followed just because the diff looks plausible.
- Do not merge or stage the worktree's changes into the main branch yourself. Report what changed and where (worktree path, files touched) and let the user or the main thread decide via the project's normal review path (code-reviewer, `/code-review`, or manual read) — same as any other subagent's output.
- If the task was money-path-adjacent and somehow reached DeepSeek despite `deepseek-exec`'s scope guard, treat that as a process failure to flag, not as output to trust with lighter scrutiny than usual — if anything it needs more, since `deepseek-exec` should never have forwarded it.
- CRITICAL: after presenting DeepSeek's result, stop. Do not start fixing, extending, or "cleaning up" what it produced without the user asking — that decision belongs to the user, exactly as with any other review output.
