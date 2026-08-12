#!/usr/bin/env python3
import json
import os
import re
import sys
from pathlib import Path


DEFAULT_MEMORY_FILES = ("long-term.md", "weekly.md", "today.md")
DEFAULT_MEMORY_EXCERPT_BYTES = 2048


HIGH_RISK_PATTERNS = [
    r"\bauth\b",
    r"\bpermission\b",
    r"\bpayment\b",
    r"\bdeploy\b",
    r"\bmigration\b",
    r"\bschema\b",
    r"\bsecurity\b",
    r"\bincident\b",
    r"\brollback\b",
]

BROWNFIELD_SIGNALS = (
    "接入",
    "新增市场",
    "新市场",
    "新增交易所",
    "兼容",
    "复用",
    "完整方案",
    "聚合下单",
    "聚合交易",
    "integrate",
    "integration",
    "compatibility",
    "reuse",
    "add market",
)
DIRECT_EXECUTION_SIGNALS = ("直接做", "不用问", "skip clarify", "no clarify")
FAST_SMALL_TASK_SIGNALS = (
    "typo",
    "错别字",
    "拼写",
    "readme",
    "单行",
    "小修",
    "注释",
    "文案",
)


def read_payload():
    raw = sys.stdin.read().strip()
    if not raw:
        return {}
    try:
        return json.loads(raw)
    except Exception as exc:
        return {
            "__parse_error__": str(exc),
            "__raw__": raw,
        }


def safe_str(value):
    return value if isinstance(value, str) else ""


def detect_event(payload):
    for key in ("hook_event_name", "hookEventName", "event", "name"):
        value = safe_str(payload.get(key)).strip()
        if value:
            return value
    return "Unknown"


def detect_prompt(payload):
    for key in ("prompt", "user_prompt", "userPrompt"):
        value = safe_str(payload.get(key)).strip()
        if value:
            return value
    return ""


def get_cwd(payload):
    cwd = safe_str(payload.get("cwd")).strip()
    return cwd or os.getcwd()


def get_global_memory_root():
    configured = os.environ.get("AGENT_MEMORY_HOME", "").strip()
    if configured:
        return Path(configured).expanduser()
    return Path.home() / ".memory"


def read_memory_excerpt(memory_file, max_bytes=DEFAULT_MEMORY_EXCERPT_BYTES):
    try:
        raw = memory_file.read_bytes()
    except (FileNotFoundError, IsADirectoryError, PermissionError, OSError):
        return ""

    if not raw.strip():
        return ""
    if len(raw) <= max_bytes:
        selected = raw
    else:
        half = max_bytes // 2
        selected = raw[:half] + b"\n... [memory excerpt truncated] ...\n" + raw[-half:]
    return selected.decode("utf-8", errors="replace").strip()


def build_shared_memory_context(cwd):
    roots = [
        ("global", get_global_memory_root(), ("long-term.md", "today.md")),
        ("project", Path(cwd) / ".memory", DEFAULT_MEMORY_FILES),
    ]
    sections = []
    for scope, memory_root, filenames in roots:
        for filename in filenames:
            excerpt = read_memory_excerpt(memory_root / filename)
            if excerpt:
                sections.append(f"[{scope} memory: {memory_root / filename}]\n{excerpt}")
    if not sections:
        return ""
    return "共享记忆已加载（只作上下文，显式用户指令和项目规则优先）：\n" + "\n\n".join(sections)


def detect_project_profile(cwd):
    root = Path(cwd)
    has_celue = (root / "celue").exists() or (root / "celue-main" / "Cargo.toml").is_file()
    has_monitor = (root / "cchft-monitor" / "Cargo.toml").exists()
    has_wikimind = (root / "wikimind" / "README.md").exists()
    has_frontend = any(
        candidate.is_file()
        for candidate in (
            root / "web" / "package.json",
            root / "celue" / "web" / "package.json",
            root / "celue-main" / "web" / "package.json",
        )
    )
    has_rust_workspace = any(
        candidate.is_file()
        for candidate in (
            root / "Cargo.toml",
            root / "quant_base-main" / "Cargo.toml",
            root / "celue-main" / "Cargo.toml",
            root / "celue" / "Cargo.toml",
            root / "cchft-monitor" / "Cargo.toml",
        )
    )
    has_knowledge_vault = (root / "wikimind" / "vaults").exists()

    if has_celue and has_monitor and has_wikimind:
        return "multi-project-ai-workspace"
    if has_rust_workspace and has_frontend:
        return "rust-platform-with-web"
    if has_monitor and not has_celue:
        return "rust-service"
    if has_knowledge_vault:
        return "knowledge-compiler"
    if has_rust_workspace:
        return "rust-workspace"
    if has_frontend:
        return "frontend-app"
    return "generic"


