# 多 Worktree / Sub-agent Git 隔离 — 全文

> 2026-09-13 从 `~/.claude/CLAUDE.md` 迁入（Rule 0：CLAUDE.md 只留规则，长文一个家）。CLAUDE.md §多 Worktree / Sub-agent Git 隔离 是入口。

## 多 Worktree / Sub-agent Git 隔离（强制）

> 2026-05-05 事故触发：Wave 13 P0 commit 时，spawn 的后台 Reality Checker agent 在共享 worktree 内跑 `git stash` + `cargo test` + `git stash pop` 验证 baseline 行为；pop 只恢复 working tree 没恢复 index → 主 session `git commit` 时只 staged 了 5 docs，16 个 code 文件丢失，靠 `git commit --amend` 修回（24117ca）。

### 铁律 1: Sub-agent 在共享 worktree 内禁止改 git 状态

后台 agent（`Agent` tool spawn 的子任务）在与主 session **共享 git working tree** 时，**禁止**做修改 git index / working tree 的操作：

| ❌ 禁止 | 原因 |
|--------|------|
| `git stash` / `git stash pop` / `git stash drop` | stash 是 "save working tree+index, then clear them" 的复合操作；pop 不保证还原 index 状态 → 主 session staging 被吞 |
| `git checkout <ref>` / `git switch` 切换分支或 detach | 改 HEAD + working tree → 主 session 编辑被覆盖 |
| `git reset` / `git reset --hard` / `git restore` | 显式改 index 或 working tree |
| `git add` / `git rm` / `git mv` | 改 index — 主 session 的 staging 决策被对抗 |
| `git revert` / `git cherry-pick` / `git rebase` / `git merge` | 创建新 commit / 改 working tree |
| `git clean` | 删 untracked 文件（可能是主 session 临时工作） |
| `git commit` | 创建 commit，可能影响主 session 的提交计划 |

### 铁律 2: 只允许 read-only git 操作

| ✅ 允许 | 用途 |
|-------|------|
| `git log` / `git show` / `git diff` (含 cached/HEAD/staged 各种) | 看历史 |
| `git status` | 看状态（不修改） |
| `git rev-parse` / `git cat-file` / `git ls-files` / `git ls-tree` | 解析对象 |
| `git blame` / `git annotate` | 看作者 |
| `git config --get` (read-only) | 读配置 |
| `git fetch`（仅在远端独立时）| 拉远端不动本地 working tree（**慎**：会动 refs/remotes/） |

### 铁律 3: 需要 baseline 对比时用 worktree 隔离

如果 sub-agent 必须在另一 ref 上跑测试（baseline diff、bisect-style 验证）：

```rust
Agent tool 调用必须传:
{
    "isolation": "worktree",
    "subagent_type": "...",
    ...
}
```

`isolation: "worktree"` 会自动 `git worktree add` 一个独立目录给 agent，agent 在那个 worktree 内任意改 git 状态都不影响主 session。结束时如果 agent 没改东西自动清理；改了的话 agent 完成时返回 worktree path 让用户决定。

### 铁律 4: 主 session 的 prompt 必须显式声明对 sub-agent 的限制

spawn 修改类 agent 时（包括 codex review、reality checker、code-reviewer 等），prompt 末尾**必须**包含：

```
约束：你在主 session 共享的 git worktree 内运行。禁止 `git stash` /
`git checkout <ref>` / `git reset` / `git restore` / `git add` / `git rm`
/ `git commit` 等修改 index/working-tree 的操作 — 主 session 可能正在
staging 文件，你的 stash/reset 会吞掉主 session 的 commit。
只允许 read-only：`git log` / `git show` / `git diff` / `git status` /
`git rev-parse`。需要 baseline 对比时报告 "需要 isolation worktree"。
```

### 多 Claude session 并行跑实例（worktree 配置）

> 项目级具体配置见对应 worktree 的 `SESSION2.md`（如 `~/quant-deploy-s2/SESSION2.md`）。

并行 session 跑实例（master+worker 之类长 process）必须用 git worktree 隔离 + 端口/PID/log/DB 全套独立：

```bash
# session 1 在 ~/quant-deploy main branch
# session 2 加在同级目录，独立 branch
git worktree add ~/<project>-s2 -b dev/session-2

# 各自端口偏移 + worker_id 不同 + 独立 cchft.db (相对路径自动隔离)
# 详见对应 SESSION2.md
```

**资源冲突清单**（同一项目两 worktree）：
- ✅ 自动隔离：working tree、index、cchft.db（相对路径）、journals、`.logs/`、`.pids/`、target/、node_modules/
- 🟡 需要手动配置：master/ws 端口、worker metrics 9090（hardcode follow-up）、web vite 5173、worker_id（避 master 看到两同名 worker 互踢）、testnet exchange API listenKey（同 account 后到先得）
- 🔴 全局共享（注意互踩）：`~/.cchft-secret`（密码同享 OK）、`~/.claude/state/evaluation-gate/last-pass.json`（多 session evaluation-loop 互踩；hook 按 `git_head` pin 部分缓解）、`~/.memory/`（hook 自动写，多 session 同写一个 today.md 行交错）

