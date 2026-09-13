# Cross-Session Doc-vs-Code 配对铁律 — 全文

> 2026-09-13 从 `~/.claude/CLAUDE.md` 迁入（Rule 0）。CLAUDE.md §Cross-Session Doc-vs-Code 配对铁律 是入口。

## Cross-Session Doc-vs-Code 配对铁律（强制）

> 2026-05-20 事故触发：CCHFT 项目 commit `04536bc` (T4 Phase 2-lite, "backup automation" 任务) 通过 `docs/KNOWN_ISSUES.md +30 行`一次性夹带 10+ 条 `⏩ 已修` 声明（M-56 Phase 2 / M-62-M-87），但 commit 本身只交付 backup script，**对应代码改动 0 个落地**。配套 commit `aa6081e` (cross-session continuation) message 暴露根因："另一个会话已经完成，你继续收尾"+ "balance.rs/trade_history.rs 864 LOC dead WIP 被 Reality Check round 1 BLOCKER 拒掉 → unstaged"，但 KNOWN_ISSUES.md 中对应 `⏩ 已修` 标记**没相应回退** → doc 与 code 异步进入 main，10/10 双重 grep 验证 false-positive。
>
> 本铁律是反向力 — 把"声称完成"与"实际落地"硬绑定，防止 multi-session 协作下文档幻觉传播。

### 铁律 1: Multi-session 收尾 commit 必须 doc/code 分离

主 session 接手"另一个会话已完成你继续收尾"类任务时：
- ❌ 禁止一次性 commit 含 KNOWN_ISSUES.md/CHANGELOG.md/FEATURE_STATUS.md 新增"已修/已完成"标记 + 代码改动 + 文档改动混合包
- ✅ 必须拆成两个 commit：
  1. **code-only commit**：实现 + 测试 + 编译通过（pre-commit hook 验证）
  2. **docs-only commit**：标记 `⏩ 已修` / `✅ DONE`，commit body 含 `verified-by: <previous-code-commit-sha>` 字段

### 铁律 2: "声称完成"标记必须有可观察 grep 证据 + commit message 验证字段

新增 `⏩ 已修` / `⏩ 全部已修` / `⏩ 部分修` 到 KNOWN_ISSUES.md，或新增 `✅ DONE` 到 FEATURE_STATUS.md / OPTIMIZATION_BACKLOG.md 时：
- 必须能在 **同 PR 或先前 PR 内** grep 出对应符号 / 函数 / 文件
- commit message 必须含**三选一**字段（项目级 commit-msg hook enforce）：
  - `verified-by: <commit-sha>` — 修复实际所在的 commit
  - `verified-files: <file:line, file:line>` — grep 证据列表
  - `verified-via: <test-name | "retraction">` — CI/test 覆盖 或 状态降级
- 项目级实现参考：`tools/git-hooks/commit-msg`（CCHFT），新项目套用同一脚本

### 铁律 3: cross-session 收尾验证清单

主 session 接手收尾任务前**必须**逐项验证：
1. KNOWN_ISSUES.md 新增的每条 `⏩ 已修` → grep 对应符号 / ls 对应文件 → **0 hits 立即拒绝 commit**
2. CHANGELOG.md 新条目 → 对应 commit body 描述的代码改动文件**真在 working tree 内**（git status 验证）
3. ADR / SYSTEM.md 新增段 → 对应代码组件**真存在**（grep 主要 struct/trait 名）
4. 收尾 commit message 必须显式列出：哪些 work-stream 真做了（含 verified-by sha）/ 哪些被 Reality Check 拒掉（unstaged 列表）/ 哪些文档段落对应被拒掉的代码（必须同步回退或加 governance 告警块）

### 验证一项收尾改动是否"真持久化"

1. `git log --all -S "<关键 struct/fn/symbol 名>"` 找对应 commit
2. 若 0 hits → doc 声称已修但代码未落地 → 立即在 KNOWN_ISSUES.md 顶部加 ⚠️ 治理告警块标注偏差
3. 若有 commit 但被后续 revert → 检查 doc 是否同步降级（`⏩ → ⛔/⚠️`）
4. 若 commit 在 backup/* 或 claude/* 分支 + 未 merge main → doc 不应标 `⏩ 已修`

### 反模式（禁止）

- "另一会话完成的工作我打包一次性 commit" → 必拆 doc / code 两个 commit
- "看到 ⏩ 已修 标记就假设代码已落地" → 必须独立 grep 验证后再做下游决策（如 follow-up 排期、规划评估）
- "doc 写多了 code 来不及落，先 commit 占坑后面补" → 占坑会变成 false-positive 治理债，必须先 code 后 doc
- 仅依赖 cross-session continuation commit body 自述"Reality Check pass" → 必须自己 grep 验证，commit body 是 author 的视角，不是 verifier 的视角

### 历史教训

10/10 false-positive 事件:**M-56 Phase 2 / M-62 / M-63 / M-64 / M-65 / M-66 / M-67 / M-70 / M-86 / M-87** — 详见 `quant-deploy/docs/KNOWN_ISSUES.md` 顶部治理告警块（2026-05-20 双重 Claude + Codex grep 验证）。

---

