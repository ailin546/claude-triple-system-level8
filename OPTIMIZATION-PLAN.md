# 系统精简方案

**日期**: 2026-03-19
**目标**: 将每次会话基础 token 消耗从 ~21,000 降至 ~6,000-8,000

---

## 现状诊断

| 项目 | 当前 | 问题 |
|------|------|------|
| Rules | 49 个文件，9 个语言目录，~58K chars | 8 种语言规则全量加载，但项目无应用代码 |
| Skills | 144 个 | 大量业务无关（物流、能源、签证、投资等），摘要每条消息重复注入 |
| Agents | 97 个 | 过半无关（招聘、留学、区块链、政府数字化等） |
| Commands | 49 个 | Go/Kotlin/Gradle 专用命令在非对应项目中无用 |
| Hooks | 14 个 | Stop 有 6 个 hook，PostToolUse 有 4 个，部分可合并 |

---

## 方案一：按项目裁剪（推荐用于实际项目）

当把此框架引入一个具体项目（如 TypeScript Web 项目）时，按以下步骤裁剪：

### 1. Rules：只保留 common + 项目语言（节省 ~12,000 tokens）

**保留**：
```
.claude/rules/
├── common/          ← 通用规则，始终保留
└── typescript/      ← 根据项目实际语言选一个
```

**删除**（以 TS 项目为例）：
```bash
rm -rf .claude/rules/golang
rm -rf .claude/rules/kotlin
rm -rf .claude/rules/perl
rm -rf .claude/rules/php
rm -rf .claude/rules/python
rm -rf .claude/rules/rust
rm -rf .claude/rules/swift
```

### 2. Skills：从 144 → ~30（节省 ~2,000 tokens/消息）

**保留的核心 Skills（通用流程类）**：
```
brainstorming
dispatching-parallel-agents
executing-plans
finishing-a-development-branch
receiving-code-review
requesting-code-review
shared-state-sync
subagent-driven-development
systematic-debugging
test-driven-development
using-git-worktrees
using-superpowers
verification-before-completion
writing-plans
writing-skills
```

**保留的核心 Skills（ECC 基础设施类）**：
```
ecc-coding-standards
ecc-api-design
ecc-database-migrations
ecc-deployment-patterns
ecc-docker-patterns
ecc-e2e-testing
ecc-search-first
ecc-security-review
ecc-security-scan
ecc-strategic-compact
ecc-eval-harness
ecc-continuous-learning-v2
ecc-blueprint
ecc-configure-ecc
ecc-cost-aware-llm-pipeline
```

**根据项目语言额外保留**（以 TS 为例）：
```
ecc-frontend-patterns
ecc-backend-patterns
ecc-postgres-patterns
```

**删除的 Skills（约 100 个）**：

业务领域类（与软件开发无关）：
```
ecc-carrier-relationship-management    # 承运商管理
ecc-customs-trade-compliance           # 海关合规
ecc-energy-procurement                 # 能源采购
ecc-inventory-demand-planning          # 库存需求规划
ecc-investor-materials                 # 投资者材料
ecc-investor-outreach                  # 投资者拓展
ecc-logistics-exception-management     # 物流异常
ecc-market-research                    # 市场研究
ecc-production-scheduling              # 生产排程
ecc-quality-nonconformance             # 质量不合格
ecc-returns-reverse-logistics          # 退货物流
ecc-visa-doc-translate                 # 签证翻译
ecc-article-writing                    # 文章写作
ecc-content-engine                     # 内容引擎
ecc-crosspost                          # 多平台发布
ecc-fal-ai-media                       # AI 媒体生成
ecc-frontend-slides                    # 演示文稿
ecc-video-editing                      # 视频编辑
ecc-videodb                            # 视频数据库
ecc-x-api                             # Twitter API
ecc-nutrient-document-processing       # 文档处理
```

不相关语言/框架类（以 TS 项目为例）：
```
ecc-android-clean-architecture
ecc-compose-multiplatform-patterns
ecc-cpp-coding-standards
ecc-cpp-testing
ecc-django-*                           # 4 个 Django skills
ecc-golang-*                           # 2 个 Go skills
ecc-java-coding-standards
ecc-jpa-patterns
ecc-kotlin-*                           # 5 个 Kotlin skills
ecc-perl-*                             # 3 个 Perl skills
ecc-python-*                           # 2 个 Python skills
ecc-springboot-*                       # 4 个 Spring Boot skills
ecc-swift-*                            # 4 个 Swift skills
ecc-swiftui-patterns
ecc-foundation-models-on-device
ecc-liquid-glass-design
ecc-clickhouse-io
```

