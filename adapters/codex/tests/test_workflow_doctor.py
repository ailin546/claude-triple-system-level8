import importlib.util
from pathlib import Path
import shlex
import tempfile
import unittest


DOCTOR_PATH = Path(__file__).resolve().parents[1] / "scripts" / "workflow-doctor.py"
SPEC = importlib.util.spec_from_file_location("workflow_doctor", DOCTOR_PATH)
DOCTOR = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(DOCTOR)


class WorkflowDoctorTests(unittest.TestCase):
    def test_managed_hook_command_quotes_paths_with_spaces(self):
        script = Path("/tmp/codex home/scripts/codex-global-hook.py")

        self.assertEqual(
            DOCTOR.managed_hook_command(script),
            f"python3 {shlex.quote(str(script.resolve()))}",
        )

    def test_optional_project_overlay_is_healthy_when_absent(self):
        with tempfile.TemporaryDirectory() as temporary_root:
            project = Path(temporary_root)

            self.assertEqual(DOCTOR.project_overlay_detail(project), "optional overlay not used")

    def test_old_project_codex_handoff_is_not_checked(self):
        with tempfile.TemporaryDirectory() as temporary_root:
            project = Path(temporary_root)
            (project / ".codex").mkdir()
            (project / ".codex" / "handoff.md").write_text("legacy", encoding="utf-8")

            self.assertEqual(DOCTOR.project_overlay_detail(project), "optional overlay not used")

    def test_user_managed_agents_skills_is_not_a_warning_without_active_reference(self):
        with tempfile.TemporaryDirectory() as temporary_root:
            home = Path(temporary_root)
            codex_home = home / ".codex"
            (home / ".agents" / "skills").mkdir(parents=True)
            codex_home.mkdir()

            findings, detail = DOCTOR.legacy_findings(codex_home, home)

            self.assertEqual(findings, [])
            self.assertIn("user-managed, unreferenced", detail)

    def test_doctor_skill_documentation_does_not_make_user_skills_active(self):
        with tempfile.TemporaryDirectory() as temporary_root:
            home = Path(temporary_root)
            codex_home = home / ".codex"
            doctor_skill = codex_home / "skills" / "workflow-doctor" / "SKILL.md"
            doctor_skill.parent.mkdir(parents=True)
            doctor_skill.write_text("检查 ~/.agents/skills/", encoding="utf-8")
            (home / ".agents" / "skills").mkdir(parents=True)

            findings, _ = DOCTOR.legacy_findings(codex_home, home)

            self.assertEqual(findings, [])

    def test_nonempty_legacy_memory_is_reported_for_migration(self):
        with tempfile.TemporaryDirectory() as temporary_root:
            home = Path(temporary_root)
            codex_home = home / ".codex"
            legacy = codex_home / "memories" / "today.md"
            legacy.parent.mkdir(parents=True)
            legacy.write_text("legacy", encoding="utf-8")

            findings, _ = DOCTOR.legacy_findings(codex_home, home)

            self.assertEqual(len(findings), 1)
            self.assertIn("memory remains unmerged", findings[0])


if __name__ == "__main__":
    unittest.main()
