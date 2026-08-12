#!/usr/bin/env python3
"""Diagnose the installed unified Codex workflow without modifying it."""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import re
import shlex
import shutil
import subprocess
import sys

try:
    import tomllib as toml_parser
except ModuleNotFoundError:  # pragma: no cover - Python < 3.11
    try:
        import tomli as toml_parser  # type: ignore[no-redef]
    except ModuleNotFoundError:  # pragma: no cover
        toml_parser = None


REQUIRED_SKILLS = (
    "system-triage",
    "clarify-scope",
    "plan-execute",
    "verification-gate",
    "autoresearch-lite",
    "code-review-gate",
    "workflow-doctor",
    "handoff-memory",
)
REQUIRED_EVENTS = ("SessionStart", "UserPromptSubmit", "PreToolUse", "PostToolUse", "Stop")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--codex-home",
        type=Path,
        default=Path(os.environ.get("CODEX_HOME", Path.home() / ".codex")),
    )
    parser.add_argument("--project", type=Path, default=Path.cwd())
    return parser.parse_args()


def parse_toml(text: str) -> None:
    if toml_parser is not None:
        toml_parser.loads(text)
        return
    for candidate in ("python3.14", "python3.13", "python3.12", "python3.11"):
        executable = shutil.which(candidate)
        if not executable:
            continue
        result = subprocess.run(
            [executable, "-c", "import sys,tomllib; tomllib.loads(sys.stdin.read())"],
            input=text,
            capture_output=True,
            text=True,
            check=False,
        )
        if result.returncode == 0:
            return
        raise ValueError(result.stderr.strip() or "invalid TOML")
    raise RuntimeError("TOML validation requires Python 3.11+ or tomli")


def managed_hook_count(entries: object, expected_command: str) -> int:
    if not isinstance(entries, list):
        return 0
    return sum(
        1
        for entry in entries
        if isinstance(entry, dict)
        for hook in entry.get("hooks", [])
        if isinstance(hook, dict)
        and hook.get("type") == "command"
        and hook.get("command") == expected_command
    )


def managed_hook_command(script_path: Path) -> str:
    canonical_path = script_path.expanduser().resolve()
    return f"python3 {shlex.quote(str(canonical_path))}"


def active_workflow_text(codex_home: Path) -> str:
    candidates = [
        codex_home / "AGENTS.md",
        codex_home / "config.toml",
        codex_home / "hooks.json",
        codex_home / "scripts" / "codex-global-hook.py",
    ]
    chunks = []
    for path in candidates:
        try:
            chunks.append(path.read_text(encoding="utf-8"))
        except (FileNotFoundError, IsADirectoryError, OSError, UnicodeDecodeError):
            continue
    return "\n".join(chunks)


def project_overlay_detail(project: Path) -> str:
    present = []
    for relative in (
        "AGENTS.md",
        ".codex/project-context.md",
        ".memory/handoff.md",
        ".memory/today.md",
        ".memory/weekly.md",
        ".memory/long-term.md",
    ):
        if (project / relative).is_file():
            present.append(relative)
    return "present: " + ", ".join(present) if present else "optional overlay not used"


def legacy_findings(codex_home: Path, home: Path) -> tuple[list[str], str]:
    findings = []
    details = []
    for path in (codex_home / "agents", codex_home / "commands"):
        if path.exists():
            findings.append(f"legacy active root exists: {path}")
            details.append(str(path))

    shared_skills = home / ".agents" / "skills"
    if shared_skills.exists():
        text = active_workflow_text(codex_home)
        if re.search(r"(?:~|/[^\s'\"]+)/\.agents/skills|\.agents/skills", text):
            findings.append(f"active workflow still references legacy root: {shared_skills}")
            details.append(str(shared_skills))
        else:
            details.append(f"user-managed, unreferenced: {shared_skills}")

    legacy_memory = codex_home / "memories"
    pending = [
        path
        for path in legacy_memory.glob("*.md")
        if path.is_file() and path.stat().st_size > 0
    ]
    if pending:
        findings.append("legacy Codex memory remains unmerged: " + ", ".join(map(str, pending)))
        details.extend(map(str, pending))
    return findings, "; ".join(details) if details else "none detected"


