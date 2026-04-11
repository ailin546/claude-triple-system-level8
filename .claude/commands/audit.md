# /audit — Layer 3 Multi-Agent Full Audit

**Step 0 (mandatory)**: Read `~/.claude/on-demand/audit-protocol.md` first — it contains the 4-phase protocol, 3 iron rules, and severity criteria. This file is NOT auto-loaded to save context; you MUST load it at command start.

Trigger a full platform audit following the 4-phase protocol defined in `~/.claude/on-demand/audit-protocol.md`.

## Pre-requisites

If the project has Layer 2 audit scripts (`scripts/audit/run-all.sh`), run them first as baseline:
```bash
# Only if the scripts exist in the current project
if [ -f scripts/audit/run-all.sh ]; then ./scripts/audit/run-all.sh; fi
```

Layer 2 results are the baseline — Layer 3 focuses on NEW issues that grep scripts cannot detect.

## Execution — 4 Phases (mandatory, in order)

### Phase 1: Information Collection (Explore agents, parallel)

Launch Explore agents for independent dimensions. These agents collect FACTS ONLY — they do NOT assign severity ratings of HIGH or above.

Typical dimensions (adapt to the project):
- API contract consistency (frontend vs backend)
- Code logic and completeness
- Deployment and configuration integrity
- Operational reliability (graceful shutdown, crash recovery, resource limits)

### Phase 2: Independent Security Audit (security-reviewer agent, mandatory)

Launch a SEPARATE security-reviewer agent. This MUST be independent — never merge security into Phase 1.

Focus areas: authentication, authorization, secrets management, input validation, CORS, transport security, rate limiting.

### Phase 3: Verification by Main Agent (mandatory, sequential)

After Phase 1-2 complete, the main agent MUST personally verify every HIGH+ finding:
- Run compilation commands (`cargo check`, `tsc --noEmit`, etc.)
- Run grep with actual line numbers
- Read complete call chains (caller AND callee)
- Execute runtime checks where applicable

Findings without verification evidence are marked UNVERIFIED and excluded from the final report.

### Phase 4: Adversarial Review (code-reviewer agents, parallel)

Launch code-reviewer agents to:
1. Challenge confirmed findings — is it a real bug or an intentional design trade-off?
2. Hunt for issues missed by Phase 1-2
3. Identify false positives

## Output: Revised Audit Report

The final report includes ONLY verified findings, organized by severity. Each finding must have:
- File path and line number
- Verification method and evidence
- Impact assessment
- Suggested fix

## Three Iron Rules

1. **Explore agents NEVER produce HIGH+ conclusions** — they collect facts; severity is assigned only after Phase 3 verification
2. **Security MUST be independent** — never merged into functional audit
3. **HIGH+ MUST have verification evidence** — no evidence = UNVERIFIED
