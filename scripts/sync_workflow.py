#!/usr/bin/env python3
"""Generate Codex artifacts and verify Claude compatibility from one manifest."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import sys
import tempfile


REPOSITORY = Path(__file__).resolve().parents[1]
MANIFEST_PATH = REPOSITORY / "shared" / "workflow" / "manifest.json"
GENERATED_NOTICE = (
    "<!-- Generated from shared/workflow/adapters/codex/AGENTS.md. "
    "Run: python3 scripts/sync_workflow.py -->\n"
)


class WorkflowError(RuntimeError):
    pass


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="verify without writing")
    parser.add_argument(
        "--refresh-claude-baseline",
        action="store_true",
        help="record the current protected Claude files after an explicit compatibility review",
    )
    return parser.parse_args()


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def load_json(path: Path) -> dict[str, object]:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise WorkflowError(f"cannot load {path}: {exc}") from exc
    if not isinstance(value, dict):
        raise WorkflowError(f"{path} root must be an object")
    return value


def repository_path(repository: Path, relative: object) -> Path:
    if not isinstance(relative, str) or not relative.strip():
        raise WorkflowError(f"invalid repository path: {relative!r}")
    target = (repository / relative).resolve()
    try:
        target.relative_to(repository.resolve())
    except ValueError as exc:
        raise WorkflowError(f"path escapes repository: {relative}") from exc
    return target


def require_dict(value: object, label: str) -> dict[str, object]:
    if not isinstance(value, dict):
        raise WorkflowError(f"{label} must be an object")
    return value


def require_list(value: object, label: str) -> list[object]:
    if not isinstance(value, list):
        raise WorkflowError(f"{label} must be a list")
    return value


def validate_manifest(repository: Path, manifest: dict[str, object]) -> list[str]:
    issues: list[str] = []
    if manifest.get("schema_version") != 1:
        issues.append("manifest schema_version must be 1")

    memory_protocol = repository_path(repository, manifest.get("memory_protocol"))
    if not memory_protocol.is_file():
        issues.append(f"missing memory protocol: {memory_protocol}")

    capabilities = require_list(manifest.get("capabilities"), "capabilities")
    seen_ids: set[str] = set()
    seen_skills: set[str] = set()
    codex = require_dict(manifest.get("codex"), "codex")
    skills_source_root = repository_path(repository, codex.get("skills_source_root"))
    hook_source = repository_path(repository, codex.get("hook_source"))
    if not hook_source.is_file():
        issues.append(f"missing Codex hook source: {hook_source}")
    doctor_source = repository_path(repository, codex.get("doctor_source"))
    if not doctor_source.is_file():
        issues.append(f"missing Codex workflow doctor source: {doctor_source}")

    claude = require_dict(manifest.get("claude"), "claude")
    disabled_entrypoints = require_list(
        claude.get("disabled_entrypoints"), "claude disabled_entrypoints"
    )
    for raw_entrypoint in disabled_entrypoints:
        entrypoint = repository_path(repository, raw_entrypoint)
        if entrypoint.exists():
            issues.append(f"disabled Claude entrypoint is active: {entrypoint}")

    for index, raw_capability in enumerate(capabilities):
        capability = require_dict(raw_capability, f"capabilities[{index}]")
        capability_id = capability.get("id")
        skill = capability.get("codex_skill")
        if not isinstance(capability_id, str) or not capability_id:
            issues.append(f"capabilities[{index}] has invalid id")
        elif capability_id in seen_ids:
            issues.append(f"duplicate capability id: {capability_id}")
        else:
            seen_ids.add(capability_id)
        if not isinstance(skill, str) or not skill:
            issues.append(f"capability {capability_id!r} has invalid codex_skill")
        elif skill in seen_skills:
            issues.append(f"duplicate codex skill mapping: {skill}")
        else:
            seen_skills.add(skill)
            source = skills_source_root / skill / "SKILL.md"
            if not source.is_file():
                issues.append(f"missing Codex skill source: {source}")

        evidence_items = require_list(
            capability.get("claude_evidence"), f"capability {capability_id!r} claude_evidence"
        )
        for evidence_index, raw_evidence in enumerate(evidence_items):
            evidence = require_dict(
                raw_evidence, f"capability {capability_id!r} evidence[{evidence_index}]"
            )
            path = repository_path(repository, evidence.get("path"))
            if not path.is_file():
                issues.append(f"missing Claude evidence file: {path}")
                continue
            text = path.read_text(encoding="utf-8")
            tokens = require_list(evidence.get("contains"), f"evidence tokens for {path}")
            for token in tokens:
                if not isinstance(token, str) or token not in text:
                    issues.append(f"Claude evidence token {token!r} missing from {path}")
    return issues


def atomic_write_text(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temporary_name = tempfile.mkstemp(prefix=f".{path.name}.", dir=path.parent)
    os.close(descriptor)
    temporary = Path(temporary_name)
    try:
        temporary.write_text(text, encoding="utf-8")
        os.replace(temporary, path)
    finally:
        temporary.unlink(missing_ok=True)


def tree_files(root: Path) -> list[Path]:
    if not root.is_dir():
        return []
    return sorted(item.relative_to(root) for item in root.rglob("*") if item.is_file())


def trees_match(source: Path, output: Path) -> bool:
    source_files = tree_files(source)
    output_files = tree_files(output)
    return source_files == output_files and all(
        sha256_file(source / relative) == sha256_file(output / relative)
        for relative in source_files
    )


def sync_codex_outputs(
    repository: Path, manifest: dict[str, object], check_only: bool
) -> list[str]:
    issues: list[str] = []
    codex = require_dict(manifest.get("codex"), "codex")
    agents_source = repository_path(repository, codex.get("agents_source"))
    agents_output = repository_path(repository, codex.get("agents_output"))
    hook_source = repository_path(repository, codex.get("hook_source"))
    hook_output = repository_path(repository, codex.get("hook_output"))
    doctor_source = repository_path(repository, codex.get("doctor_source"))
    doctor_output = repository_path(repository, codex.get("doctor_output"))
    skills_source_root = repository_path(repository, codex.get("skills_source_root"))
    skills_output_root = repository_path(repository, codex.get("skills_output_root"))

    if not agents_source.is_file():
        issues.append(f"missing Codex AGENTS source: {agents_source}")
    else:
        expected_agents = GENERATED_NOTICE + agents_source.read_text(encoding="utf-8")
        actual_agents = (
            agents_output.read_text(encoding="utf-8") if agents_output.is_file() else ""
        )
        if actual_agents != expected_agents:
            if check_only:
                issues.append(f"stale generated Codex AGENTS: {agents_output}")
            else:
                atomic_write_text(agents_output, expected_agents)

    if not hook_source.is_file():
        issues.append(f"missing Codex hook source: {hook_source}")
    else:
        expected_hook = hook_source.read_text(encoding="utf-8")
        actual_hook = hook_output.read_text(encoding="utf-8") if hook_output.is_file() else ""
        if actual_hook != expected_hook:
            if check_only:
                issues.append(f"stale generated Codex hook: {hook_output}")
            else:
                atomic_write_text(hook_output, expected_hook)

    if not doctor_source.is_file():
        issues.append(f"missing Codex workflow doctor source: {doctor_source}")
    else:
        expected_doctor = doctor_source.read_text(encoding="utf-8")
        actual_doctor = (
            doctor_output.read_text(encoding="utf-8") if doctor_output.is_file() else ""
        )
        if actual_doctor != expected_doctor:
            if check_only:
                issues.append(f"stale generated Codex workflow doctor: {doctor_output}")
            else:
                atomic_write_text(doctor_output, expected_doctor)

    capabilities = require_list(manifest.get("capabilities"), "capabilities")
    expected_skills: set[str] = set()
    for raw_capability in capabilities:
        capability = require_dict(raw_capability, "capability")
        skill = capability.get("codex_skill")
        if not isinstance(skill, str):
            continue
        expected_skills.add(skill)
        source = skills_source_root / skill
        output = skills_output_root / skill
        if trees_match(source, output):
            continue
        if check_only:
            issues.append(f"stale generated Codex skill: {output}")
            continue
        skills_output_root.mkdir(parents=True, exist_ok=True)
        stage = Path(tempfile.mkdtemp(prefix=f".{skill}.stage.", dir=skills_output_root))
        try:
            shutil.rmtree(stage)
            shutil.copytree(source, stage)
            if output.exists():
                shutil.rmtree(output)
            os.replace(stage, output)
        finally:
            if stage.exists():
                shutil.rmtree(stage)

    if skills_output_root.is_dir():
        actual_skills = {
            item.name
            for item in skills_output_root.iterdir()
            if item.is_dir() and (item / "SKILL.md").is_file()
        }
        unexpected = sorted(actual_skills - expected_skills)
        if unexpected:
            issues.append("unmanaged Codex output skills: " + ", ".join(unexpected))
    return issues


def baseline_paths(repository: Path, manifest: dict[str, object]) -> tuple[Path, list[str]]:
    claude = require_dict(manifest.get("claude"), "claude")
    baseline_path = repository_path(repository, claude.get("baseline"))
    raw_paths = require_list(claude.get("protected_paths"), "claude protected_paths")
    paths: list[str] = []
    for raw_path in raw_paths:
        path = repository_path(repository, raw_path)
        relative = str(path.relative_to(repository.resolve()))
        paths.append(relative)
    return baseline_path, paths


def refresh_claude_baseline(repository: Path, manifest: dict[str, object]) -> Path:
    baseline_path, paths = baseline_paths(repository, manifest)
    missing = [path for path in paths if not (repository / path).is_file()]
    if missing:
        raise WorkflowError("cannot baseline missing Claude files: " + ", ".join(missing))
    baseline = {
        "schema_version": 1,
        "purpose": "Protected Claude compatibility surface; refresh only after explicit review.",
        "files": {path: sha256_file(repository / path) for path in sorted(paths)},
    }
    atomic_write_text(baseline_path, json.dumps(baseline, indent=2, ensure_ascii=False) + "\n")
    return baseline_path


def verify_claude_baseline(repository: Path, manifest: dict[str, object]) -> list[str]:
    baseline_path, protected_paths = baseline_paths(repository, manifest)
    if not baseline_path.is_file():
        return [f"missing Claude baseline: {baseline_path}"]
    baseline = load_json(baseline_path)
    files = baseline.get("files")
    if not isinstance(files, dict):
        return [f"invalid Claude baseline files map: {baseline_path}"]
    issues: list[str] = []
    if set(files) != set(protected_paths):
        issues.append("Claude baseline path set differs from manifest protected_paths")
    for relative in protected_paths:
        path = repository / relative
        if not path.is_file():
            issues.append(f"missing protected Claude file: {path}")
            continue
        expected = files.get(relative)
        actual = sha256_file(path)
        if expected != actual:
            issues.append(f"protected Claude file changed without baseline review: {path}")
    return issues


def run(repository: Path, check_only: bool, refresh_baseline: bool) -> list[str]:
    manifest = load_json(repository / "shared" / "workflow" / "manifest.json")
    issues = validate_manifest(repository, manifest)
    if issues:
        return issues
    if refresh_baseline:
        refresh_claude_baseline(repository, manifest)
    issues.extend(sync_codex_outputs(repository, manifest, check_only))
    issues.extend(verify_claude_baseline(repository, manifest))
    return issues


def main() -> int:
    args = parse_args()
    if args.check and args.refresh_claude_baseline:
        print("--check and --refresh-claude-baseline cannot be combined", file=sys.stderr)
        return 2
    try:
        issues = run(REPOSITORY, args.check, args.refresh_claude_baseline)
    except WorkflowError as exc:
        print(f"BROKEN {exc}", file=sys.stderr)
        return 1
    for issue in issues:
        print(f"BROKEN {issue}")
    if issues:
        return 1
    print("OK unified workflow sources, Codex outputs, Claude mappings, and baseline")
    return 0


if __name__ == "__main__":
    sys.exit(main())
