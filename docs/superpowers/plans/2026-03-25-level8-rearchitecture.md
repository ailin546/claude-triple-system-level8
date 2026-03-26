# Claude Triple System Level 8 重构实施计划

> **For agentic workers:** REQUIRED: 优先按本文档拆分任务执行。若具备子代理能力，可在 `Heavy` 段落启用多 agent；默认先单 agent 落地控制面和文档，再逐步升级。

**Goal:** 将当前偏重的 Level 8 流程重构为默认轻量、按风险升级、重型协作按需启用的系统，并补齐文档、权限边界、shared-state 可靠性与降级能力。

**Architecture:** 先实现 `Fast / Standard / Heavy` 三档路由，再裁剪 hooks 与权限，最后加固 shared-state、memory 和恢复策略。保持控制面先于协作面落地，避免在没有稳定路由时继续堆重型能力。

**Tech Stack:** Markdown 文档、`.claude` 配置、Node hooks、shell 脚本、shared-state JSON 控制面。

---

## Chunk 1: 控制面与路由

### Task 1: 新建模式分流规则

**Files:**

- Create: `docs/claude-triple-system-level8-redesign/routing.md`
- Modify: `CLAUDE.md`
- Create: `.claude/rules/routing.md`

- [ ] **Step 1: 对照现有规则抽取路由信号**

梳理当前会触发重流程的关键词、目录、命令和任务类型。

- [ ] **Step 2: 定义三档模式**

明确 `Fast / Standard / Heavy` 的准入条件、默认启用项和禁用项。

- [ ] **Step 3: 在 `CLAUDE.md` 中加入模式摘要规则**

要求每个任务开始输出模式、原因、自动启用项和建议命令。

- [ ] **Step 4: 写入 `.claude/rules/routing.md`**

把模式判定与升级规则抽成独立规则文件，避免继续塞进总入口。

- [ ] **Step 5: 自检**

确认用户覆盖优先于模式自动路由。

## Chunk 2: 自动化裁剪

### Task 2: 重构 hooks 分层

**Files:**

- Modify: `.claude/settings.json`
- Create: `.claude/scripts/hooks/task-router.js`
- Create: `.claude/scripts/hooks/post-edit-light.js`
- Create: `.claude/scripts/hooks/stop-summary.js`
- Modify: 现有 hooks 注册顺序和触发条件

- [ ] **Step 1: 列出现有 hooks**

区分 Always-on、Standard-only、Heavy-only。

- [ ] **Step 2: 新增轻量 hooks**

只保留 `session-start`、`task-router`、`post-edit-light`、`stop-summary` 为默认自动化。

- [ ] **Step 3: 把 shared-state、sprint-memory 移出默认链路**

改为仅在 `Heavy` 模式启用。

- [ ] **Step 4: 验证降级行为**

确保轻量 hook 失败不阻塞主流程。

## Chunk 3: 权限收缩

### Task 3: 重构自治权限策略

**Files:**

- Modify: `.claude/strategies/autonomous-permissions.md`
- Create: `docs/claude-triple-system-level8-redesign/permissions.md`
- Optional: `settings.local.example.json`

- [ ] **Step 1: 删除解释器级大前缀批准建议**

移除 `node *`、`npx *`、`git *` 这类泛授权建议。

- [ ] **Step 2: 改成动作级分类**

区分只读、局部验证、本地生成、远程写、删除、部署。

- [ ] **Step 3: 写明人工确认边界**

把 push、deploy、publish、迁移执行明确列为永远人工确认。

- [ ] **Step 4: 做文档对齐**

确保 README、策略文档、示例配置三者一致。

## Chunk 4: 手动命令与操作手册

### Task 4: 重写命令说明

**Files:**

- Create: `docs/claude-triple-system-level8-redesign/manual-commands.md`
- Modify: `.claude/commands/plan.md`
- Modify: `.claude/commands/tdd.md`
- Modify: `.claude/commands/verify.md`
- Modify: `.claude/commands/code-review.md`
- Modify: `.claude/commands/orchestrate.md`
- Modify: `.claude/commands/save-session.md`
- Modify: `.claude/commands/resume-session.md`

- [ ] **Step 1: 给每个命令补齐适用 / 不适用场景**

- [ ] **Step 2: 给每个命令补齐最小示例与预期输出**

- [ ] **Step 3: 补齐命令衔接顺序**

例如 `/plan -> /verify`、`/plan -> /orchestrate -> /verify`。

- [ ] **Step 4: 标注 Heavy 依赖**

所有依赖 shared-state 或多 agent 的命令必须明确标注。

## Chunk 5: Shared State 加固

### Task 5: 让 shared-state 成为可靠控制面

**Files:**

- Create: `docs/claude-triple-system-level8-redesign/shared-state.md`
- Modify: `.claude/shared-state/README.md`
- Create: `.claude/shared-state/schema.json`
- Create: `.claude/shared-state/handoff-template.md`
- Modify: `.claude/scripts/hooks/shared-state-sync.js`

- [ ] **Step 1: 设计 schema**

加入 `version`、`tasks`、`workers`、`files_claimed`、`lease_until`。

- [ ] **Step 2: 加入原子写与 heartbeat**

- [ ] **Step 3: 加入 stale worker 清理**

- [ ] **Step 4: 加入冲突升级策略**

冲突无法自动解决时，退回单 agent。

- [ ] **Step 5: 自检**

shared-state 失败时不得假装仍在协同。

## Chunk 6: Memory 与恢复策略

### Task 6: 瘦身记忆并补齐降级文档

**Files:**

- Create: `docs/claude-triple-system-level8-redesign/recovery.md`
- Modify: `.memory/RULES.md`
- Modify: `.claude/scripts/hooks/sprint-memory.js`
- Modify: Session 相关 hooks

- [ ] **Step 1: 将记忆收敛为三类**

`Decisions`、`Constraints`、`Open loops`

- [ ] **Step 2: 移除低价值流水式写入**

- [ ] **Step 3: 定义统一降级状态**

`ok / warn / degraded / blocked`

- [ ] **Step 4: 验证重型能力故障后可回退到单 agent**

## Chunk 7: 总文档与总入口对齐

### Task 7: 更新总入口

**Files:**

- Create: `docs/claude-triple-system-level8-redesign/README.md`
- Create: `docs/claude-triple-system-level8-redesign/architecture.md`
- Create: `docs/claude-triple-system-level8-redesign/automation.md`
- Modify: `README.md`
- Modify: `CLAUDE.md`

- [ ] **Step 1: 写清默认自动化边界**

- [ ] **Step 2: 写清三档模式**

- [ ] **Step 3: 写清手动命令入口**

- [ ] **Step 4: 写清降级与恢复原则**

## 验收标准

- [ ] 小任务不再默认触发重型流程
- [ ] 中等任务能自动获得适量验证支持
- [ ] 高风险任务能自动升档
- [ ] 默认权限更保守
- [ ] shared-state 只在 Heavy 模式出现
- [ ] 任一重型组件异常时，能降级回单 agent

## 风险提醒

- 不要在路由未稳定前先扩写 shared-state。
- 不要只改文档不改 hooks，否则行为与说明会继续背离。
- 不要保留宽泛自治权限，否则整体风险仍未下降。
