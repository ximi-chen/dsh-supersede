# dsh-supersede

A private DSH client bundle that adds a per-session **Supersede** switch at the
left of the composer's tool row.

## English

Install it as a private local bundle with Plugin Manager, or use
`plugin_manager` `install_bundle` pointing at this directory.

**What it does.** Turn the switch on in a conversation: while a turn is
running, the next message you send cancels that turn and opens the next one
with your message, instead of waiting in the queue. The interrupted turn is
labelled “Superseded by a new message”.

**Where.** At the left of the composer's tool row, inside the conversation
input area. It is off by default. Click it to turn it on for that session
only; a reload keeps it, and other sessions are unaffected.

**Two limits.**

1. The send button still shows **Queue**. The core conversation package is not
   modified, so the composer keeps announcing the stock delivery mode.
2. It only works when **Busy Enter** is set to queue. With **Steer**, the
   message is merged into the running turn instead of the next-turn queue, so
   there is nothing to supersede and the switch is disabled.

The switch state lives in this browser's localStorage, per session
(`dsh-supersede:enabled:<sessionId>`); it is not synced across devices. The
superseded-turn label is in memory only: reloading the page drops it, and the
interrupted turn reads as an ordinary stop.

**Uninstall.** Open **Plugins**, find this bundle and remove it. The switch and
the label disappear, and sending returns to stock behaviour.

## 中文

作为私有本地 bundle 用插件管理器安装，或用 `plugin_manager` 的
`install_bundle` 指向本目录。

**作用。** 在会话里打开开关后，运行中发送的下一条消息会中止当前轮，并用这
条消息开启新一轮，而不是在队列里等待；被中止的那一轮会标上
「已被新消息接替」。

**位置。** 输入框工具行左侧，默认关闭。点一下只在当前会话打开，刷新后保持，
其他会话不受影响。

**两条限制。**

1. 发送按钮仍显示**「排队」**。核心对话包没有改动，输入框仍按原生投递方式提示。
2. 仅当**忙碌回车**为「排队」时生效。设为「插话」时消息会并入正在运行的轮次，
   而不是下一轮队列，没有可接替的队列行，因此开关禁用。

开关状态按会话存在本机浏览器的 localStorage 里
（`dsh-supersede:enabled:<sessionId>`），不跨设备同步。「已被新消息接替」只
存在内存中：刷新页面后标记消失，被打断的轮次显示为普通停止。

**卸载。** 打开**插件**，找到本 bundle 并移除；控件与标记消失，发送行为恢复原生。

## Development / 开发

Tests: `node --test "bundle/**/*.test.js"` (Node's built-in runner, zero
dependencies). There is no build step: `bundle/` ships as plain classic scripts.

测试：`node --test "bundle/**/*.test.js"`（Node 内置测试运行器，零依赖）。
没有构建步骤：`bundle/` 直接以纯 classic script 分发。