工具/模式类（按需决定）：
```
ecc-agent-harness-construction         # 除非你在构建 agent 框架
ecc-agentic-engineering                # 除非你在做 agent 工程
ecc-ai-first-engineering               # 除非你的团队以 AI 为主
ecc-autonomous-loops                   # 除非你需要自治循环
ecc-continuous-agent-loop              # 同上
ecc-dmux-workflows                     # 除非用 tmux 多 agent
ecc-enterprise-agent-ops               # 除非运营企业 agent
ecc-nanoclaw-repl                      # ECC 内部 REPL
ecc-plankton-code-quality              # 特定工具
ecc-ralphinho-rfc-pipeline             # 特定 RFC 流程
ecc-regex-vs-llm-structured-text       # 非常特定的决策
ecc-iterative-retrieval                # 特定检索模式
ecc-content-hash-cache-pattern         # 特定缓存模式
ecc-prompt-optimizer                   # 除非优化 prompt
ecc-deep-research                      # 按需
ecc-exa-search                         # 按需
ecc-skill-stocktake                    # 维护工具
ecc-project-guidelines-example         # 示例模板
ecc-claude-api                         # 除非调用 Claude API
```

### 3. Agents：从 97 → ~25

**保留的核心 Agents**：
```
# ECC 基础设施（必须）
ecc-architect.md
ecc-build-error-resolver.md
ecc-database-reviewer.md
ecc-doc-updater.md
ecc-e2e-runner.md
ecc-planner.md
ecc-refactor-cleaner.md
ecc-security-reviewer.md
ecc-tdd-guide.md

# Superpowers
superpowers-code-reviewer.md

# 工程核心
engineering-backend-architect.md
engineering-code-reviewer.md
engineering-frontend-developer.md
engineering-software-architect.md
engineering-security-engineer.md
engineering-devops-automator.md
engineering-ai-engineer.md
engineering-technical-writer.md
engineering-rapid-prototyper.md
engineering-database-optimizer.md
engineering-git-workflow-master.md

# 测试
testing-api-tester.md
testing-performance-benchmarker.md
testing-reality-checker.md
testing-evidence-collector.md

# 编排
agents-orchestrator.md
```

**删除的 Agents（约 70 个）**：

业务/非技术类：
```
accounts-payable-agent.md              # 应付账款
corporate-training-designer.md         # 企业培训
data-consolidation-agent.md            # 数据合并
government-digital-presales-consultant.md  # 政府数字化
healthcare-marketing-compliance.md     # 医疗合规
identity-graph-operator.md             # 身份图谱
product-behavioral-nudge-engine.md     # 行为助推
product-feedback-synthesizer.md        # 反馈合成
product-sprint-prioritizer.md          # Sprint 优先级
product-trend-researcher.md            # 趋势研究
project-management-*.md                # 项目管理类 5 个
project-manager-senior.md
recruitment-specialist.md              # 招聘
report-distribution-agent.md           # 报告分发
sales-data-extraction-agent.md         # 销售数据
study-abroad-advisor.md                # 留学顾问
supply-chain-strategist.md             # 供应链
support-analytics-reporter.md          # 分析报告
support-executive-summary-generator.md # 执行摘要
support-finance-tracker.md             # 财务追踪
support-infrastructure-maintainer.md   # 基础设施
support-legal-compliance-checker.md    # 法律合规
support-support-responder.md           # 客服
zk-steward.md                          # Zettelkasten
```

设计类（除非是设计项目）：
```
design-brand-guardian.md
design-image-prompt-engineer.md
design-inclusive-visuals-specialist.md
design-ui-designer.md
design-ux-architect.md
design-ux-researcher.md
design-visual-storyteller.md
design-whimsy-injector.md
```

不相关语言/领域类：
```
ecc-go-build-resolver.md               # Go 项目才需要
ecc-go-reviewer.md
ecc-kotlin-build-resolver.md           # Kotlin 项目才需要
ecc-kotlin-reviewer.md
ecc-python-reviewer.md                 # Python 项目才需要
ecc-chief-of-staff.md                  # 通讯管理
ecc-harness-optimizer.md               # Harness 优化
ecc-loop-operator.md                   # Loop 操作
engineering-embedded-firmware-engineer.md
engineering-feishu-integration-developer.md
engineering-incident-response-commander.md
engineering-mobile-app-builder.md
engineering-rust-engineer.md
engineering-senior-developer.md
engineering-solidity-smart-contract-engineer.md
engineering-sre.md
engineering-threat-detection-engineer.md
engineering-wechat-mini-program-developer.md
engineering-data-engineer.md
engineering-ai-data-remediation-engineer.md
engineering-autonomous-optimization-architect.md
agentic-identity-trust.md
automation-governance-architect.md
blockchain-security-auditor.md
compliance-auditor.md
lsp-index-engineer.md
specialized-cultural-intelligence-strategist.md
specialized-developer-advocate.md
specialized-document-generator.md
specialized-mcp-builder.md
specialized-model-qa.md
testing-accessibility-auditor.md
testing-test-results-analyzer.md
testing-tool-evaluator.md
testing-workflow-optimizer.md
```

### 4. Commands：从 49 → ~20

**保留**：
```
aside.md           build-fix.md       checkpoint.md      code-review.md
e2e.md             eval.md            grill.md           harness-audit.md
learn.md           learn-eval.md      plan.md            quality-gate.md
refactor-clean.md  resume-session.md  save-session.md    sessions.md
tdd.md             test-coverage.md   update-docs.md     verify.md
```

