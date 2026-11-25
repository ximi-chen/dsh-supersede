<!-- DSH-FORMAT: md-v1 -->
<!-- DSH-PARENT: 00 -->
<!-- DSH-LABELS: ready-for-agent -->
<!-- DSH-IDEMPOTENCY-KEY: deck-5eb3369d-5985305 -->
<!-- DSH-CREATED: 2026-11-25T07:28:49.095Z -->
<!-- DSH-BLOCKED-BY: 01 -->
# 02: 纯判定核心与 node --test 接缝

**What to build:** 把「这条队列快照该不该取消当前轮」抽成一个零依赖纯函数模块，放进 bundle，并成为整个功能唯一的自动化测试接缝。输入是一份普通快照（开关、忙碌回车偏好、是否 running、能否取消、队列行 id、已见 id、取消是否在飞），输出是普通判定（取不取消、把哪些 id 记为已见、原因）。它不 import React、不 import 任何 DSH 包、不产生副作用。测试用 Node 内置 `node --test` + `node:assert/strict`，ESM，零依赖，在 bundle 目录内跑。

**Blocked by:** #01

**Status:** resolved

- [ ] 模块可从 bundle 目录直接被 node 加载，不依赖任何第三方包或 DSH 包。
- [ ] 用例 1–9 全部有测试且绿：一条新行恰好取消一次；同快照求值两次无第二次取消；空闲新行不取消但记下且此后不触发；关闭时新行记下、之后打开不触发；steer 不取消并给出门禁原因；无权限不取消；在飞不第二次取消、落定后可再取消；一批两条新行只取消一次且两条都记录；上一轮落定后 running 中再来新行 → 新的取消。
- [ ] 测试只断言判定结果，不断言内部字段、调用顺序或对象身份。
- [ ] 在 bundle 目录跑测试命令一次通过，不引入额外测试框架或打包器。

语义：同一批新行只取一次消；同一份快照求值两次不得第二次取消；关闭 / 不 running / steer / 无取消权限 / 取消在飞都不取消且记下 id；落定后新行可再取消。

## Comments

### local — 2026-11-25T10:30:16.079Z
Merged as 7732da6 (feature commit 091efe3). Deliverable: zero-dependency `decideSupersede` with all eight gate reasons and an ESM `node:test` harness that loads the client chunk with a loader stub; spec-locked cases 1–9 are covered. Full suite now 27/27 after the later tickets.



## 进度
