# 架构总览

## 重构目标

当前系统把 ECC、Superpowers、Agency Agents 与 Level 8 的 shared-state、sprint memory、autonomous permissions 叠加在一起，能力很强，但默认强度过高。重构后的系统要解决两个问题：

1. 保留高价值能力。
2. 把流程成本限制在真正需要它的任务上。

## 新架构：五个平面

### 1. Control Plane

负责“判断现在应该走什么流程”，是系统新核心。

职责：

- 判断任务模式：`Fast / Standard / Heavy`
- 识别风险：认证、支付、部署、迁移、删除、网络写操作
- 控制自动化强度
- 处理用户覆盖指令
- 决定是否进入单 agent / 多 agent 模式
- 管理降级策略

输入：

- 用户请求
- 当前代码变更规模
- 文件路径与目录类别
- 风险关键词
- 当前运行环境能力

输出：

- 当前任务模式
- 建议自动化动作
- 需要的手动命令
- 是否要求人工确认

### 2. Automation Plane

负责默认自动执行的 hooks，只放“快、稳、低噪音”的动作。

职责：

- 启动时加载上下文
- 编辑后做轻量检查
- 停止时写简短摘要
- 进行风险升级提醒

原则：

- 默认只运行低成本动作
- 不在每次编辑后跑全量 build / test / review
- 自动化失败时不能阻塞基础工作流

### 3. Workflow Plane

负责手动命令和人工可控的执行链。

职责：

- `/plan`
- `/tdd`
- `/verify`
- `/code-review`
- `/orchestrate`
- `/save-session`
- `/resume-session`

原则：

- 文档先行，命令说明必须清楚
- 只有用户明确需要或任务确实升级时，才进入更重的流程

### 4. Collaboration Plane

负责多 agent 协作，是重型能力，不允许默认全开。

职责：

- shared-state
- task claim
- file claim
- handoff
- worktree / tmux / control plane snapshot

原则：

- 仅用于 Heavy 任务
- 必须有最小并发安全
- 任一协调组件失败时，允许降级回单 agent

### 5. Knowledge Plane

负责 session memory、sprint memory、长期模式沉淀。

职责：

- 记录决策
- 记录约束
- 记录未完成事项
- 记录跨会话需要延续的上下文

原则：

- 记录“对未来有用”的信息
- 不记录低价值流水日志
- 不让记忆反过来污染当前任务上下文

## 结构关系

```mermaid
flowchart TD
    U["用户请求"] --> C["Control Plane"]
    C --> M1["Fast"]
    C --> M2["Standard"]
    C --> M3["Heavy"]
    M1 --> A["Automation Plane"]
    M2 --> A
    M3 --> A
    M2 --> W["Workflow Plane"]
    M3 --> W
    M3 --> P["Collaboration Plane"]
    A --> K["Knowledge Plane"]
    W --> K
    P --> K
```

## 默认运行原则

1. 所有任务先进入 Control Plane。
2. 能在 `Fast` 完成的任务，绝不强制升级。
3. `Standard` 只增加必要验证，不引入协作控制面。
4. `Heavy` 才启用 shared-state、sprint memory、多 agent 编排。
5. 用户明确说“直接做”“不要 TDD”“不要多 agent”时，Control Plane 允许降级。

## 建议目录结构

```text
CLAUDE.md
.claude/
  settings.json
  settings.local.example.json
  rules/
    routing.md
    automation-policy.md
    permission-policy.md
    memory-policy.md
  commands/
    plan.md
    tdd.md
    verify.md
    code-review.md
    orchestrate.md
    save-session.md
    resume-session.md
  scripts/
    hooks/
      session-start.js
      task-router.js
      post-edit-light.js
      stop-summary.js
      risk-escalation.js
      shared-state-sync.js
      sprint-memory.js
  shared-state/
    README.md
    schema.json
    handoff-template.md
  memory/
    README.md
docs/
  architecture.md
  routing.md
  automation.md
  manual-commands.md
  permissions.md
  shared-state.md
  recovery.md
```
