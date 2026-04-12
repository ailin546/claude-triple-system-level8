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

手动触发：`/save-session`、`/resume-session`。

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

## 路由器输出与模式写入

每个任务开始时必须执行两步：

**Step 1：输出模式摘要**
```text
[Mode: Fast/Standard/Heavy] 原因 | 自动启用项 | 建议命令
```

**Step 2：写入模式文件**（仅 Standard/Heavy 时需要执行）
```bash
node .claude/scripts/hooks/set-mode.js standard
# 或
node .claude/scripts/hooks/set-mode.js heavy
```

**新任务边界**：同一 session 中切换到不同任务时，先重置再设置：
```bash
node .claude/scripts/hooks/set-mode.js --reset           # 回到 fast
node .claude/scripts/hooks/set-mode.js --reset standard   # 回到 fast 再升到 standard
```

> Fast 模式是默认值（SessionStart 已写入），无需额外执行。
> `pre-tool-escalate.js` 在高风险操作时自动升档，并追踪跨文件累积（3 文件 → Standard，6 文件 → Heavy）。
> 5 分钟空闲间隔自动触发任务边界 reset（模式回到 fast，文件追踪清空）。
> 所有模式变化记录到 `.claude/logs/mode-trace.jsonl`。

示例：
```text
[Mode: Standard] 跨 3 个文件，涉及用户可见行为 | 轻量检查 + 局部验证 + 决策记忆 | 建议: /plan
> node .claude/scripts/hooks/set-mode.js standard
```

## 模型自动选择

模式与子 agent 模型联动。Spawn 子 agent 时，根据当前模式选择 `model` 参数：

| Agent 类别 | Fast | Standard | Heavy |
|-----------|------|----------|-------|
| **critical-reasoning**（planner, architect） | opus | opus | opus |
| **orchestrator**（agents-orchestrator） | sonnet | opus | opus |
| **review**（code-reviewer, security-reviewer） | sonnet | opus | opus |
| **development**（tdd-guide, build-error-resolver, frontend, backend...） | sonnet | sonnet | opus |
| **worker**（doc-updater, refactor-cleaner, e2e-runner, git-workflow...） | haiku | sonnet | sonnet |

**查询命令**：
```bash
node .claude/scripts/hooks/get-model.js <agent-name>   # 单个 agent
node .claude/scripts/hooks/get-model.js --all           # 所有 agent
node .claude/scripts/hooks/get-model.js --summary       # 分类汇总
```

**使用规则**：
1. Spawn 子 agent 前，根据当前模式查表（或调用 get-model.js）确定模型
2. 将模型作为 `model` 参数传入 Agent tool，覆盖 agent 定义中的静态值
3. 模式升档后（set-mode / pre-tool-escalate），后续 agent spawn 自动使用更高模型
4. 用户可通过 `MODEL_MAP_OVERRIDE` 环境变量覆盖特定 agent 的模型

**映射逻辑**：`.claude/scripts/lib/model-map.js`

## 禁止行为

- 因为系统"能做"多 agent，就默认启用多 agent
- 因为能自动 review，就每次都 review
- 因为有 TDD 纪律，就对所有小修复强制 TDD
- 因为有 shared-state，就把单 agent 任务硬塞进控制面
