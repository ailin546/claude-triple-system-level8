# Audit Protocol — 多 Agent 全面审计强制规则

> **定位：三层审计体系的 Layer 3（发现层）。**
> Layer 1（pre-edit-check.sh, PreToolUse hook）和 Layer 2（run-all.sh, Stop hook）
> 负责已知 bug 模式的自动检测与回归防护。
> 本规则负责 Layer 3：通过多 Agent 并行审计**发现新的、未知的问题**。
> 
> 三层体系详见 `SYSTEM.md` §13 和 `quant_base-main/scripts/audit/`。
>
> 适用场景：用户要求"审查"、"审计"、"review 整个项目"、"检查完整性"等全局性审查任务。
> 不适用于：单文件 code review、PR review、写代码后的局部审查（那些用 code-reviewer agent）。

## 与 Layer 1-2 的关系

```
Layer 1: scripts/audit/pre-edit-check.sh   自动，每次 Edit .rs 文件触发，检测 7 种已知反模式
Layer 2: scripts/audit/run-all.sh          自动(Stop hook) + 手动，7 维度 grep 扫描已知 bug 模式
Layer 3: 本规则（audit-protocol.md）       手动触发，多 Agent 发现新类型问题 + 跨层一致性
```

**Layer 3 开始前，必须先运行 Layer 2：**
```bash
cd quant_base-main && ./scripts/audit/run-all.sh
```
Layer 2 的结果作为 Layer 3 的基线——已知问题不重复报告，专注发现 Layer 2 覆盖不到的新问题。

**Layer 3 发现的新 bug 模式 → 写入 Layer 2 脚本（进化循环）：**
Layer 3 发现可自动化检测的 bug 模式后，应追加到 `scripts/audit/*.sh`，使其成为 Layer 2 的自动检测项。

## 核心原则

**审计的价值在于发现真实问题，而非报告最多问题。**
一个确认的 MEDIUM 比十个未验证的 CRITICAL 更有价值。

## 三条铁律

### 铁律 1: 验证优先于推断

任何 HIGH 及以上的发现，必须包含以下至少一种验证证据：
- **编译验证**: 运行 `tsc --noEmit`、`cargo check`、`cargo build` 的实际输出
- **Grep 验证**: 实际搜索结果（含行号），而非"应该存在"的推断
- **运行验证**: 实际执行命令的输出（如 `curl`、端口检查）
- **源码链路验证**: 从调用方追溯到被调用方的完整代码路径（附行号）

**禁止**: 仅凭文件名、配置字段名、或"应该是这样"做出 HIGH+ 判定。

### 铁律 2: 审计 Agent 必须有执行能力

| Agent 类型 | 用途 | 工具要求 |
|-----------|------|---------|
| code-reviewer | 代码逻辑审计 | 必须能 Read + Grep + **Bash**（运行编译/测试） |
| security-reviewer | 安全审计 | 必须能 Read + Grep + **Bash**（运行扫描/验证） |
| Explore | 信息收集 | 仅用于前期调研，**不可用于出具审计结论** |

**禁止**: 用 Explore agent 出具 HIGH+ 级审计结论。Explore 只做信息收集，最终判定必须由有 Bash 能力的 agent 或主 agent 亲自验证。

### 铁律 3: 安全审计是独立维度，不可合并

安全审计必须作为独立 agent 启动，不可作为"功能审计的附带检查"。

## 审计 Agent 编排（强制）

全局审计必须启动以下 **4 类 agent**，缺一不可：

```
┌─────────────────────────────────────────────────┐
│  Phase 1: 信息收集（Explore agents，可并行）      │
│  功能完整性、代码逻辑、API 契约、部署配置          │
│  输出：事实清单（不含严重性判定）                   │
└──────────────────────┬──────────────────────────┘
                       ↓
┌─────────────────────────────────────────────────┐
│  Phase 2: 独立安全审计（security-reviewer）       │
│  认证/授权、密钥管理、输入验证、CORS、传输安全      │
│  必须独立启动，不可合并到功能审计中                  │
└──────────────────────┬──────────────────────────┘
                       ↓
┌─────────────────────────────────────────────────┐
│  Phase 3: 主 agent 亲自验证                       │
│  对 Phase 1-2 中所有 HIGH+ 发现逐一执行验证        │
│  运行编译命令、grep 确认、读完整调用链              │
│  未验证的 HIGH+ 降级为 UNVERIFIED                  │
└──────────────────────┬──────────────────────────┘
                       ↓
┌─────────────────────────────────────────────────┐
│  Phase 4: 对抗性审查（code-reviewer agents）      │
│  挑战 Phase 3 确认的发现：是真 bug 还是设计权衡？   │
│  寻找 Phase 1-2 遗漏的问题                        │
│  输出：修订版报告                                  │
└─────────────────────────────────────────────────┘
```

## Phase 1-2 可并行，Phase 3 必须串行

- Phase 1 和 Phase 2 可同时启动（独立维度）
- Phase 3 必须等 Phase 1-2 完成后，由主 agent 逐一验证
- Phase 4 在 Phase 3 之后启动

## 严重性判定标准

只有满足验证条件的发现才能标为对应级别：

| 级别 | 验证要求 | 示例 |
|------|---------|------|
| CRITICAL | 必须有可重现的验证命令输出 | `tsc` 报错截图、`curl` 无认证成功 |
| HIGH | 必须有源码行号 + 完整调用链 | 读了 caller 和 callee 双方代码 |
| MEDIUM | 必须有 grep 确认 | 搜索结果证明问题存在 |
| LOW | 可基于代码阅读推断 | 代码风格、建议性改进 |
| UNVERIFIED | 未满足对应级别验证要求 | 需标注为 UNVERIFIED，不计入最终报告 |

## 审计报告格式

每个发现必须包含：

```markdown
### [级别] 问题标题
- **文件**: path:line
- **验证方式**: 编译/grep/运行/源码链路
- **验证证据**: 实际命令输出或代码引用
- **影响**: 具体场景和损失估算
- **修复建议**: 具体代码变更
```

**禁止**: 没有验证证据的发现标为 HIGH+。

## 与现有规则的关系

- 本规则补充 `agents.md` 的 Multi-Perspective Analysis，为"审计"场景提供强制流程
- 不影响日常开发中的 code-reviewer / security-reviewer 使用（那些是局部审查）
- evaluation-rubric.md 的评分标准仍然适用（"无证据高分"禁令）