def build_profile_hint(profile):
    if profile == "multi-project-ai-workspace":
        return "工作区画像：多项目根目录。先确认目标子系统，再选择匹配的工作流和验证路径。"
    if profile == "rust-platform-with-web":
        return "工作区画像：Rust 平台 + Web 控制台。后端优先做 crate 级验证，前端优先做 npm lint/build。"
    if profile == "rust-service":
        return "工作区画像：Rust 服务。优先运行 cargo check/test，大改前先检查运行时和配置文档。"
    if profile == "knowledge-compiler":
        return "工作区画像：知识编译器。优先关注 schema 一致性、链接、索引和内容结构，而不是重构建流程。"
    if profile == "rust-workspace":
        return "工作区画像：Rust workspace。能做局部 crate 验证时，优先避免全 workspace 重建。"
    if profile == "frontend-app":
        return "工作区画像：前端应用。优先用 lint/build 验证，并保持改动符合现有 UI 语言。"
    return "工作区画像：通用项目。按任务大小和风险选择执行路线。"


def session_start_output(cwd):
    profile = detect_project_profile(cwd)
    lines = [
        "全局工作流已加载：默认按 Fast / Standard / Heavy 分级路由。",
        "较复杂任务使用 $plan-execute；宣布完成前使用 $verification-gate 思维；长任务使用 $handoff-memory 保留交接。",
        build_profile_hint(profile),
    ]
    project_context = Path(cwd) / ".codex" / "project-context.md"
    shared_handoff = Path(cwd) / ".memory" / "handoff.md"
    if project_context.exists():
        lines.append(f"Project context available at {project_context}.")
    if shared_handoff.exists():
        lines.append(f"Shared handoff context available at {shared_handoff}.")
    memory_context = build_shared_memory_context(cwd)
    if memory_context:
        lines.append(memory_context)
    return {
        "hookSpecificOutput": {
            "hookEventName": "SessionStart",
            "additionalContext": "\n".join(lines),
        }
    }


def has_brownfield_requirement_signal(lowered_prompt):
    if any(signal in lowered_prompt for signal in BROWNFIELD_SIGNALS):
        return True
    patterns = (
        r"(?:新增|增加|添加).{0,10}(?:市场|交易所|链|策略|协议|接口|执行)",
        r"支持.{0,10}(?:市场|交易所|链|策略|协议|接口|现有程序|现有系统)",
        r"(?:方案|系统).{0,12}(?:完整|完成)",
        r"(?:完整|完成).{0,12}(?:方案|系统)",
        r"add.{0,10}(?:market|exchange|chain|strategy|protocol)",
    )
    return any(re.search(pattern, lowered_prompt) for pattern in patterns)


def is_explicit_fast_small_task(lowered_prompt):
    direct = any(signal in lowered_prompt for signal in DIRECT_EXECUTION_SIGNALS)
    small = any(signal in lowered_prompt for signal in FAST_SMALL_TASK_SIGNALS)
    expansion = any(
        signal in lowered_prompt
        for signal in (
            "接入",
            "新增市场",
            "新市场",
            "新增交易所",
            "聚合下单",
            "聚合交易",
            "完整方案",
            "integrate",
            "integration",
            "add market",
        )
    )
    return direct and small and not expansion and len(lowered_prompt) <= 160


