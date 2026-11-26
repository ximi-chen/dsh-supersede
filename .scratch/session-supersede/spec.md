<!-- DSH-FORMAT: md-v1 -->
<!-- DSH-TITLE: 会话「接替」：运行中新消息立即中止当前轮并开新轮 -->
<!-- DSH-STATUS: ready-for-agent -->
<!-- DSH-LABELS: ready-for-agent -->
<!-- DSH-IDEMPOTENCY-KEY: deck-aef56404-5985305 -->
<!-- DSH-CREATED: 2026-11-25T07:25:25.494Z -->

## Problem Statement

在 DeepSeek Harness 的 Web GUI 里，当某一轮正在运行时（模型正在请求或工具正在执行），用户输入新消息只有两种命运：按「忙碌回车」偏好进入**队列**，等当前轮完全结束才被认领；或作为**插话**在下一个步边界并入当前轮。没有第三种：让这条消息立刻中止当前轮、并以它开启新一轮。

需要这种语义的时刻很具体：用户看到模型走错方向、或者想换一个前提，此时正确动作是"停掉这个轮次，按我新的说法重来"。现在只能先双击 Esc 停止、等轮次停下，再把消息发出去；多一步操作，而且停止与发送之间有一个空窗——用户很容易在这段时间里看着已被放弃的输出继续增长，或者误以为停止后消息会自动带着新前提重开。会话级的「接替」把这两步合成一步，并且让被打断的轮次在会话里留下可见痕迹。

## Solution

在输入框工具行左侧（`conversation.input.left`）加入一个会话级开关「接替」。打开后该会话进入「接替中」：

- 用户在运行中提交的普通消息仍正常进入队列；消息被宿主接受、队列行出现的那一刻，插件立即中止当前轮次。
- 中止后插件把这条纯文本消息取回并重新投递：宿主取消不会自行续跑队列，重新投递自带的唤醒才会让这条消息立刻开启下一轮。用户看到的是"当前轮停下，新消息立刻开跑"。
- 被打断轮次的尾部出现一行低对比度本地文字「已被新消息接替」，说明这一轮是被接替而不是正常结束。
- 开关按会话记忆、存在浏览器本地，刷新后保持；新会话默认关闭。关闭后恢复原来的排队行为。
- 开关旁边在开启时始终显示「接替中」，发送按钮的"排队"文案不变（核心包不改）。忙碌回车偏好为「插话」时，开关不可用并说明原因——此时消息根本不会进入队列，接替没有可观察的触发点。

插件是纯客户端 bundle：不改任何核心包，安装进当前 profile，卸载后行为完全恢复。

## User Stories

