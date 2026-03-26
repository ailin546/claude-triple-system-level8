# 任务路由设计

## 目标

让系统在任务开始时自动判断流程强度，避免“一上来就全开所有能力”。

## 三档模式

### Fast

适用：

- 解释代码
- 写文档
- 单文件小改
- 配置微调
- 无外部副作用的小修复
- 一次性脚本

默认启用：

- SessionStart 上下文恢复
- 只读代码探索
- 轻量格式化
- 局部静态检查或提醒
- 最小 session 摘要

默认禁用：

- brainstorming 强制设计
- TDD 强制链路
- shared-state
- sprint memory
- 多 agent
- 全量验证

### Standard

适用：

- 普通功能开发
- 一般 bugfix
- 跨 2-5 个文件的修改
- 有用户可见行为变化
- 需要一定测试验证

默认启用：

- Fast 全部能力
- 风险提醒
- 局部质量门
- 决策 / 约束 / Open loops 记忆

条件触发：

- 复杂需求时建议 `/plan`
- bugfix 且原因不清时建议 `/tdd` 或系统化调试
- 变更涉及公共接口时建议 `/code-review`

### Heavy

适用：

- 认证、支付、权限、PII
- 数据迁移
- 部署与基础设施变更
- 跨会话任务
- 架构重构
- 多 agent 并行
- 影响范围难以一次性评估的任务

默认启用：

- Standard 全部能力
- shared-state
- sprint memory
- 冲突检测
- 更严格验证

手动触发：

- `/orchestrate`
- `/save-session`
- `/resume-session`

## 路由规则

### 规则一：用户显式覆盖优先

以下指令优先级最高：

- “直接做”
- “走轻量流程”
- “不要 TDD”
- “不要多 agent”
- “需要完整审查”
- “按重型流程来”

### 规则二：风险关键词自动升档

命中以下关键词默认至少进入 `Standard`，部分直接 `Heavy`：

- `auth`
- `oauth`
- `permission`
- `billing`
- `payment`
- `deploy`
- `production`
- `migration`
- `secret`
- `token`
- `delete`
- `publish`

### 规则三：文件与目录信号

以下目录变更默认至少进入 `Standard`：

- `api/`
- `server/`
- `database/`
- `migrations/`
- `auth/`
- `config/`
- `infra/`

以下目录变更默认进入 `Heavy`：

- 支付与账单目录
- 权限与身份目录
- 部署脚本
- 数据迁移脚本
- shared-state 自身实现

### 规则四：改动规模

- 单文件、少量行变更：优先 `Fast`
- 多文件但局部：优先 `Standard`
- 跨模块、多角色、多步骤：升级 `Heavy`

## 路由器输出格式

每个任务开始时输出一段极短摘要：

```text
模式：Standard
原因：跨 3 个文件，涉及用户可见行为
自动启用：轻量检查、局部验证、决策记忆
建议命令：/plan
```

## 路由器伪代码

```text
if user_override:
  use override
else if touches_high_risk_domain or contains_high_risk_terms:
  mode = Heavy
else if multi_file_change or public_behavior_change:
  mode = Standard
else:
  mode = Fast
```

## 禁止的坏行为

- 因为系统“能做”多 agent，就默认启用多 agent
- 因为能自动 review，就每次都 review
- 因为有 TDD 纪律，就对所有小修复强制 TDD
- 因为有 shared-state，就把单 agent 任务也硬塞进控制面
