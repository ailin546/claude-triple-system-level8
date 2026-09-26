import importlib.util
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest


REPOSITORY = Path(__file__).resolve().parents[1]
SCRIPT = REPOSITORY / "scripts" / "sync_workflow.py"
SPEC = importlib.util.spec_from_file_location("sync_workflow", SCRIPT)
SYNC = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(SYNC)


class WorkflowSyncTests(unittest.TestCase):
    def test_repository_generated_outputs_and_claude_baseline_are_current(self):
        result = subprocess.run(
            [sys.executable, str(SCRIPT), "--check"],
            cwd=REPOSITORY,
            check=False,
            capture_output=True,
            text=True,
        )

        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def test_claude_baseline_detects_protected_file_change(self):
        with tempfile.TemporaryDirectory() as temporary_root:
            repository = Path(temporary_root)
            protected = repository / "CLAUDE.md"
            protected.write_text("baseline", encoding="utf-8")
            baseline = repository / "baseline.json"
            manifest = {
                "claude": {
                    "baseline": "baseline.json",
                    "protected_paths": ["CLAUDE.md"],
                }
            }
            baseline.write_text(
                json.dumps(
                    {
                        "schema_version": 1,
                        "files": {"CLAUDE.md": SYNC.sha256_file(protected)},
                    }
                ),
                encoding="utf-8",
            )
            protected.write_text("changed", encoding="utf-8")

            issues = SYNC.verify_claude_baseline(repository, manifest)

            self.assertEqual(len(issues), 1)
            self.assertIn("changed without baseline review", issues[0])

    def test_codex_sync_preserves_one_canonical_source(self):
        with tempfile.TemporaryDirectory() as temporary_root:
            repository = Path(temporary_root)
            agents_source = repository / "shared" / "AGENTS.md"
            hook_source = repository / "shared" / "hook.py"
            doctor_source = repository / "shared" / "doctor.py"
            skill_source = repository / "shared" / "skills" / "triage"
            agents_output = repository / "adapter" / "AGENTS.md"
            hook_output = repository / "adapter" / "hook.py"
            doctor_output = repository / "adapter" / "doctor.py"
            skill_output = repository / "adapter" / "skills" / "triage"
            agents_source.parent.mkdir(parents=True)
            skill_source.mkdir(parents=True)
            agents_output.parent.mkdir(parents=True)
            skill_output.mkdir(parents=True)
            agents_source.write_text("canonical agents\n", encoding="utf-8")
            hook_source.write_text("canonical hook\n", encoding="utf-8")
            doctor_source.write_text("canonical doctor\n", encoding="utf-8")
            (skill_source / "SKILL.md").write_text("canonical skill\n", encoding="utf-8")
            agents_output.write_text("stale\n", encoding="utf-8")
            hook_output.write_text("stale\n", encoding="utf-8")
            doctor_output.write_text("stale\n", encoding="utf-8")
            (skill_output / "SKILL.md").write_text("stale\n", encoding="utf-8")
            manifest = {
                "codex": {
                    "agents_source": "shared/AGENTS.md",
                    "agents_output": "adapter/AGENTS.md",
                    "hook_source": "shared/hook.py",
                    "hook_output": "adapter/hook.py",
                    "doctor_source": "shared/doctor.py",
                    "doctor_output": "adapter/doctor.py",
                    "skills_source_root": "shared/skills",
                    "skills_output_root": "adapter/skills",
                },
                "capabilities": [{"codex_skill": "triage"}],
            }

            stale = SYNC.sync_codex_outputs(repository, manifest, check_only=True)
            synced = SYNC.sync_codex_outputs(repository, manifest, check_only=False)

            self.assertEqual(len(stale), 4)
            self.assertEqual(synced, [])
            self.assertEqual(
                agents_output.read_text(encoding="utf-8"),
                SYNC.GENERATED_NOTICE + "canonical agents\n",
            )
            self.assertEqual(hook_output.read_text(encoding="utf-8"), "canonical hook\n")
            self.assertEqual(doctor_output.read_text(encoding="utf-8"), "canonical doctor\n")
            self.assertTrue(SYNC.trees_match(skill_source, skill_output))

    def test_workflow_doctor_uses_shared_optional_project_overlay(self):
        source = (
            REPOSITORY
            / "shared"
            / "workflow"
            / "adapters"
            / "codex"
            / "skills"
            / "workflow-doctor"
            / "SKILL.md"
        ).read_text(encoding="utf-8")

        self.assertIn("PROJECT/.memory/handoff.md", source)
        self.assertIn("缺少该文件不应产生 WARN", source)
        self.assertIn("不检查旧 `.codex/handoff.md` 是否存在", source)
        self.assertIn("PROJECT/.codex/project-context.md` 不是框架运行必需项", source)

    def test_codex_usage_guide_maps_the_shared_delivery_lifecycle(self):
        guide = (REPOSITORY / "docs" / "CODEX_USAGE.md").read_text(encoding="utf-8")
        agents = (
            REPOSITORY / "shared" / "workflow" / "adapters" / "codex" / "AGENTS.md"
        ).read_text(encoding="utf-8")

        for stage in (
            "Requirement Confirmation",
            "Plan",
            "Execute",
            "Review",
            "Verify",
            "Docs Sync",
            "Summary",
        ):
            self.assertIn(stage, guide)
            self.assertIn(stage, agents)
        self.assertIn("brainstorming", guide)
        self.assertIn("spec", guide)
        self.assertIn("Fast 且清晰的任务直接走", agents)

    def test_superpowers_entrypoints_remain_disabled(self):
        manifest = SYNC.load_json(REPOSITORY / "shared" / "workflow" / "manifest.json")
        claude = manifest["claude"]

        for relative in claude["disabled_entrypoints"]:
            self.assertFalse((REPOSITORY / relative).exists(), relative)

        settings = json.loads((REPOSITORY / ".claude" / "settings.json").read_text())
        commands = [
            hook.get("command", "")
            for groups in settings["hooks"].values()
            for group in groups
            for hook in group.get("hooks", [])
        ]
        self.assertFalse(any("evaluation-gate.js" in command for command in commands))

    def test_claude_global_instruction_copies_do_not_drift(self):
        self.assertEqual(
            (REPOSITORY / "CLAUDE.md").read_text(encoding="utf-8"),
            (REPOSITORY / ".claude" / "CLAUDE.md").read_text(encoding="utf-8"),
        )

    def test_claude_and_codex_resolve_the_same_project_memory(self):
        # Runs both real implementations side by side; the invariant is that
        # they agree, not that each matches a hand-written expectation.
        node = shutil.which("node")
        if node is None:
            self.skipTest("node is required to run Claude's resolver")
        claude_resolver = REPOSITORY / ".claude" / "scripts" / "lib" / "project-root.js"
        hook_path = REPOSITORY / "adapters" / "codex" / "scripts" / "codex-global-hook.py"
        spec = importlib.util.spec_from_file_location("codex_global_hook", hook_path)
        hook = importlib.util.module_from_spec(spec)
        assert spec.loader is not None
        spec.loader.exec_module(hook)
        redirects = set(hook.GIT_ENV_REDIRECTS) | {"CLAUDE_PROJECT_ROOT"}
        env = {key: value for key, value in os.environ.items() if key not in redirects}

        def git(cwd, *args):
            subprocess.run(
                ["git", "-c", "user.name=test", "-c", "user.email=test@example.invalid", *args],
                cwd=cwd, env=env, check=True, capture_output=True,
            )

        with tempfile.TemporaryDirectory() as temporary_root:
            root = Path(temporary_root)
            main = root / "main"
            (main / "sub").mkdir(parents=True)
            git(main, "-c", "init.defaultBranch=main", "init", "-q")
            git(main, "commit", "-q", "--allow-empty", "-m", "init")
            worktree = root / "linked"
            git(main, "worktree", "add", "-q", "-b", "linked", str(worktree))
            stray = worktree / ".memory"
            stray.mkdir()
            git(stray, "init", "-q")
            outside = root / "not-a-repository"
            outside.mkdir()
            # Main checkout inside a .memory tree, worktree outside it.
            nested_main = root / "holder" / ".memory" / "repository"
            nested_main.mkdir(parents=True)
            git(nested_main, "init", "-q")
            git(nested_main, "commit", "-q", "--allow-empty", "-m", "init")
            nested_worktree = root / "nested-linked"
            git(nested_main, "worktree", "add", "-q", "-b", "nested", str(nested_worktree))

            for cwd in (main, main / "sub", worktree, stray, outside, nested_worktree):
                claude = subprocess.run(
                    [node, "-e", "process.stdout.write(require(process.argv[1]).getProjectMemoryDir())",
                     str(claude_resolver)],
                    cwd=cwd, env=env, check=True, capture_output=True, text=True,
                ).stdout
                codex = hook.get_project_memory_root(str(cwd))
                self.assertEqual(Path(claude).resolve(), codex.resolve(), cwd)


if __name__ == "__main__":
    unittest.main()
