# /audit-crate — Agent Team Audit of a Single Rust Crate

**Step 0 (mandatory)**: Read `~/.claude/on-demand/audit-protocol.md` first — it contains the 4-phase protocol, 3 iron rules, and severity criteria. This file is NOT auto-loaded to save context.

Launch a Layer 3 multi-agent audit of a single Rust crate (or any self-contained code directory) using the Claude Code **agent teams** mechanism, following the 4-phase protocol in `~/.claude/on-demand/audit-protocol.md`.

**Successfully battle-tested**: 2026-04-10 on `quant_base-main/crates/hft-engine` — produced 1 CRITICAL + 3 MEDIUM + 2 LOW verified findings, with Phase 4 adversarial review correctly escalating 1, downgrading 1, refuting 2, and discovering 1 new.

## Usage

```
/audit-crate <path-to-crate> [baseline-command]
```

- `<path-to-crate>`: absolute path or workspace-relative (e.g. `quant_base-main/crates/hft-engine`)
- `[baseline-command]`: optional Layer 2 script to run first as baseline (default: detect `scripts/audit/run-all.sh`)

If no argument is given, ask the user which crate to audit.

## Pre-requisites

1. **Agent teams must be enabled** in `~/.claude/settings.json`:
   ```json
   { "env": { "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1" } }
   ```
   If not set, enable it and tell the user to restart the session before proceeding.

2. **Claude Code ≥ v2.1.32** — check with `claude --version`.

3. **One team per session limit**: if there's an active team, clean it up with TeamDelete first.

## Execution Protocol

### Step 0 — Layer 2 baseline (record, do NOT re-report)

```bash
# Auto-detect and run
if [ -f scripts/audit/run-all.sh ]; then
  ./scripts/audit/run-all.sh 2>&1 | tail -80
fi
```

Capture the flagged categories (e.g. "SSOT / Safety / Numeric / Security") — pass them to Phase 1+2 teammates as "DO NOT re-report" baseline.

### Step 1 — Create the team

```
TeamCreate:
  team_name: {crate-basename}-audit
  description: "Layer 3 multi-agent audit of {crate-path} following audit-protocol.md 4-phase flow. Baseline: Layer 2 reported {categories} — do NOT re-report."
  agent_type: audit-lead
```

### Step 2 — Phase 1 (information gathering, parallel) + Phase 2 (independent security)

Spawn **4 teammates in a single message** (parallel), all `run_in_background: true`:

**1a — explorer-functional** (subagent_type: `Explore`)
- Scope: module mapping, public API surface, TODO/FIXME/panic/unwrap/expect in non-test code, unused pub, duplication
- Constraint: OBSERVATION only, file:line refs, no HIGH+ verdicts
- Output: `/tmp/{team-name}-phase1a.md`, SendMessage to team-lead on completion

**1b — explorer-logic** (subagent_type: `Explore`)
- Scope: hot-path correctness (no alloc/lock/.await), AtomicOrdering sanity, time/clock domain mixing (monotonic vs epoch), fixed-point arithmetic, state machines, order lifecycle
- Same constraints as 1a
- Output: `/tmp/{team-name}-phase1b.md`

**1c — explorer-contracts** (subagent_type: `Explore`)
- Scope: public surface actually consumed by neighbours, trait obligations, cross-crate invariants (shared types, persistence `#[serde(default)]`, channel capacity, init order)
- Same constraints
- Output: `/tmp/{team-name}-phase1c.md`

**2 — security-auditor** (subagent_type: `Security Engineer`)
- Scope: unsafe code justification, input validation at boundaries, panic-as-DoS sites on hot path, integer overflow in accounting, deserialization attacks, secret handling, TOCTOU, recovery trust boundary, fault_injection gating
- MUST run `cargo check` on the target crate and report exit code before issuing verdicts
- CAN assign CRITICAL/HIGH/MEDIUM/LOW (security-reviewer exception to 铁律 2)
- Do NOT coordinate with explorer-* (铁律 3 — independent)
- Output: `/tmp/{team-name}-phase2-security.md`

All 4 spawns go in **one assistant message** with multiple Agent tool calls.

### Step 3 — Phase 3: Lead personally verifies HIGH+ (mandatory per 铁律 1)

After all 4 teammates report, for **every** HIGH or CRITICAL candidate:

- Run `Read` on the exact file:line
- Run `cargo check -p {crate}` to confirm build baseline
- `Grep` for related call sites / consumers
- For security findings, trace full call chain from external input to the vulnerable sink

Downgrade to UNVERIFIED if evidence insufficient. Never accept HIGH+ verdicts without personal verification.

### Step 4 — Phase 4: Adversarial review

Spawn ONE more teammate:

**adversarial-reviewer** (subagent_type: `code-reviewer`)
- Scope: challenge each Phase 3 verified finding with verdict (CONFIRMED/OVERSTATED/REFUTED/STALE) + adjusted severity + 1-2 sentence justification
- Also look for adjacent bugs in the specific files that other teammates touched
- Allow up to 3 new findings
- Output: `/tmp/{team-name}-phase4.md`

Lead MUST verify any severity ESCALATION from Phase 4 with the same rigor as Phase 3 (Read + Grep + compile).

### Step 5 — Final report synthesis

Write `/tmp/{team-name}-final.md` containing:

1. Team composition table (phase / teammate / subagent_type / responsibility)
2. Final severity table after Phase 4 corrections
3. For each finding: file:line, verification evidence, impact scenario, concrete fix
4. Refuted/downgraded/stale candidates with rationale
5. Fix priority (today / this week / this sprint / next sprint)
6. **Layer 2 evolution feedback**: if any new bug pattern was found that grep scripts could detect, propose a one-line addition to `scripts/audit/*.sh` (the evolution loop per `~/.claude/on-demand/audit-protocol.md`)

### Step 6 — Cleanup

```
SendMessage shutdown_request → each teammate by name (NOT broadcast — structured
  messages can't broadcast)
Wait for each shutdown_approved response
TeamDelete
```

If a teammate replies with plain-text "approved" instead of structured response, re-send the shutdown_request — cleanup requires the structured form.

## Critical Rules (铁律, non-negotiable)

1. **铁律 1 (verification first)**: Lead personally verifies every HIGH+ finding with compile/grep/source trace. No exceptions.
2. **铁律 2 (Explore doesn't issue verdicts)**: Explore agents gather facts only. HIGH+ severity can only come from security-reviewer, code-reviewer, or the lead.
3. **铁律 3 (security is independent)**: security-auditor is a separate spawn, NOT a sidecar to functional audit.
4. **Phase 1+2 parallel, Phase 3 sequential, Phase 4 after 3**: never collapse phases.
5. **Baseline respected**: Layer 2 findings are given to teammates as "do not re-report" — report only what grep scripts cannot detect.

## Known pitfalls

- **Broadcast structured messages**: `SendMessage to: "*"` does NOT work for `shutdown_request` — send individually.
- **Plain-text shutdown approvals**: some teammates reply in prose; re-send to get structured approval.
- **Out-of-date grep paths**: if a teammate cites a line that no longer exists, treat as STALE (past commits may have fixed it) — verify with current file.
- **Workspace vs crate cargo check**: use `-p {crate-name}` not whole workspace, unless cross-crate symbols are the suspected issue.
- **Token cost**: each teammate is a full Claude instance. A 5-teammate audit of ~15k LoC costs roughly 5-10x a single-session audit. Justified only for audits, not routine reviews.

## Output

Print the final report path and a severity summary table. If CRITICAL findings exist, explicitly ask the user whether to begin fixes immediately.
