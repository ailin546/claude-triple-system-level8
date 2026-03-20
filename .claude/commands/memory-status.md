# /memory-status — 双轨记忆状态

查看系统记忆和项目记忆的完整状态。

## 执行步骤

1. **系统记忆** (`~/.claude/`):
   - 列出 `~/.claude/homunculus/instincts/personal/` 中的全局本能文件数量
   - 列出 `~/.claude/homunculus/instincts/inherited/` 中的继承本能文件数量
   - 读取 `~/.claude/homunculus/promote-log.jsonl` 最近 5 条晋升记录

2. **项目记忆** (`.claude/memory/`):
   - **短期**: 列出最近的 session 文件 (`~/.claude/sessions/`)
   - **中期**: 读取当前 sprint 文件 (`sprint-YYYY-WNN.md`)，统计各 section 的条目数
   - **长期**: 读取 `long-term.md`，统计各 section 的条目数

3. **沉淀状态**:
   - 检查 `.claude/memory/.consolidate-lock` 的最后运行时间
   - 统计有多少过期但未沉淀的 sprint 文件

4. **晋升候选**:
   - 运行 `python3 .claude/skills/ecc-continuous-learning-v2/scripts/instinct-cli.py promote --dry-run --force` 检查候选数量

以表格格式展示所有统计信息。
