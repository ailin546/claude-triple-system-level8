# 双轨记忆系统架构

## 概述

双轨记忆将 Claude Code 的记忆分为两个独立轨道：

| 轨道 | 位置 | 生命周期 | 用途 |
|------|------|---------|------|
| **系统记忆** | `~/.claude/` | 跟着用户走 | 通用技能、跨项目模式 |
| **项目记忆** | `.claude/memory/` | 跟着项目走 | 项目专属知识 |

## 数据流

```
每次会话结束 (Stop hook)
    │
    ├─► sprint-memory.js → .claude/memory/sprint-YYYY-WNN.md (中期)
    │
    ├─► memory-consolidate.js (每日一次)
    │   └─► 过期 sprint (>2周) → .claude/memory/long-term.md (长期)
    │
    └─► memory-promote.js (每日一次)
        └─► 跨项目通用本能 → ~/.claude/homunculus/instincts/personal/ (系统级)
```

## 项目记忆层次

### 短期: Session 文件
- 位置: `~/.claude/sessions/`
- 生命周期: ~7 天
- 内容: 单次会话状态

### 中期: Sprint 文件
- 位置: `.claude/memory/sprint-YYYY-WNN.md`
- 生命周期: 按 ISO 周滚动
- 内容: 决策、未完成工作、经验教训、架构笔记
- 创建者: `sprint-memory.js` (Stop hook)

### 长期: Long-Term 文件
- 位置: `.claude/memory/long-term.md`
- 生命周期: 永久
- 内容: 从过期 sprint 沉淀的架构决策、编码约定、已知陷阱、经验教训
- 创建者: `memory-consolidate.js` (Stop hook, 每日一次)

## 系统记忆

### 本能 (Instincts)
- 位置: `~/.claude/homunculus/instincts/personal/`
- 来源: 从项目本能晋升 (跨项目出现的通用模式)
- 晋升者: `memory-promote.js` (Stop hook, 每日一次)
- 晋升工具: `instinct-cli.py promote`

## 钩子

| 钩子 | 类型 | 频率 | 职责 |
|------|------|------|------|
| `sprint-memory.js` | Stop | 每次 | 更新当前 sprint 文件 |
| `memory-consolidate.js` | Stop | 每日 | 过期 sprint → long-term.md |
| `memory-promote.js` | Stop | 每日 | 跨项目本能 → 系统记忆 |

## 命令

| 命令 | 用途 |
|------|------|
| `/memory-status` | 查看双轨记忆完整状态 |

## 文件清单

```
.claude/memory/
├── sprint-YYYY-WNN.md       # 中期记忆 (按周)
├── long-term.md              # 长期记忆 (永久)
├── .consolidate-lock         # 沉淀频率锁
└── ARCHITECTURE.md           # 本文档

~/.claude/
├── homunculus/
│   ├── instincts/personal/   # 系统级本能
│   ├── .promote-lock         # 晋升频率锁
│   └── promote-log.jsonl     # 晋升日志
└── sessions/                 # 短期会话文件
```