1. As a DSH user in a running session, I want a "接替" toggle in the composer toolbar, so that I can switch the delivery semantics of my next message without leaving the conversation.
2. As a user who just realized the model is going the wrong way, I want sending one message to stop the current turn, so that I don't have to press Escape twice and then resend.
3. As a user, I want the new message to start the next turn immediately, so that my correction is acted on without waiting for the abandoned work to finish.
4. As a user, I want the interrupted turn's partial output and tool results to stay in the conversation and in the model's context, so that the new turn can build on what was already learned.
5. As a user, I want the interrupted turn to be visibly labeled "已被新消息接替", so that I can tell it apart from a normal completion or a manual stop.
6. As a user, I want the label to be restrained (small, low-contrast, part of the turn tail), so that it doesn't compete with the assistant's output.
7. As a user, I want a persistent "接替中" indicator next to the toggle, so that I always know which delivery semantic the session is in.
8. As a user, I want the toggle to be off for a new session, so that default DSH behavior is unchanged until I ask for it.
9. As a user, I want the toggle state to survive a page reload, so that I don't re-enable it in every session.
10. As a user, I want the toggle state to be per session, so that switching between sessions doesn't silently change another session's behavior.
11. As a user, I want to turn supersede off and get queueing back immediately, so that the mode is reversible without reloading.
12. As a user, I want a message sent while the session is idle to behave exactly as before, so that supersede only affects the running case.
13. As a user, I want messages that were already queued when I enable the toggle not to be retroactively aborted, so that the toggle only governs messages I send after enabling it.
14. As a user who sends two messages quickly while one turn runs, I want the first new message to abort that turn, and both messages to stay in context, so that nothing I typed is lost.
15. As a user, I want a second message sent while the next turn is already running to abort that next turn as well, so that "latest message wins" holds for rapidly corrected inputs.
16. As a user, I want the same queue row to never cause two cancels, so that re-renders don't produce a stray interruption.
17. As a user, I want the double-Escape stop to keep working exactly as before, so that I keep my existing muscle memory.
18. As a user, I want supersede to do nothing when the session refuses cancellation, so that a read-only or restricted session doesn't get a button that lies.
19. As a user, I want the toggle to be disabled with a clear reason when my busy-Enter preference is "插话", so that I'm not offered a mode that cannot trigger.
20. As a user, I want a failed cancel to produce a visible, transient message, so that I know the message stayed queued instead of silently assuming it superseded.
21. As a user, I want the plugin to never send an extra model request or change my prompt, so that enabling it costs nothing beyond the interruption I asked for.
22. As a user, I want the plugin to work without me editing any core package, so that a DSH upgrade doesn't turn it into a merge conflict.
23. As a user, I want the toggle and label to follow the app's light/dark theme, so that they look like part of the composer.
24. As a user, I want the toggle to be reachable and operable by keyboard and assistive technology, so that it behaves like the other composer controls.
25. As a user reading the interface in Chinese or English, I want the toggle, tooltip, label, and plugin description in my language, so that I don't have to translate English UI.
26. As a user, I want the plugin's detail page to state the "排队" label mismatch and the queue-only requirement, so that I know the exact limits before relying on it.
27. As a user, I want the marker to be client-memory only, so that swapping devices or reloading never rewrites session history.
28. As a user, I want disabling or uninstalling the plugin to leave no residue in the session, so that the feature is fully reversible.
29. As a user, I want the plugin to work in subagent sessions too, because the composer is shared and the interrupt routes through the same session face.
30. As a user, I want the toggle to disappear on the blank home (no session), so that I never see a control that has no session to act on.
31. As a user, I want to see "接替中" without re-reading a tooltip, so that the mode's effect is obvious at a glance.
32. As a user, I want the marker to appear on the turn that was actually interrupted, not on the following turn, so that history reads correctly.
33. As a user, I want the feature to fail closed (queue, no interruption) if any prerequisite API is missing, so that a DSH change degrades to stock behavior instead of breaking sending.

## Implementation Decisions

**模块与形态**

- 私有客户端 bundle：宿主半边是空 `apply`，只满足 bundle 形态；客户端模块承担全部行为。清单声明 web 平台客户端入口、立即加载，并只在激活顺序上依赖会话 UI / 会话控制器 / 设置 / 语言这几个客户端包（不 import 它们）。
- 客户端模块注册两个槽位条目：`conversation.input.left` 放开关与「接替中」指示；`conversation.chat.turnTail` 放「已被新消息接替」标记。
- 通过插件上下文取 `slots`（注册）、`sessions`（拿 `SessionFace`）、`configForms`（读忙碌回车偏好）、`locale`（全部可见文案）。槽位组件拿标准会话 props，其中已包含 `sessionId`、`useSession`、`useInput`、`useAccess`（`dsh-client-ui-session` 把 `sessionId` / `useSession` / `useAccess` 合并进 `SessionStandardProps`，已从装机源码核实）。

**状态**

- 每个会话一份接替状态：`{ enabled, seenQueueIds, cancelInFlight, ledger }`，放在插件内存的按会话存储里。唯一持久化的是 `enabled`，存浏览器本地存储，键按会话 id 区分，前缀用插件自己的命名空间。不写会话事件、不加新事件类型、不加宿主投影。
- 打开开关时，把当前已存在的队列行记为已见但不动作。观察到的行 id 只在该队列出现期内参与一次判定。观察到的队列为空时重置已见集合，内存有界。
- 开关关闭、会话切换、页面刷新都不得把别的会话的状态带过来。

**判定核心（纯函数，零依赖）**

- `decideSupersede(input)` 输入 `{ enabled, busyEnter, running, canCancel, queue: readonly {id}[], seen: ReadonlySet<string>, cancelInFlight }`，输出 `{ cancel: boolean, seen: readonly string[], reason }`；它只做判定，不调用任何东西。
  - `busyEnter === 'steer'` 或不允许取消 → 不取消。
  - 开关关闭 → 不取消，但记录 id。
  - 会话不 running → 不取消（宿主对已挂载的空闲会话取消是空操作，这里只是防御）。
  - 已有取消在飞 → 不取消；记录 id。
  - 否则只要存在未见过的队列行 → 取消一次，并把当前全部队列 id 记为已见。
  - **一次观察批次只发一次取消**的理由：取消针对的是"消息提交时正在跑的那一轮"。同一批出现的行都是针对那一轮提交的，一次中止就兑现了全部意图；下一轮跑起来之后再出现的新行会得到一次新的判定。
  - 同一份队列快照求值两次不得产生第二次取消。