**删除**（语言专用 + 不常用）：
```
go-build.md        go-review.md       go-test.md         # Go 专用
gradle-build.md    kotlin-build.md    kotlin-review.md   kotlin-test.md  # Kotlin 专用
python-review.md                                          # Python 专用
claw.md            pm2.md             setup-pm.md        # 特定工具
evolve.md          instinct-export.md instinct-import.md instinct-status.md  # Instinct 系统
loop-start.md      loop-status.md     projects.md        promote.md  # Loop/项目管理
model-route.md     orchestrate.md     prompt-optimize.md skill-create.md  # 高级功能
multi-backend.md   multi-execute.md   multi-frontend.md  multi-plan.md  multi-workflow.md  # Multi-model
update-codemaps.md                                        # 按需
```

### 5. Hooks：从 14 → 8

**合并 PostToolUse**（4 → 2）：
```
# 合并前：
PostToolUse[0]: quality-gate.js       (Edit|Write)
PostToolUse[1]: post-edit-format.js   (Edit)
PostToolUse[2]: post-edit-typecheck.js (Edit)
PostToolUse[3]: post-edit-console-warn.js (Edit)

# 合并后：
PostToolUse[0]: quality-gate.js       (Edit|Write) — 保留
PostToolUse[1]: post-edit-combined.js (Edit)       — 合并 format + typecheck + console-warn
```

**精简 Stop**（6 → 3）：
```
# 合并前：
Stop[0]: check-console-log.js
Stop[1]: session-end.js
Stop[2]: evaluate-session.js
Stop[3]: cost-tracker.js
Stop[4]: shared-state-sync.js
Stop[5]: sprint-memory.js

# 合并后：
Stop[0]: session-end.js              — 合并 session-end + cost-tracker + sprint-memory
Stop[1]: evaluate-session.js         — 保留（学习提取）
Stop[2]: shared-state-sync.js        — 保留（多 agent 状态）
# check-console-log 已在 PostToolUse 的 console-warn 中覆盖，删除
```

---

## 方案二：保持框架完整，增加按需加载机制

如果此仓库作为**模板/框架**分发，不应删除内容，而应改造加载方式：

### 1. Rules 按语言条件加载

将 `settings.json` 中的 rules 改为通过 SessionStart hook 动态检测语言：

```javascript
// session-start.js 增加逻辑：
// 1. 检测项目中的 package.json / go.mod / Cargo.toml 等
// 2. 只 symlink 对应语言的 rules 到 .claude/rules-active/
// 3. .claude/rules-active/ 是实际被 Claude 加载的目录
```

### 2. Skills 分层注册

在 `settings.json` 中只注册核心 skills，其余放入 `.claude/skills-optional/`：

```
.claude/
├── skills/              ← 只放 ~30 个核心 skills（会被自动发现）
└── skills-archive/      ← 其余 ~114 个（不会被自动注入，需要时手动启用）
```

### 3. 提供 `ecc-configure-ecc` 交互式裁剪

利用已有的 `ecc-configure-ecc` skill，增加裁剪向导：
```
选择你的技术栈: [TypeScript] [Python] [Go] [Kotlin] [Rust] [多选]
选择你的领域:    [Web] [Mobile] [AI/ML] [DevOps] [其他]
→ 自动启用/禁用对应的 rules, skills, agents, commands
```

---

## 预期效果

| 指标 | 优化前 | 方案一（裁剪后） | 节省比例 |
|------|--------|-----------------|---------|
| Rules 注入 tokens | ~15,000 | ~3,500 | **77%** |
| CLAUDE.md tokens | ~1,000 | ~800 | 20% |
| Skills 摘要 tokens/消息 | ~3,000 | ~800 | **73%** |
| 每会话基础消耗 | ~21,000 | ~6,000 | **71%** |
| 10 轮对话系统开销 | ~50,000-80,000 | ~15,000-25,000 | **70%** |
| Hook 延迟 (PostToolUse) | 4 次 shell 调用 | 2 次 | 50% |
| Hook 延迟 (Stop) | 6 次 shell 调用 | 3 次 | 50% |
| .claude/ 文件数 | 436 | ~120 | **72%** |

---

## 执行优先级

| 阶段 | 操作 | 影响 | 耗时 |
|------|------|------|------|
| **P0** | 删除不用的语言 rules | 立即节省 ~12K tokens | 1 分钟 |
| **P0** | 移动无关 skills 到 archive | 减少每消息 ~2K tokens | 5 分钟 |
| **P1** | 清理无关 agents | 减少目录噪音 | 3 分钟 |
| **P1** | 清理无关 commands | 减少目录噪音 | 2 分钟 |
| **P2** | 合并 PostToolUse hooks | 减少编辑延迟 | 15 分钟 |
| **P2** | 合并 Stop hooks | 减少停顿延迟 | 15 分钟 |
| **P3** | 实现按需加载机制（方案二） | 框架级改进 | 1-2 小时 |