def user_prompt_submit_output(payload, cwd):
    prompt = detect_prompt(payload)
    profile = detect_project_profile(cwd)

    if not prompt:
        return {
            "hookSpecificOutput": {
                "hookEventName": "UserPromptSubmit",
                "additionalContext": build_profile_hint(profile),
            }
        }

    lowered = prompt.lower()
    risk_matches = [pat for pat in HIGH_RISK_PATTERNS if re.search(pat, lowered)]
    multi_step = any(token in lowered for token in ["plan", "refactor", "workflow", "system", "architecture"]) or len(prompt) > 180
    explicit_fast_small = is_explicit_fast_small_task(lowered)
    doctor_request = any(token in lowered for token in [
        "doctor",
        "诊断",
        "检查安装",
        "workflow-doctor",
        "安装是否",
        "评估现有系统流程",
        "评估现有工作流",
        "系统流程是否",
        "工作流是否",
        "流程是否完整",
        "流程是否正常",
    ])
    review_request = any(token in lowered for token in [
        "review",
        "code review",
        "审查",
        "检查diff",
        "合并前",
        "pre-merge",
    ])
    iterative_improve = any(token in lowered for token in [
        "autoresearch",
        "自动研究",
        "迭代",
        "指标",
        "覆盖率",
        "coverage",
        "测试失败",
        "failing test",
        "test failure",
        "lint",
        "typecheck",
        "性能",
        "benchmark",
        "quality gate",
        "质量门",
        "逐步优化",
    ]) and not any(token in lowered for token in ["不要迭代", "no autoresearch", "no iterate"])
    brownfield_request = has_brownfield_requirement_signal(lowered) and not explicit_fast_small
    ambiguous = any(token in lowered for token in [
        "帮我设计",
        "怎么做",
        "方案",
        "规划",
        "系统",
        "工作流",
        "重构",
        "优化",
        "architecture",
        "workflow",
        "design",
        "plan",
    ]) and not explicit_fast_small

    if not risk_matches and not multi_step and not ambiguous and not brownfield_request and not review_request and not doctor_request and not iterative_improve:
        if profile in {"multi-project-ai-workspace", "knowledge-compiler", "rust-platform-with-web"}:
            return {
                "hookSpecificOutput": {
                    "hookEventName": "UserPromptSubmit",
                    "additionalContext": build_profile_hint(profile),
                }
            }
        return None

    parts = [build_profile_hint(profile)]
    if risk_matches:
        parts.append("检测到高风险信号；按 Heavy 模式思考，并明确验证路径。")

    # Primary workflow intents are mutually exclusive. Diagnostics, review, and
    # measurable iteration already have a bounded workflow and must not be
    # inflated by generic words such as “系统”, “工作流”, or “优化”.
    if doctor_request:
        parts.append("检测到工作流安装/诊断意图；优先使用 $workflow-doctor。")
        return {
            "hookSpecificOutput": {
                "hookEventName": "UserPromptSubmit",
                "additionalContext": " ".join(parts),
            }
        }
    if review_request:
        parts.append("检测到代码审查意图；优先使用 $code-review-gate，并给出严重级别和验证证据。")
        return {
            "hookSpecificOutput": {
                "hookEventName": "UserPromptSubmit",
                "additionalContext": " ".join(parts),
            }
        }
    if iterative_improve:
        parts.append("检测到可度量改进/迭代优化意图；若有基线、验证命令和守护命令，可使用 $autoresearch-lite。")
        return {
            "hookSpecificOutput": {
                "hookEventName": "UserPromptSubmit",
                "additionalContext": " ".join(parts),
            }
        }
    if brownfield_request:
        parts.append(
            "检测到 Brownfield 接入/扩展信号；在判断完整性或实施前先使用 "
            "$clarify-scope，查代码、文档和近期改动，并输出 Existing Capability Map、"
            "Required Delta、Non-goals、Acceptance Checks 和 Change Budget。区分代码库事实"
            "与用户决策；Hook 只提醒，不代替用户确认。"
        )
        return {
            "hookSpecificOutput": {
                "hookEventName": "UserPromptSubmit",
                "additionalContext": " ".join(parts),
            }
        }
    if ambiguous:
        parts.append("检测到需求边界不清；实现前优先使用 $clarify-scope。")
    elif multi_step:
        parts.append("任务看起来较复杂；大改前优先使用 $system-triage 或 $plan-execute。")

    return {
        "hookSpecificOutput": {
            "hookEventName": "UserPromptSubmit",
            "additionalContext": " ".join(parts),
        }
    }


def pre_tool_use_output(payload):
    command = safe_str(payload.get("command") or payload.get("tool_input") or payload.get("input")).strip()
    if not command:
        return None

    destructive = any(token in command for token in ["rm -rf", "git reset --hard", "DROP TABLE", "shutdown", "reboot"])
    if not destructive:
        return None

    return {
        "hookSpecificOutput": {
            "hookEventName": "PreToolUse",
            "additionalContext": "检测到潜在破坏性命令。执行前请重新确认范围、目标路径和回滚影响。",
        },
        "systemMessage": "检测到潜在破坏性命令。请先确认目标和影响范围。",
    }


def post_tool_use_output(payload):
    stderr_text = safe_str(payload.get("stderr") or payload.get("stderr_text") or payload.get("tool_stderr"))
    stdout_text = safe_str(payload.get("stdout") or payload.get("stdout_text") or payload.get("tool_stdout"))
    combined = (stderr_text + "\n" + stdout_text).strip().lower()
    exit_code = payload.get("exit_code", payload.get("exitCode"))

    if isinstance(exit_code, int) and exit_code != 0 and combined:
        return {
            "hookSpecificOutput": {
                "hookEventName": "PostToolUse",
                "additionalContext": "先审查命令输出，提取真实失败原因，再决定重试、修补还是改变方案。",
            },
        }
    return None


def stop_output(payload, cwd):
    message = (
        "离开中大型任务前，请把高价值交接写入 PROJECT/.memory/handoff.md，"
        "把决策、约束和教训追加到 PROJECT/.memory/today.md；"
        "跨项目信息写入 ~/.memory/。不要记录流水账。"
    )
    return {
        "hookSpecificOutput": {
            "hookEventName": "Stop",
            "additionalContext": message,
        }
    }


def main():
    payload = read_payload()
    if "__parse_error__" in payload:
        print(json.dumps({
            "hookSpecificOutput": {
                "hookEventName": "Unknown",
                "additionalContext": f"Global hook received malformed JSON: {payload['__parse_error__']}",
            }
        }))
        return

    event = detect_event(payload)
    cwd = get_cwd(payload)

    if event == "SessionStart":
        output = session_start_output(cwd)
    elif event == "UserPromptSubmit":
        output = user_prompt_submit_output(payload, cwd)
    elif event == "PreToolUse":
        output = pre_tool_use_output(payload)
    elif event == "PostToolUse":
        output = post_tool_use_output(payload)
    elif event == "Stop":
        output = stop_output(payload, cwd)
    else:
        output = None

    if output:
        print(json.dumps(output, ensure_ascii=False))


if __name__ == "__main__":
    main()