def inspect(
    codex_home: Path, project: Path, home: Path
) -> tuple[list[tuple[str, str, str]], list[str]]:
    codex_home = codex_home.expanduser().resolve()
    project = project.expanduser().resolve()
    rows: list[tuple[str, str, str]] = []
    issues: list[str] = []

    agents = codex_home / "AGENTS.md"
    rows.append(("AGENTS.md", "OK" if agents.is_file() else "BROKEN", str(agents)))
    if not agents.is_file():
        issues.append(f"missing global AGENTS.md: {agents}")

    missing_skills = [
        name for name in REQUIRED_SKILLS if not (codex_home / "skills" / name / "SKILL.md").is_file()
    ]
    skills_detail = (
        "missing: " + ", ".join(missing_skills)
        if missing_skills
        else f"{len(REQUIRED_SKILLS)} required skills present"
    )
    rows.append(("Skills", "BROKEN" if missing_skills else "OK", skills_detail))
    if missing_skills:
        issues.append("missing required skills: " + ", ".join(missing_skills))

    hook_script = codex_home / "scripts" / "codex-global-hook.py"
    hooks_status = "OK"
    hooks_detail = ""
    try:
        hooks = json.loads((codex_home / "hooks.json").read_text(encoding="utf-8")).get("hooks", {})
        expected_command = managed_hook_command(hook_script)
        bad_events = [
            event for event in REQUIRED_EVENTS if managed_hook_count(hooks.get(event), expected_command) != 1
        ]
        if bad_events:
            raise ValueError("managed hook count != 1 for " + ", ".join(bad_events))
        hooks_detail = "one managed hook for " + ", ".join(REQUIRED_EVENTS)
    except (FileNotFoundError, json.JSONDecodeError, AttributeError, ValueError, OSError) as exc:
        hooks_status = "BROKEN"
        hooks_detail = str(exc)
        issues.append(f"invalid hooks.json: {exc}")
    rows.append(("Hooks JSON", hooks_status, hooks_detail))

    hook_status = "OK"
    hook_detail = str(hook_script)
    try:
        payload = json.dumps({"hook_event_name": "SessionStart", "cwd": str(project)})
        result = subprocess.run(
            [sys.executable, str(hook_script)],
            input=payload,
            capture_output=True,
            text=True,
            check=False,
            timeout=10,
        )
        if result.returncode != 0 or "SessionStart" not in result.stdout:
            raise RuntimeError(result.stderr.strip() or result.stdout.strip() or "no valid output")
    except (FileNotFoundError, OSError, RuntimeError, subprocess.TimeoutExpired) as exc:
        hook_status = "BROKEN"
        hook_detail = str(exc)
        issues.append(f"hook script failed: {exc}")
    rows.append(("Hook Script", hook_status, hook_detail))

    config = codex_home / "config.toml"
    config_status = "OK"
    config_detail = str(config)
    try:
        config_text = config.read_text(encoding="utf-8")
        parse_toml(config_text)
        required = ("developer_instructions", "multi_agent", "codex_hooks", "max_threads", "max_depth")
        missing = [token for token in required if token not in config_text]
        if missing:
            raise ValueError("missing expected settings: " + ", ".join(missing))
    except (FileNotFoundError, OSError, RuntimeError, ValueError) as exc:
        config_status = "BROKEN"
        config_detail = str(exc)
        issues.append(f"invalid config.toml: {exc}")
    rows.append(("Config TOML", config_status, config_detail))

    rows.append(("Project Overlay", "OK", project_overlay_detail(project)))
    legacy_issues, legacy_detail = legacy_findings(codex_home, home)
    rows.append(("Legacy Roots", "WARN" if legacy_issues else "OK", legacy_detail))
    issues.extend(legacy_issues)
    return rows, issues


def main() -> int:
    args = parse_args()
    codex_home = args.codex_home.expanduser().resolve()
    project = args.project.expanduser().resolve()
    rows, issues = inspect(codex_home, project, Path.home())
    overall = "BROKEN" if any(status == "BROKEN" for _, status, _ in rows) else ("WARN" if any(status == "WARN" for _, status, _ in rows) else "HEALTHY")

    print("## Workflow Doctor Report\n")
    print(f"- Status: {overall}")
    print(f"- Active CODEX_HOME: {codex_home}")
    print(f"- Current Project: {project}\n")
    print("| Check | Status | Details |")
    print("| --- | --- | --- |")
    for name, status, detail in rows:
        safe_detail = detail.replace("|", "\\|")
        print(f"| {name} | {status} | {safe_detail} |")
    print("\n### Issues Found")
    if issues:
        for issue in issues:
            print(f"- {issue}")
    else:
        print("- none")
    print("\n### Recommended Fixes")
    if overall == "HEALTHY":
        print("- No workflow fixes required.")
    else:
        if any(status == "BROKEN" for _, status, _ in rows):
            print("- Re-run the canonical Codex adapter installer, then repeat this diagnostic.")
        if any("memory remains unmerged" in issue for issue in issues):
            print("- Review and migrate legacy memory into ~/.memory or PROJECT/.memory before archiving it.")
        if any("legacy active root" in issue or "references legacy root" in issue for issue in issues):
            print("- Remove only confirmed workflow-owned legacy references; preserve user-managed skills.")
    return 1 if overall == "BROKEN" else 0


if __name__ == "__main__":
    sys.exit(main())
