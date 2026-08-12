import contextlib
import importlib.util
import io
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest import mock


ADAPTER_ROOT = Path(__file__).resolve().parents[1]
INSTALLER = ADAPTER_ROOT / "scripts" / "install_codex.py"
INSTALLER_SPEC = importlib.util.spec_from_file_location("install_codex", INSTALLER)
INSTALLER_MODULE = importlib.util.module_from_spec(INSTALLER_SPEC)
assert INSTALLER_SPEC.loader is not None
INSTALLER_SPEC.loader.exec_module(INSTALLER_MODULE)


class CodexInstallerTests(unittest.TestCase):
    def run_installer(self, codex_home: Path, home: Path, *arguments: str):
        environment = os.environ.copy()
        environment["HOME"] = str(home)
        return subprocess.run(
            [sys.executable, str(INSTALLER), "--codex-home", str(codex_home), *arguments],
            check=False,
            capture_output=True,
            text=True,
            env=environment,
        )

    def test_install_is_idempotent_and_does_not_touch_claude(self):
        with tempfile.TemporaryDirectory() as temporary_root:
            home = Path(temporary_root)
            codex_home = home / ".codex"
            claude_home = home / ".claude"
            claude_home.mkdir()
            sentinel = claude_home / "sentinel.txt"
            sentinel.write_text("preserve-claude", encoding="utf-8")
            codex_home.mkdir()
            (codex_home / "memories").mkdir()
            legacy_memory = codex_home / "memories" / "today.md"
            legacy_memory.write_text("legacy", encoding="utf-8")
            (codex_home / "config.toml").write_text(
                'developer_instructions = "keep my instructions"\nmodel_provider = "custom"\n',
                encoding="utf-8",
            )
            (codex_home / "hooks.json").write_text(
                json.dumps(
                    {
                        "hooks": {
                            "SessionStart": [
                                {
                                    "hooks": [
                                        {"type": "command", "command": "python3 user-owned-hook.py"},
                                        {
                                            "type": "command",
                                            "command": "python3 /custom/codex-global-hook.py",
                                        },
                                    ]
                                }
                            ]
                        }
                    }
                ),
                encoding="utf-8",
            )

            first = self.run_installer(codex_home, home)
            self.assertEqual(first.returncode, 0, first.stdout + first.stderr)
            config_after_first = (codex_home / "config.toml").read_text(encoding="utf-8")
            hooks_after_first = (codex_home / "hooks.json").read_text(encoding="utf-8")

            second = self.run_installer(codex_home, home)
            self.assertEqual(second.returncode, 0, second.stdout + second.stderr)

            self.assertEqual(sentinel.read_text(encoding="utf-8"), "preserve-claude")
            self.assertEqual(legacy_memory.read_text(encoding="utf-8"), "legacy")
            self.assertEqual((codex_home / "config.toml").read_text(encoding="utf-8"), config_after_first)
            self.assertEqual((codex_home / "hooks.json").read_text(encoding="utf-8"), hooks_after_first)
            self.assertIn('model_provider = "custom"', config_after_first)
            self.assertIn("keep my instructions", config_after_first)
            self.assertIn("<!-- unified-workflow:start -->", config_after_first)
            usage_guide = codex_home / "workflow-docs" / "CODEX_USAGE.md"
            self.assertTrue(usage_guide.is_file())
            self.assertTrue((codex_home / "scripts" / "workflow-doctor.py").is_file())
            self.assertIn(
                "Requirement Confirmation（按条件）",
                usage_guide.read_text(encoding="utf-8"),
            )

            hooks = json.loads(hooks_after_first)["hooks"]
            session_entries = hooks["SessionStart"]
            self.assertEqual(
                INSTALLER_MODULE.managed_hook_count(
                    session_entries, codex_home / "scripts" / "codex-global-hook.py"
                ),
                1,
            )
            self.assertTrue(
                any(
                    hook.get("command") == "python3 user-owned-hook.py"
                    for entry in session_entries
                    for hook in entry.get("hooks", [])
                )
            )
            self.assertTrue(
                any(
                    hook.get("command") == "python3 /custom/codex-global-hook.py"
                    for entry in session_entries
                    for hook in entry.get("hooks", [])
                )
            )

            check = self.run_installer(codex_home, home, "--check")
            self.assertEqual(check.returncode, 0, check.stdout + check.stderr)

    def test_invalid_hooks_fail_closed_before_writing(self):
        with tempfile.TemporaryDirectory() as temporary_root:
            home = Path(temporary_root)
            codex_home = home / ".codex"
            codex_home.mkdir()
            agents = codex_home / "AGENTS.md"
            hooks = codex_home / "hooks.json"
            agents.write_text("user agents", encoding="utf-8")
            hooks.write_text("{not-json", encoding="utf-8")

            result = self.run_installer(codex_home, home)

            self.assertNotEqual(result.returncode, 0)
            self.assertEqual(agents.read_text(encoding="utf-8"), "user agents")
            self.assertEqual(hooks.read_text(encoding="utf-8"), "{not-json")

    def test_invalid_toml_fails_closed_before_writing(self):
        with tempfile.TemporaryDirectory() as temporary_root:
            home = Path(temporary_root)
            codex_home = home / ".codex"
            codex_home.mkdir()
            agents = codex_home / "AGENTS.md"
            config = codex_home / "config.toml"
            agents.write_text("user agents", encoding="utf-8")
            config.write_text("broken = [\n", encoding="utf-8")

            result = self.run_installer(codex_home, home)

            self.assertNotEqual(result.returncode, 0)
            self.assertEqual(agents.read_text(encoding="utf-8"), "user agents")
            self.assertEqual(config.read_text(encoding="utf-8"), "broken = [\n")

    def test_valid_toml_datetime_is_accepted(self):
        INSTALLER_MODULE.validate_toml("updated_at = 1979-05-27T07:32:00Z\n")

    def test_non_list_hook_event_fails_closed_before_writing(self):
        with tempfile.TemporaryDirectory() as temporary_root:
            home = Path(temporary_root)
            codex_home = home / ".codex"
            codex_home.mkdir()
            hooks = codex_home / "hooks.json"
            original = '{"hooks": {"SessionStart": {"owner": "user"}}}\n'
            hooks.write_text(original, encoding="utf-8")

            result = self.run_installer(codex_home, home)

            self.assertNotEqual(result.returncode, 0)
            self.assertEqual(hooks.read_text(encoding="utf-8"), original)

    def test_managed_hook_detection_uses_exact_target_path(self):
        target = Path("/tmp/codex/scripts/codex-global-hook.py")
        managed = {
            "type": "command",
            "command": INSTALLER_MODULE.managed_hook_command(target),
        }
        same_basename = {
            "type": "command",
            "command": "python3 /custom/codex-global-hook.py",
        }

        self.assertTrue(INSTALLER_MODULE.is_managed_hook_command(managed, target))
        self.assertFalse(INSTALLER_MODULE.is_managed_hook_command(same_basename, target))

    def test_mid_install_failure_restores_managed_targets(self):
        with tempfile.TemporaryDirectory() as temporary_root:
            codex_home = Path(temporary_root) / ".codex"
            codex_home.mkdir()
            agents = codex_home / "AGENTS.md"
            config = codex_home / "config.toml"
            hooks = codex_home / "hooks.json"
            agents.write_text("original agents", encoding="utf-8")
            config.write_text('model_provider = "custom"\n', encoding="utf-8")
            hooks.write_text('{"hooks": {}}\n', encoding="utf-8")
            original_copy = INSTALLER_MODULE.atomic_copy_file
            call_count = 0

            def fail_on_second_copy(source, target):
                nonlocal call_count
                call_count += 1
                if call_count == 2:
                    raise OSError("injected install failure")
                return original_copy(source, target)

            with mock.patch.object(
                INSTALLER_MODULE, "atomic_copy_file", side_effect=fail_on_second_copy
            ):
                with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(
                    io.StringIO()
                ):
                    with self.assertRaises(OSError):
                        INSTALLER_MODULE.install(codex_home, dry_run=False)

            self.assertEqual(agents.read_text(encoding="utf-8"), "original agents")
            self.assertEqual(config.read_text(encoding="utf-8"), 'model_provider = "custom"\n')
            self.assertEqual(hooks.read_text(encoding="utf-8"), '{"hooks": {}}\n')
            self.assertFalse((codex_home / "scripts" / "codex-global-hook.py").exists())

    def test_dry_run_writes_nothing(self):
        with tempfile.TemporaryDirectory() as temporary_root:
            home = Path(temporary_root)
            codex_home = home / ".codex"

            result = self.run_installer(codex_home, home, "--dry-run")

            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
            self.assertFalse(codex_home.exists())
            self.assertIn("~/.claude is outside", result.stdout)


if __name__ == "__main__":
    unittest.main()