**副作用与取消**

- 触发点只认观察到的 `next-turn` 队列（`useInput(s => s.queue)`），绝不在"发送"时乐观触发。队列行可见时消息已durable 进入宿主收件箱，取消抢不到消息前面。
- 取消走会话门面 `sessions.binding(sessionId).session.cancel()`，子代理会话由它自己路由。宿主取消保留收件箱，但被中止的驱动会直接收尾，**不会**自行续跑队列（0.2.2-rc.5 实测：待处理行一直留在 `next-turn`，直到下一次 prompt 才被认领）。因此取消被接受后，插件把触发这次接替的纯文本队列行取回并重新 `prompt`，以新 requestId 自带的唤醒开启下一轮；带附件或图片的行无法映射成 prompt 内容，留在队列里由该唤醒按 FIFO 认领，若一条纯文本行都没有则不取消，退回原生排队。
- 每个会话同时最多一次取消在飞，调用落定后清标志。调用失败时清标志、在控制台留一条记录，并在槽位内显示短暂的「接替失败，消息仍在排队」；不自动重试。
- 取消是一次远程往返，存在窄窗口：旧轮自然结束、取消落到刚开的新轮。已接受的后果是"用户消息 + 一个近乎空转的轮次"，重发即可。判定核心坚持一批一次取消，就是为了不放大这个窗口。

**留痕账本**

- 发出取消时把该会话的账本置为 armed；此后观察到的第一个已关闭、且 `turn/end` 原因为 `aborted` 的轮次被标上「已被新消息接替」，随后解除 armed。取消失败不 arm。
- 标记按轮次身份匹配，一个会话一次接替只标一轮。账本是内存的：刷新后被打断的轮次退回成普通中止。
- armed 窗口内用户手动双击 Esc 造成的中止可能被误标；这是记录在案的已知限制，不去区分。

**界面**

- 开关是贴合输入框工具行节奏的紧凑控件：`role="switch"`、`aria-checked`、键盘可达；工具提示说明"运行中发消息会立即中止当前轮并开新轮"，禁用时说明原因。
- 「接替中」只在开启时显示，是开关旁的小号文字 chip，与工具行同一纵向节奏。
- 标记是弱化字色的小字，插在轮次尾部槽位内容末尾、原有悬停操作之前。
- 只用主题令牌（`--dsw-alias-*`），不用字面色值。
- 全部文案走客户端语言服务与插件命名空间；zh 与 en 必须齐备，其余语言回退英文。
- 忙碌回车偏好读不到时按排队处理（不禁用）；会话绑定拿不到时隐藏控件。

**分发与元数据**

- 用 `plugin_manager install_bundle` 装进当前 profile 的私有 bundle；补丁只插入一行。客户端 `apply` 内注册的所有资源都要能被正确释放。
- 显示元数据：原创图标；en 与 zh 的 `meta.title` / `meta.description` 点名"输入框左侧「接替」"并写明两条限制（发送按钮仍显示排队；需要忙碌回车为排队）。附 README 写用法。不声明 `meta.detail`、不出示意图，避免假图；日后要加只能是真实功能插图。
- 不新增斜杠命令、宿主端点、代理工具或提示词段落。

## Testing Decisions

- **唯一接缝**：纯判定核心 + 留痕账本的同一个无依赖模块。它不 import React、不 import 任何 DSH 包，输入是普通快照，输出是普通判定。接缝之上的部分（React 接线、localStorage、远程取消、槽位渲染）刻意做薄，交给装机后人工验收。
- 什么是好测试：从"用户可见的队列快照"出发，断言**判定**——取消或不取消、连续求值不会重复取消、哪些行被记录。不断言内部字段、调用顺序或对象身份；不 mock React 或槽位框架。
- 必须锁住的用例：
  1. 开启 + running + 一条新队列行 → 恰好取消一次。
  2. 同一份快照求值两次 → 没有第二次取消。
  3. 开启 + 空闲 + 新行 → 不取消，但记下；它此后不得再触发。
  4. 关闭 + running + 新行 → 不取消并记下；之后打开开关，这一行不触发。
  5. 忙碌回车 = steer → 不取消，并给出界面需要的门禁原因。
  6. 无取消权限 → 不取消。
  7. 取消在飞时来新行 → 不第二次取消；落定后新行可以再次取消。
  8. 一次观察里出现两条新行 → 只取消一次，两条都记录。
  9. 上一轮判定落定、running 中又来新行 → 新的取消。
  10. 账本只标 armed 后第一个 aborted 的已闭合轮次；正常结束不标；标过之后更晚的 aborted 不再标。
  11. 取消失败导致 arm 的账本永不标记。
