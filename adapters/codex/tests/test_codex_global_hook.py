import importlib.util
import os
from pathlib import Path
import tempfile
import unittest
from unittest import mock


HOOK_PATH = Path(__file__).resolve().parents[1] / "scripts" / "codex-global-hook.py"
SPEC = importlib.util.spec_from_file_location("codex_global_hook", HOOK_PATH)
HOOK = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(HOOK)


class SharedMemoryHookTests(unittest.TestCase):
    def test_session_start_loads_global_and_project_memory(self):
        with tempfile.TemporaryDirectory() as temporary_root:
            root = Path(temporary_root)
            global_memory = root / "global-memory"
            project = root / "project"
            global_memory.mkdir()
            (project / ".memory").mkdir(parents=True)
            (global_memory / "long-term.md").write_text("global decision", encoding="utf-8")
            (global_memory / "today.md").write_text("global today", encoding="utf-8")
            (project / ".memory" / "weekly.md").write_text("project weekly", encoding="utf-8")

            with mock.patch.dict(os.environ, {"AGENT_MEMORY_HOME": str(global_memory)}):
                output = HOOK.session_start_output(str(project))

            context = output["hookSpecificOutput"]["additionalContext"]
            self.assertIn("global decision", context)
            self.assertIn("global today", context)
            self.assertIn("project weekly", context)

    def test_session_start_prefers_shared_handoff(self):
        with tempfile.TemporaryDirectory() as temporary_root:
            project = Path(temporary_root)
            (project / ".memory").mkdir()
            (project / ".codex").mkdir()
            (project / ".memory" / "handoff.md").write_text("shared", encoding="utf-8")
            (project / ".codex" / "handoff.md").write_text("legacy", encoding="utf-8")

            output = HOOK.session_start_output(str(project))

            context = output["hookSpecificOutput"]["additionalContext"]
            self.assertIn("Shared handoff context", context)
            self.assertNotIn("Legacy Codex handoff context", context)

    def test_session_start_ignores_legacy_codex_handoff(self):
        with tempfile.TemporaryDirectory() as temporary_root:
            project = Path(temporary_root)
            (project / ".codex").mkdir()
            (project / ".codex" / "handoff.md").write_text("legacy", encoding="utf-8")

            output = HOOK.session_start_output(str(project))

            context = output["hookSpecificOutput"]["additionalContext"]
            self.assertNotIn("Legacy Codex handoff", context)

    def test_memory_excerpt_is_bounded_and_keeps_both_ends(self):
        with tempfile.TemporaryDirectory() as temporary_root:
            memory_file = Path(temporary_root) / "memory.md"
            memory_file.write_text("A" * 200 + "B" * 200, encoding="utf-8")

            excerpt = HOOK.read_memory_excerpt(memory_file, max_bytes=100)

            self.assertTrue(excerpt.startswith("A" * 50))
            self.assertTrue(excerpt.endswith("B" * 50))
            self.assertIn("truncated", excerpt)

    def test_session_start_does_not_create_memory_files(self):
        with tempfile.TemporaryDirectory() as temporary_root:
            project = Path(temporary_root) / "project"
            project.mkdir()
            global_memory = Path(temporary_root) / "missing-global-memory"

            with mock.patch.dict(os.environ, {"AGENT_MEMORY_HOME": str(global_memory)}):
                HOOK.session_start_output(str(project))

            self.assertFalse(global_memory.exists())
            self.assertFalse((project / ".memory").exists())


class RequirementConfirmationHookTests(unittest.TestCase):
    def additional_context(self, prompt: str, cwd: str) -> str:
        output = HOOK.user_prompt_submit_output({"prompt": prompt}, cwd)
        if output is None:
            return ""
        return output["hookSpecificOutput"]["additionalContext"]

    def test_original_solana_completion_request_triggers_requirement_gate(self):
        prompt = "检查本地深度计算+binance钱包聚合交易sol链方案是否完整完成了"

        output = HOOK.user_prompt_submit_output({"prompt": prompt}, "/tmp")
        self.assertIsNotNone(output)
        context = output["hookSpecificOutput"]["additionalContext"]

        self.assertIn("Brownfield", context)
        self.assertIn("Existing Capability Map", context)
        self.assertIn("Required Delta", context)
        self.assertIn("Non-goals", context)
        self.assertIn("Change Budget", context)
        self.assertNotIn("decision", output)
        self.assertNotIn("systemMessage", output)

    def test_quant_deploy_layout_is_rust_platform_with_web(self):
        with tempfile.TemporaryDirectory() as temporary_root:
            project = Path(temporary_root)
            (project / "quant_base-main").mkdir()
            (project / "quant_base-main" / "Cargo.toml").write_text(
                "[workspace]\n", encoding="utf-8"
            )
            (project / "web").mkdir()
            (project / "web" / "package.json").write_text("{}\n", encoding="utf-8")

            profile = HOOK.detect_project_profile(str(project))

            self.assertEqual(profile, "rust-platform-with-web")

    def test_readme_typo_does_not_trigger_requirement_gate(self):
        context = self.additional_context("修正 README 一个 typo", "/tmp")

        self.assertNotIn("Brownfield", context)
        self.assertNotIn("clarify-scope", context)
        self.assertNotIn("Change Budget", context)

    def test_explicit_direct_low_risk_task_skips_clarification(self):
        context = self.additional_context("直接做：修正现有策略 README 的一个 typo", "/tmp")

        self.assertNotIn("Brownfield", context)
        self.assertNotIn("clarify-scope", context)
        self.assertNotIn("Change Budget", context)

    def test_ambiguous_new_market_requires_existing_capability_map(self):
        prompt = "给现有策略新增一个 Solana 市场支持，做一个完整方案"

        context = self.additional_context(prompt, "/tmp")

        self.assertIn("Existing Capability Map", context)
        self.assertIn("Required Delta", context)
        self.assertIn("Change Budget", context)

    def test_failed_command_hook_reminds_without_blocking(self):
        output = HOOK.post_tool_use_output(
            {"exit_code": 1, "stderr": "command failed"}
        )

        self.assertIsNotNone(output)
        self.assertIn("先审查命令输出", output["hookSpecificOutput"]["additionalContext"])
        self.assertNotIn("decision", output)
        self.assertNotIn("reason", output)


if __name__ == "__main__":
    unittest.main()
