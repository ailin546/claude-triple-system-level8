import importlib.util
import json
from pathlib import Path
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
            skill_source = repository / "shared" / "skills" / "triage"
            agents_output = repository / "adapter" / "AGENTS.md"
            hook_output = repository / "adapter" / "hook.py"
            skill_output = repository / "adapter" / "skills" / "triage"
            agents_source.parent.mkdir(parents=True)
            skill_source.mkdir(parents=True)
            agents_output.parent.mkdir(parents=True)
            skill_output.mkdir(parents=True)
            agents_source.write_text("canonical agents\n", encoding="utf-8")
            hook_source.write_text("canonical hook\n", encoding="utf-8")
            (skill_source / "SKILL.md").write_text("canonical skill\n", encoding="utf-8")
            agents_output.write_text("stale\n", encoding="utf-8")
            hook_output.write_text("stale\n", encoding="utf-8")
            (skill_output / "SKILL.md").write_text("stale\n", encoding="utf-8")
            manifest = {
                "codex": {
                    "agents_source": "shared/AGENTS.md",
                    "agents_output": "adapter/AGENTS.md",
                    "hook_source": "shared/hook.py",
                    "hook_output": "adapter/hook.py",
                    "skills_source_root": "shared/skills",
                    "skills_output_root": "adapter/skills",
                },
                "capabilities": [{"codex_skill": "triage"}],
            }

            stale = SYNC.sync_codex_outputs(repository, manifest, check_only=True)
            synced = SYNC.sync_codex_outputs(repository, manifest, check_only=False)

            self.assertEqual(len(stale), 3)
            self.assertEqual(synced, [])
            self.assertEqual(
                agents_output.read_text(encoding="utf-8"),
                SYNC.GENERATED_NOTICE + "canonical agents\n",
            )
            self.assertEqual(hook_output.read_text(encoding="utf-8"), "canonical hook\n")
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


if __name__ == "__main__":
    unittest.main()