- 测试工具：Node 内置 `node --test` + `node:assert/strict`，零依赖，在 bundle 目录内跑。这个工作区目前没有任何测试设施，本规格是第一个；测试是 ESM `.test.js`，与被测模块同目录。日后若加构建步骤，接缝不变，测试仍跑构建后的 ESM。
- 刻意不做单测：React 槽位组件、localStorage 适配、开关与提示的标记结构、主题令牌、远程取消调用。它们由装机后的现场清单覆盖：
  - 会话里出现开关、空白首页不出现；
  - 默认关；打开 → 刷新页面 → 该会话仍开，别的会话不受影响；
  - 打开后运行中发消息：当前轮结束、消息开启下一轮、标记落在被打断轮且不落到下一轮；
  - 双击 Esc 仍能停止且不出现标记；
  - 关闭状态下先排队一条、再打开开关：那条不被中止；
  - 忙碌回车设为「插话」：开关禁用并说明原因；
  - 亮/暗主题、zh/en、键盘焦点、窄宽度下的工具行；
  - 插件详情页有图标、本地化标题与描述、无元数据诊断。
- 先例：本工作区没有（现存只有术语表与 ADR）。装机 app 内的客户端包上游用 vitest 风格测法，但归档里不带测试、这里也拿不到；不要为了模仿而引入打包器或第二套测试框架。

## Out of Scope

- 给 `BUSY_ENTER_BEHAVIORS` 加第三个值，或 fork `dsh-client-ui-conversation`；发送按钮继续显示"排队"。
- 队列行里的"接替发送"操作（队列行内没有插件槽）。
- 修改或代写忙碌回车偏好；插件只读并解释门禁。
- 把插话模式（`next-step`）或 Cmd/Ctrl+Enter 的排队手势也做成接替触发点。
- 把留痕写进会话日志、宿主投影或本地存储；它只活在内存里。
- 保证工具层被取消：不响应 abort 信号的工具会推迟轮次结束（于是也推迟标记），甚至留下写了一半的文件；这是宿主侧属性。
- 新增 Remote 端点、宿主监听、斜杠命令、代理工具、提示词段落或会话事件类型。
- 自动重试、退避或取消队列。
- 开关状态的跨设备/跨浏览器同步。
- UI 渲染与远程传输的自动化测试。

## Further Notes

- 触发点刻意等持久化后的队列行，而不是拦截发送：客户端没有提交扩展点（`InputActions.submit()` 不带模式参数），不 fork 核心包时这是唯一存在的观察点。
- "一批只发一次取消"让实现对得起语义：一条消息接替的是它提交时正在跑的那一轮，而不是因它才开始的下一轮。
- ADR 的四条已知限制仍然成立：发送按钮文案、远程往返竞态、留痕只在内存、队列行做不了动作。忙碌回车门禁是准备本规格时补上的第五条操作性限制。
- 支撑设计的运行时事实（均从装机源码核实）：宿主取消保留收件箱，但被中止的驱动在 `turn()` 中抛出、直接收尾，队列不会自动续跑——这是实现后由现场反馈补正的事实，原规格此处判断有误；对已挂载但空闲的代理取消会被接受且是空操作；被中止的流式内容以 `interrupted: true` 落日志；`SessionStandardProps` 被扩展出 `sessionId` / `useSession` / `useAccess`；`InputState.queue` 就是 `next-turn` 收件箱投影。
- 装机验收至少要用一个全新会话，不能只验当前会话：客户端 bundle 的槽位注册跟页面加载走；DSH 升级后槽位名或标准 props 变化时，失败形态是开关静默不出现，这是首要观察点。
- 重新投递必须换一个新的消息身份（新 `rpcId`），否则无法唤醒；同一段文字不会在队列里出现两份。带附件/图片的消息无法映射成 prompt 内容，因此这一版不接替这类消息（留在队列、当前轮继续），这是宿主的限制而不是实现取巧。
- 如果 DSH 将来暴露提交模式钩子，判定核心可以原样保留，触发点收缩成"提交时若是接替，则先取消再发送"。

## 进度
