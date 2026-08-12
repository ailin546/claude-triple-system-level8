#!/usr/bin/env python3
"""Install the Codex adapter without modifying Claude Code files."""

from __future__ import annotations

import argparse
import datetime as dt
from functools import lru_cache
import hashlib
import json
import os
from pathlib import Path
import re
import shlex
import shutil
import subprocess
import sys
import tempfile

try:
    import tomllib as toml_parser
except ModuleNotFoundError:  # pragma: no cover - Python < 3.11
    try:
        import tomli as toml_parser  # type: ignore[no-redef]
    except ModuleNotFoundError:  # pragma: no cover - optional Python 3.9 fallback
        toml_parser = None


MANAGED_EVENTS = ("SessionStart", "UserPromptSubmit", "PreToolUse", "PostToolUse", "Stop")
DEVELOPER_START = "<!-- unified-workflow:start -->"
DEVELOPER_END = "<!-- unified-workflow:end -->"
DEVELOPER_TEXT = (
    f"{DEVELOPER_START}\n"
    "You have a local Codex global workflow framework installed. Use AGENTS.md at CODEX_HOME "
    "as the orchestration brain. Prefer a lightweight execution path by default, classify work "
    "into Fast, Standard, or Heavy, and use workflow skills from ~/.codex/skills when they "
    "materially improve outcomes. Reserve parallel child agents for bounded, high-value subtasks "
    "with clear ownership. Treat verification as required evidence before declaring completion. "
    "Read shared memory from ~/.memory and PROJECT/.memory; do not create a separate Codex-only "
    f"memory source.\n{DEVELOPER_END}"
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Install or check the unified Codex workflow adapter")
    parser.add_argument(
        "--codex-home",
        type=Path,
        default=Path(os.environ.get("CODEX_HOME", Path.home() / ".codex")),
        help="Codex home directory (default: CODEX_HOME or ~/.codex)",
    )
    parser.add_argument("--check", action="store_true", help="Check installation without writing")
    parser.add_argument("--dry-run", action="store_true", help="Show managed targets without writing")
    return parser.parse_args()


def adapter_root() -> Path:
    return Path(__file__).resolve().parents[1]


def sha256_file(file_path: Path) -> str:
    digest = hashlib.sha256()
    with file_path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def trees_match(source: Path, target: Path) -> bool:
    if not source.is_dir() or not target.is_dir():
        return False
    source_files = sorted(item.relative_to(source) for item in source.rglob("*") if item.is_file())
    target_files = sorted(item.relative_to(target) for item in target.rglob("*") if item.is_file())
    if source_files != target_files:
        return False
    return all(sha256_file(source / item) == sha256_file(target / item) for item in source_files)


def backup_path(source: Path, backup_root: Path, codex_home: Path) -> None:
    if not source.exists() and not source.is_symlink():
        return
    relative = source.relative_to(codex_home)
    destination = backup_root / relative
    destination.parent.mkdir(parents=True, exist_ok=True)
    if source.is_dir() and not source.is_symlink():
        shutil.copytree(source, destination, symlinks=True)
    else:
        shutil.copy2(source, destination, follow_symlinks=False)


def remove_exact_target(target: Path) -> None:
    if target.is_dir() and not target.is_symlink():
        shutil.rmtree(target)
    elif target.exists() or target.is_symlink():
        target.unlink()


def restore_targets(
    managed_targets: list[Path], backup_root: Path, codex_home: Path, existed_before: set[Path]
) -> None:
    for target in reversed(managed_targets):
        backup = backup_root / target.relative_to(codex_home)
        remove_exact_target(target)
        if target not in existed_before:
            continue
        target.parent.mkdir(parents=True, exist_ok=True)
        if backup.is_dir() and not backup.is_symlink():
            shutil.copytree(backup, target, symlinks=True)
        else:
            shutil.copy2(backup, target, follow_symlinks=False)


def atomic_copy_file(source: Path, target: Path) -> None:
    target.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temporary_name = tempfile.mkstemp(prefix=f".{target.name}.", dir=target.parent)
    os.close(descriptor)
    temporary = Path(temporary_name)
    try:
        shutil.copy2(source, temporary)
        os.replace(temporary, target)
    finally:
        temporary.unlink(missing_ok=True)


def atomic_write_text(target: Path, text: str) -> None:
    target.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temporary_name = tempfile.mkstemp(prefix=f".{target.name}.", dir=target.parent)
    os.close(descriptor)
    temporary = Path(temporary_name)
    try:
        temporary.write_text(text, encoding="utf-8")
        os.replace(temporary, target)
    finally:
        temporary.unlink(missing_ok=True)


def atomic_replace_tree(source: Path, target: Path) -> None:
    target.parent.mkdir(parents=True, exist_ok=True)
    stage = Path(tempfile.mkdtemp(prefix=f".{target.name}.stage.", dir=target.parent))
    old = target.parent / f".{target.name}.old.{os.getpid()}"
    try:
        shutil.rmtree(stage)
        shutil.copytree(source, stage, symlinks=True)
        if target.exists() or target.is_symlink():
            os.replace(target, old)
        os.replace(stage, target)
        if old.exists() or old.is_symlink():
            if old.is_dir() and not old.is_symlink():
                shutil.rmtree(old)
            else:
                old.unlink()
    except Exception:
        if not target.exists() and (old.exists() or old.is_symlink()):
            os.replace(old, target)
        raise
    finally:
        if stage.exists():
            shutil.rmtree(stage)


def upsert_table_value(text: str, table: str, key: str, value: str) -> str:
    table_pattern = rf"(?ms)(^\[{re.escape(table)}\]\s*$.*?)(?=^\[|\Z)"
    match = re.search(table_pattern, text)
    if not match:
        suffix = "" if not text.strip() else "\n\n"
        return text.rstrip() + suffix + f"[{table}]\n{key} = {value}\n"
    block = match.group(1)
    line_pattern = rf"(?m)^\s*{re.escape(key)}\s*=.*$"
    if re.search(line_pattern, block):
        updated = re.sub(line_pattern, f"{key} = {value}", block, count=1)
    else:
        updated = block.rstrip() + f"\n{key} = {value}\n"
    return text[: match.start(1)] + updated + text[match.end(1) :]


def inject_developer_instructions(text: str) -> str:
    triple_pattern = r'(?ms)^developer_instructions\s*=\s*"""(.*?)"""'
    triple_match = re.search(triple_pattern, text)
    if triple_match:
        existing = triple_match.group(1).strip()
        managed_pattern = rf"(?ms){re.escape(DEVELOPER_START)}.*?{re.escape(DEVELOPER_END)}"
        if re.search(managed_pattern, existing):
            merged = re.sub(managed_pattern, DEVELOPER_TEXT, existing, count=1)
        elif "You have a local Codex global workflow framework installed." in existing:
            merged = DEVELOPER_TEXT
        else:
            merged = existing + ("\n\n" if existing else "") + DEVELOPER_TEXT
        replacement = f'developer_instructions = """\n{merged}\n"""'
        return text[: triple_match.start()] + replacement + text[triple_match.end() :]

    line_match = re.search(r"(?m)^developer_instructions\s*=.*$", text)
    if line_match:
        parsed = parse_toml(line_match.group(0)).get("developer_instructions")
        if not isinstance(parsed, str):
            raise ValueError("developer_instructions must be a string")
        merged = parsed.strip() + ("\n\n" if parsed.strip() else "") + DEVELOPER_TEXT
        replacement = f'developer_instructions = """\n{merged}\n"""'
        return text[: line_match.start()] + replacement + text[line_match.end() :]

    developer_block = f'developer_instructions = """\n{DEVELOPER_TEXT}\n"""'
    return developer_block + ("\n\n" + text if text.strip() else "\n")


@lru_cache(maxsize=1)
def external_toml_python() -> str | None:
    """Find a Python with stdlib tomllib when this interpreter lacks a parser."""
    current = Path(sys.executable).resolve()
    for candidate in ("python3.14", "python3.13", "python3.12", "python3.11"):
        executable = shutil.which(candidate)
        if not executable or Path(executable).resolve() == current:
            continue
        probe = subprocess.run(
            [executable, "-c", "import tomllib"],
            check=False,
            capture_output=True,
            text=True,
        )
        if probe.returncode == 0:
            return executable
    return None


def parse_toml(text: str) -> dict[str, object]:
    if toml_parser is not None:
        return toml_parser.loads(text)

    executable = external_toml_python()
    if executable is None:
        raise RuntimeError(
            "TOML validation requires Python 3.11+ or the 'tomli' package; "
            "installation stopped before writing"
        )
    parser_script = (
        "import json, sys, tomllib; "
        "print(json.dumps(tomllib.loads(sys.stdin.read()), ensure_ascii=False))"
    )
    result = subprocess.run(
        [executable, "-c", parser_script],
        input=text,
        check=False,
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        detail = result.stderr.strip().splitlines()
        raise ValueError(detail[-1] if detail else "invalid TOML")
    parsed = json.loads(result.stdout)
    if not isinstance(parsed, dict):
        raise ValueError("TOML root must be a table")
    return parsed


def validate_toml(text: str) -> None:
    if toml_parser is not None:
        toml_parser.loads(text)
        return

    executable = external_toml_python()
    if executable is None:
        raise RuntimeError(
            "TOML validation requires Python 3.11+ or the 'tomli' package; "
            "installation stopped before writing"
        )
    result = subprocess.run(
        [executable, "-c", "import sys, tomllib; tomllib.loads(sys.stdin.read())"],
        input=text,
        check=False,
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        detail = result.stderr.strip().splitlines()
        raise ValueError(detail[-1] if detail else "invalid TOML")


def render_config(text: str) -> str:
    if text.strip():
        validate_toml(text)
    text = inject_developer_instructions(text)

    for feature in ("multi_agent", "child_agents_md", "codex_hooks"):
        text = upsert_table_value(text, "features", feature, "true")
    text = upsert_table_value(text, "agents", "max_threads", "6")
    text = upsert_table_value(text, "agents", "max_depth", "2")
    rendered = text.rstrip() + "\n"
    validate_toml(rendered)
    return rendered


def update_config(config_path: Path, rendered: str | None = None) -> None:
    if rendered is None:
        existing = config_path.read_text(encoding="utf-8") if config_path.exists() else ""
        rendered = render_config(existing)
    atomic_write_text(config_path, rendered)


def managed_hooks(script_path: Path) -> dict[str, list[dict[str, object]]]:
    command = managed_hook_command(script_path)
    return {
        "SessionStart": [{"matcher": "startup|resume", "hooks": [{"type": "command", "command": command}]}],
        "UserPromptSubmit": [{"hooks": [{"type": "command", "command": command}]}],
        "PreToolUse": [{"matcher": "Bash", "hooks": [{"type": "command", "command": command}]}],
        "PostToolUse": [{"hooks": [{"type": "command", "command": command}]}],
        "Stop": [{"hooks": [{"type": "command", "command": command}]}],
    }


def managed_hook_command(script_path: Path) -> str:
    canonical_path = script_path.expanduser().resolve()
    return f"python3 {shlex.quote(str(canonical_path))}"


def is_managed_hook_command(hook: object, script_path: Path) -> bool:
    return isinstance(hook, dict) and hook.get("command") == managed_hook_command(script_path)


def without_managed_hook_commands(entry: object, script_path: Path) -> object | None:
    if not isinstance(entry, dict):
        return entry
    inner_hooks = entry.get("hooks", [])
    if not isinstance(inner_hooks, list):
        return entry
    preserved_hooks = [
        hook for hook in inner_hooks if not is_managed_hook_command(hook, script_path)
    ]
    if not preserved_hooks:
        return None
    preserved_entry = dict(entry)
    preserved_entry["hooks"] = preserved_hooks
    return preserved_entry


def managed_hook_count(entries: object, script_path: Path) -> int:
    if not isinstance(entries, list):
        return 0
    return sum(
        1
        for entry in entries
        if isinstance(entry, dict)
        for hook in entry.get("hooks", [])
        if is_managed_hook_command(hook, script_path)
    )


def render_hooks(text: str, script_path: Path) -> str:
    root = json.loads(text) if text.strip() else {}
    if not isinstance(root, dict):
        raise ValueError("hooks.json root must be an object")
    hooks = root.get("hooks", {})
    if not isinstance(hooks, dict):
        raise ValueError("hooks.json hooks must be an object")
    for event, managed_entries in managed_hooks(script_path).items():
        existing = hooks.get(event, [])
        if not isinstance(existing, list):
            raise ValueError(f"hooks.json event {event!r} must be a list")
        preserved = []
        for entry in existing:
            cleaned = without_managed_hook_commands(entry, script_path)
            if cleaned is not None:
                preserved.append(cleaned)
        hooks[event] = preserved + managed_entries
    root["hooks"] = hooks
    return json.dumps(root, indent=2, ensure_ascii=False) + "\n"


def update_hooks(hooks_path: Path, script_path: Path, rendered: str | None = None) -> None:
    if rendered is None:
        existing = hooks_path.read_text(encoding="utf-8") if hooks_path.exists() else ""
        rendered = render_hooks(existing, script_path)
    atomic_write_text(hooks_path, rendered)


def check_installation(codex_home: Path) -> int:
    root = adapter_root()
    repository = root.parents[1]
    checks: list[tuple[str, bool, str]] = []
    checks.append(("AGENTS.md", (codex_home / "AGENTS.md").is_file() and sha256_file(root / "AGENTS.md") == sha256_file(codex_home / "AGENTS.md"), "managed global instructions"))
    checks.append(("Hook script", (codex_home / "scripts/codex-global-hook.py").is_file() and sha256_file(root / "scripts/codex-global-hook.py") == sha256_file(codex_home / "scripts/codex-global-hook.py"), "shared-memory-aware hook"))
    checks.append(("Workflow doctor", (codex_home / "scripts/workflow-doctor.py").is_file() and sha256_file(root / "scripts/workflow-doctor.py") == sha256_file(codex_home / "scripts/workflow-doctor.py"), "canonical diagnostic"))
    for source_skill in sorted((root / "skills").iterdir()):
        if source_skill.is_dir() and (source_skill / "SKILL.md").is_file():
            checks.append((f"Skill {source_skill.name}", trees_match(source_skill, codex_home / "skills" / source_skill.name), "managed skill tree"))

    hooks_ok = False
    hook_target = codex_home / "scripts/codex-global-hook.py"
    try:
        hooks_root = json.loads((codex_home / "hooks.json").read_text(encoding="utf-8"))
        hooks = hooks_root.get("hooks", {})
        hooks_ok = all(
            isinstance(hooks.get(event), list)
            and managed_hook_count(hooks[event], hook_target) == 1
            for event in MANAGED_EVENTS
        )
    except (FileNotFoundError, json.JSONDecodeError, AttributeError, OSError):
        hooks_ok = False
    checks.append(("hooks.json", hooks_ok, "one managed hook per event"))

    config_path = codex_home / "config.toml"
    config_ok = config_path.is_file()
    config_text = ""
    if config_ok:
        try:
            config_text = config_path.read_text(encoding="utf-8")
        except OSError:
            config_ok = False
    if config_ok:
        try:
            validate_toml(config_text)
        except (OSError, RuntimeError, ValueError):
            config_ok = False
    required_config_patterns = (
        r"(?m)^developer_instructions\s*=",
        r"(?m)^multi_agent\s*=\s*true\s*$",
        r"(?m)^child_agents_md\s*=\s*true\s*$",
        r"(?m)^codex_hooks\s*=\s*true\s*$",
        r"(?m)^max_threads\s*=\s*\d+\s*$",
        r"(?m)^max_depth\s*=\s*\d+\s*$",
    )
    config_ok = config_ok and "~/.memory" in config_text and all(
        re.search(pattern, config_text) for pattern in required_config_patterns
    )
    checks.append(("config.toml", config_ok, "valid workflow configuration"))
    documentation_target = codex_home / "workflow-docs" / "UNIFIED_WORKFLOW.md"
    checks.append(
        (
            "Unified docs",
            documentation_target.is_file()
            and sha256_file(repository / "docs" / "UNIFIED_WORKFLOW.md")
            == sha256_file(documentation_target),
            "installed compatibility contract",
        )
    )
    usage_target = codex_home / "workflow-docs" / "CODEX_USAGE.md"
    checks.append(
        (
            "Codex usage guide",
            usage_target.is_file()
            and sha256_file(repository / "docs" / "CODEX_USAGE.md")
            == sha256_file(usage_target),
            "installed native lifecycle guide",
        )
    )
    memory_protocol_target = codex_home / "workflow-docs" / "SHARED_MEMORY_PROTOCOL.md"
    checks.append(
        (
            "Shared memory docs",
            memory_protocol_target.is_file()
            and sha256_file(repository / "shared" / "memory" / "PROTOCOL.md")
            == sha256_file(memory_protocol_target),
            "installed shared-memory contract",
        )
    )

    for name, passed, detail in checks:
        print(f"{'OK' if passed else 'BROKEN':6} {name}: {detail}")
    memory_root = Path(os.environ.get("AGENT_MEMORY_HOME", Path.home() / ".memory")).expanduser()
    print(f"{'OK' if memory_root.is_dir() else 'WARN':6} shared memory root: {memory_root}")
    legacy_memory = codex_home / "memories"
    legacy_nonempty = [
        item for item in legacy_memory.glob("*.md") if item.is_file() and item.stat().st_size > 0
    ]
    if legacy_nonempty:
        print(
            "WARN   legacy Codex memory remains unmerged: "
            + ", ".join(str(item) for item in legacy_nonempty)
        )
    return 0 if all(passed for _, passed, _ in checks) else 1


def install(codex_home: Path, dry_run: bool) -> int:
    root = adapter_root()
    repository = root.parents[1]
    skill_sources = sorted(
        item for item in (root / "skills").iterdir() if item.is_dir() and (item / "SKILL.md").is_file()
    )
    managed_targets = [
        codex_home / "AGENTS.md",
        codex_home / "scripts/codex-global-hook.py",
        codex_home / "scripts/workflow-doctor.py",
        codex_home / "config.toml",
        codex_home / "hooks.json",
        codex_home / "workflow-docs" / "UNIFIED_WORKFLOW.md",
        codex_home / "workflow-docs" / "CODEX_USAGE.md",
        codex_home / "workflow-docs" / "SHARED_MEMORY_PROTOCOL.md",
        *(codex_home / "skills" / item.name for item in skill_sources),
    ]
    print("Codex adapter only; ~/.claude is outside the managed target set.")
    for target in managed_targets:
        print(f"MANAGE {target}")
    if dry_run:
        return 0

    config_path = codex_home / "config.toml"
    hooks_path = codex_home / "hooks.json"
    hook_target = codex_home / "scripts/codex-global-hook.py"
    existing_config = config_path.read_text(encoding="utf-8") if config_path.exists() else ""
    existing_hooks = hooks_path.read_text(encoding="utf-8") if hooks_path.exists() else ""
    rendered_config = render_config(existing_config)
    rendered_hooks = render_hooks(existing_hooks, hook_target)

    timestamp = dt.datetime.now().strftime("%Y%m%d-%H%M%S-%f")
    backup_root = codex_home / "backups" / "unified-workflow" / timestamp
    existed_before = {target for target in managed_targets if target.exists() or target.is_symlink()}
    for target in managed_targets:
        backup_path(target, backup_root, codex_home)

    try:
        atomic_copy_file(root / "AGENTS.md", codex_home / "AGENTS.md")
        atomic_copy_file(root / "scripts/codex-global-hook.py", hook_target)
        hook_target.chmod(0o755)
        doctor_target = codex_home / "scripts/workflow-doctor.py"
        atomic_copy_file(root / "scripts/workflow-doctor.py", doctor_target)
        doctor_target.chmod(0o755)
        for skill_source in skill_sources:
            atomic_replace_tree(skill_source, codex_home / "skills" / skill_source.name)
        update_config(config_path, rendered_config)
        update_hooks(hooks_path, hook_target, rendered_hooks)
        atomic_copy_file(
            repository / "docs" / "UNIFIED_WORKFLOW.md",
            codex_home / "workflow-docs" / "UNIFIED_WORKFLOW.md",
        )
        atomic_copy_file(
            repository / "docs" / "CODEX_USAGE.md",
            codex_home / "workflow-docs" / "CODEX_USAGE.md",
        )
        atomic_copy_file(
            repository / "shared" / "memory" / "PROTOCOL.md",
            codex_home / "workflow-docs" / "SHARED_MEMORY_PROTOCOL.md",
        )
    except Exception:
        restore_targets(managed_targets, backup_root, codex_home, existed_before)
        print(f"Install failed; restored managed targets from {backup_root}", file=sys.stderr)
        raise
    print(f"Backup: {backup_root}")
    print("Shared memory: ~/.memory and PROJECT/.memory (legacy ~/.codex/memories was not modified).")
    return check_installation(codex_home)


def main() -> int:
    args = parse_args()
    codex_home = args.codex_home.expanduser().resolve()
    if args.check:
        return check_installation(codex_home)
    return install(codex_home, args.dry_run)


if __name__ == "__main__":
    sys.exit(main())
