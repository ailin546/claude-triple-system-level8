# Codex Adapter

此目录把主仓库中的工作流接入 Codex，同时保持现有 Claude Code 工作流不变。

Claude 八阶段流程在 Codex 中的原生映射、三档路径和显式调用方式见
[`docs/CODEX_USAGE.md`](../../docs/CODEX_USAGE.md)。安装后也可从
`~/.codex/workflow-docs/CODEX_USAGE.md` 阅读。

## 安装

```bash
bash adapters/codex/install.sh
```

只检查，不写入：

```bash
bash adapters/codex/install.sh --check
```

预览管理范围：

```bash
bash adapters/codex/install.sh --dry-run
```

安装器只管理 `CODEX_HOME` 下的全局 AGENTS、八个工作流 Skill、Codex Hook
脚本及其配置条目。它不会读取或修改 `~/.claude`。

`adapters/codex/AGENTS.md`、Hook 和八个 Skill 是生成产物。维护时修改
`shared/workflow/adapters/codex/`，然后在仓库根目录运行：

```bash
python3 scripts/sync_workflow.py
python3 scripts/sync_workflow.py --check
```

安装器需要 Python 3.11+ 的 `tomllib`，或 Python 3.9/3.10 环境中的 `tomli`。
如果当前解释器没有解析器，它会尝试调用本机 Python 3.11+；仍不可用时会在写入
任何文件前停止，而不是跳过 TOML 校验。

## 共享记忆

Codex 启动 Hook 只读加载：

- `~/.memory/long-term.md`
- `~/.memory/today.md`
- `PROJECT/.memory/long-term.md`
- `PROJECT/.memory/weekly.md`
- `PROJECT/.memory/today.md`

写入由 `handoff-memory` 工作流按需完成。Codex 默认不自动写入，避免与 Claude
的自动沉淀链路并发修改同一个文件；这是长期并发边界，不是独立记忆来源。

旧的 `~/.codex/memories/` 不删除、不覆盖，也不再作为新记忆的写入目标。
