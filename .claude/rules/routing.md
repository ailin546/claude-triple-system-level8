# Task Routing — 三档模式分流

> 每个任务开始时，自动判定流程强度。详细设计见 `docs/claude-triple-system-level8-redesign/routing.md`。

## 模式定义

### Fast（默认）

适用：解释代码、写文档、单文件小改、配置微调、无副作用小修复、一次性脚本。

启用：SessionStart 上下文恢复、只读探索、轻量格式化、局部静态提醒、最小 session 摘要。

禁用：brainstorming 强制、TDD 强制、shared-state、sprint memory、多 agent、全量验证。

### Standard

适用：普通功能开发、一般 bugfix、跨 2-5 文件改动、有用户可见行为变化、需要测试验证。

启用：Fast 全部 + 风险提醒、局部质量门、决策/约束/Open loops 记忆。

条件触发（建议但不强制）：复杂需求 → `/plan`；原因不清 bugfix → `/tdd`；公共接口变更 → `/code-review`。

### Heavy

适用：认证/支付/权限/PII、数据迁移、部署与基础设施、跨会话任务、架构重构、多 agent 并行。

启用：Standard 全部 + shared-state、sprint memory、冲突检测、严格验证。

手动触发：`/orchestrate`、`/save-session`、`/resume-session`。

## 路由规则（优先级从高到低）

### 1. 用户显式覆盖（最高优先）

以下指令直接覆盖自动路由：
- "直接做" / "走轻量流程" / "不要 TDD" / "不要多 agent" → 降档
- "需要完整审查" / "按重型流程来" → 升档

### 2. 风险关键词自动升档

命中以下关键词默认至少 Standard，部分直接 Heavy：

**→ Heavy**：auth, oauth, permission, billing, payment, deploy, production, migration, secret, token

**→ Standard**：delete, publish, refactor, api, database, config

### 3. 文件与目录信号

**→ Standard**：`api/`, `server/`, `database/`, `migrations/`, `auth/`, `config/`, `infra/`

**→ Heavy**：支付/账单目录、权限/身份目录、部署脚本、数据迁移脚本、shared-state 自身实现

### 4. 改动规模

- 单文件少量行 → Fast
- 多文件但局部 → Standard
- 跨模块多步骤 → Heavy

## 路由器输出格式

每个任务开始时输出：

```text
[Mode: Fast/Standard/Heavy] 原因 | 自动启用项 | 建议命令
```

示例：
```text
[Mode: Standard] 跨 3 个文件，涉及用户可见行为 | 轻量检查 + 局部验证 + 决策记忆 | 建议: /plan
```

## 禁止行为

- 因为系统"能做"多 agent，就默认启用多 agent
- 因为能自动 review，就每次都 review
- 因为有 TDD 纪律，就对所有小修复强制 TDD
- 因为有 shared-state，就把单 agent 任务硬塞进控制面
