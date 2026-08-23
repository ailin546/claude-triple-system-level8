---
name: deepseek-prompting
description: Internal guidance for composing prompts sent to the DeepSeek executor — how to scope tasks and inject constraints for a weaker instruction-follower
user-invocable: false
---

# DeepSeek Prompting

Use this skill only inside the `deepseek-exec` subagent, to rewrite the caller's request into the prompt actually sent via `deepseek-runtime`'s `task` call.

## Why this differs from `gpt-5-4-prompting`

Codex/GPT-5.4 can be trusted to read a project's `CLAUDE.md` and self-select the relevant rules out of a large constraint document. DeepSeek's adherence to elaborate multi-hundred-line constraint documents is materially weaker — it will read the file but is more likely to miss a rule that wasn't made locally salient to the task at hand. The failure mode is not "it refuses" or "it errors" — it's **plausible-but-wrong output that compiles and passes the tests it wrote**: silently defaulting an ambiguous value instead of failing closed, a trait method left at its default implementation instead of overridden, a guard function defined but never wired into the call path it's supposed to protect. Pointing DeepSeek at CLAUDE.md and hoping is not sufficient; the relevant constraints must be pulled out and put directly in the prompt.

## Prompt construction rules

1. **State the single task and a concrete definition of done.** One task per call — no "and also clean up X while you're at it."
2. **Pull in the 2-5 most relevant invariants/rules verbatim**, not by section-number reference. If the task touches anything in `quant_base-main/CLAUDE.md` §八½ (the numbered invariant table) or `§三` (engineering constraints), quote the specific rows/paragraphs that apply — do not write "follow the invariants in CLAUDE.md" and assume it will find them.
3. **Name the exact files/functions in scope**, and say explicitly what is out of scope. DeepSeek should not go exploring the wider codebase for "related" changes to make.
4. **State the verification command it must run before reporting done** (e.g. `cargo check --workspace --tests`, `npm run build && npm run lint`, the specific test file). Require it to paste the actual output, not just claim success.
5. **Explicitly forbid the known DeepSeek/weak-instruction-follower failure shapes** for this task category:
   - "Do not use `unwrap_or(0)` / `unwrap_or_default()` on a value where 0 has a different meaning than 'unknown' — fail closed (return `Err`/`None`) instead."
   - "Do not leave a trait method at its default implementation if this task requires per-type behavior — grep for other `impl` blocks of the same trait and match that pattern."
   - "If you add a new place that reads a value that already has an existing accessor/getter elsewhere in the codebase, use that accessor — do not read the underlying field/table directly." (SSOT rule)
   - "Do not silently swallow an error path (`.ok()`, empty `catch`) — every error path needs an explicit, visible outcome."
6. **Never forward money-path scope.** If the caller's request touches `hft-hedge-orchestrator`, `hft-connection-manager`, `hft-exchange` adapters, risk gates, or order dispatch, the `deepseek-exec` agent should have already refused it — this skill is not a place to sneak such scope through with extra caveats.
7. **Keep it read-heavy on context, light on autonomy.** Since the executor runs headless with no one watching, prefer prompts that ask DeepSeek to make one well-defined change and stop, over open-ended "improve X" prompts that invite scope creep in an unsupervised run.

## Antipatterns (do not do these)

- Forwarding the caller's raw request unchanged when it's vague ("clean up the tests") — tighten it into a concrete file list and done-criteria first.
- Writing a prompt that references CLAUDE.md by section number and trusts DeepSeek to look it up — quote the rule.
- Adding scope beyond what the caller asked for "since we're in there anyway."
- Asking it to also decide whether something is in scope for money-path work — that gate is `deepseek-exec`'s job before this skill even runs, not DeepSeek's.
