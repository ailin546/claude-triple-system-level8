# Sessions Board — 详细规则

> 多 Claude session 协调，详细版。CLAUDE.md §Sessions Board 是精炼版。
>
> 文件：`~/.claude/state/sessions-board.md`（全局，所有项目共用，不在任何 git repo 内）
>
> 4 层协作栈（代码同步 / 同机协调 / 跨机通信 / 多 agent 内）中，本文件是 L2（同机多 session 协调）的详细规则。
>
> Claude 应在以下场景主动引入本文件：
> - 启动新 session（第一次写 board entry）
> - 准备 spawn 修改类 sub-agent
> - 准备 commit 前需要看其他 session 状态
> - 处理 board entry 冲突

---

## 设计理念

多 Claude session 在同机器上并行工作时，**主要冲突源是不知道对方在做什么**（worktree 是硬隔离重武器；sessions board 是软层告知，互补）。每个 session 在 board 上声明 working-tree、占用端口/PID、未 commit 的文件、显式 don't-touch 清单。

---

## 写入触发（必须）

- session 开始（启动 Claude Code 后第一件事）→ 添加自己的 `### [session-X]` entry
- 启动长 process（master / worker / dev server / 编译看门狗）→ 更新 `holds`
- 编辑共享文件（worker.json / master.json / 跨项目 scripts / 全局 hooks）→ 更新 `touching`
- 准备 commit → 看其他 session 是否动同区域；自己 commit 后更新 entry
- spawn 后台 agent 修改类任务 → 更新 `next` 让对方知道何时不该 stash/reset
- 长任务切换大方向 → 更新 `doing` + `next`
- session 结束 → entry 移到 `## History` 段（保留 30 天）

---

## 读取触发（必须）

- session 开始（哪怕只是改一个 doc，也读一眼）
- 准备改任何**仓库级共享文件**（worker.json / master.json / scripts / hooks / CLAUDE.md / docs/*）
- 准备启动占端口的 process
- 准备 spawn 后台 agent
- 准备 git stash / git reset / git commit（即使是自己 worktree，也要确认没有对方在 expecting 当前 HEAD）
- 看到 `git status` 有不认识的修改 → 先看 board 再问"是不是别人的"

---

## Entry schema

每个 active session 一段 `### [session-X — Mac/Linux, port-X]` heading，body 至少含：

- `worktree`: 路径 + branch + base commit
- `doing`: 一句话当前任务
- `touching`: 修改但未 commit 的文件路径
- `holds`: 端口 / PID / 进程 / 数据库等独占资源
- `don't touch`: 显式列出对方不该碰的文件 / 端口 / 资源
- `next`: 下一步计划（让对方好估算何时介入）

---

## 失效与清理

- 任一 session 看到 entry mtime > 4h → 视为 stale，主动询问或迁到 History
- session 结束移到 `## History`，保留最近 50 个，老的删
- 不强制 hook 自动写（自觉纪律 > hook 强制；hook 在每个文件操作后 spam 写比不写还烦）

---

## 与 Worktree 配合

- 同一项目两 session 都跑实例 → **必须** worktree 隔离（端口/DB/journals/index）+ board entry
- 同一 session 内 sub-agent 修改 working tree → 仍按 §多 Worktree / Sub-agent Git 隔离 铁律走（board 不替代它）
- Doc-only / 只读探索 / 跨不同项目的 session → board entry 即可，无需 worktree

---

## 反模式

- ❌ 写完 board 就忘改：next 字段写了"明天再说"但实际今晚做了 → 对方按"明天"估算时间踩雷
- ❌ entry 太宽泛：`doing: 改 master.rs` → 对方不知道改哪段哪函数
- ❌ 不写 don't touch：对方推测 don't touch，推测错就冲突
- ❌ session 结束不清理 → board 越长越没人读
