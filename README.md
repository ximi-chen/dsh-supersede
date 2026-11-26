# dsh-supersede

A per-session **Supersede** switch for the [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) composer. While a turn is running, the next message you send cancels that turn and opens the next one with your message. Messages sent while the session is idle behave exactly like stock.

MIT licensed. No build step, no runtime dependencies.

## Install / 安装

**Plugin market / 插件市场.** After the [awesome-dsh-plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin) listing is merged, search for **Supersede** in the community market (dsh-market). For DSH's own **Discover** tab, enable **Custom plugin indexes** under **Plugins → Experimental plugins**, then add this index source under **Plugins → Discover → Index sources**:

```
https://raw.githubusercontent.com/ximi-chen/dsh-supersede/main/plugin-index.json
```

**From Git / 从 Git 安装.**

```sh
dsh plugin add "github:ximi-chen/dsh-supersede"
```

Add `--profile <name>` when you use a named profile. To pin a release commit, use the commit's `git+https` spec instead.

**From a local checkout / 本地目录.** In DSH, open **Plugins → Add plugin** and choose this directory, or call `plugin_manager` `install_bundle` with the absolute path.

## English

**What it does.** Turn the switch on in a conversation: while a turn is running, the next message you send cancels that turn and opens the next one with your message, instead of waiting in the queue. The interrupted turn is labelled “Superseded by a new message”. A message you send from this composer while the session is idle starts its own turn as usual and is never superseded: the switch only acts on messages sent while a turn is already running.

**Where.** At the left of the composer's tool row, inside the conversation input area. It is off by default. Click it to turn it on for that session only; a reload keeps it, and other sessions are unaffected.

**Two limits.**

1. The send button still shows **Queue**. The core conversation package is not modified, so the composer keeps announcing the stock delivery mode.
2. It only works when **Busy Enter** is set to queue. With **Steer**, the message is merged into the running turn instead of the next-turn queue, so there is nothing to supersede and the switch is disabled.

**Why the message is re-delivered.** This DSH build keeps pending queue rows after a user cancel, but the aborted turn ends without resuming them, so a plain cancel would leave your message sitting in the queue. After an accepted cancel the plugin therefore takes the triggering plain-text rows back from the queue and re-submits them, which is what actually starts the next turn. The words, order and model context are the same; the row gets a new message identity. A message carrying attachments or images is not superseded: it stays queued and the running turn continues.

The switch state lives in this browser's localStorage, per session (`dsh-supersede:enabled:<sessionId>`); it is not synced across devices. The superseded-turn label is in memory only: reloading the page drops it, and the interrupted turn reads as an ordinary stop.

**Uninstall.** Open **Plugins**, find this bundle and remove it. The switch and the label disappear, and sending returns to stock behaviour.

## 中文

**作用。** 在会话里打开开关后，运行中发送的下一条消息会中止当前轮，并用这条消息开启新一轮，而不是在队列里等待；被中止的那一轮会标上「已被新消息接替」。你在这个输入框里、会话空闲时发送的消息照常开启它自己的那一轮，不会被接替：开关只对「发送时已经有轮次在跑」的消息生效。

**位置。** 输入框工具行左侧，默认关闭。点一下只在当前会话打开，刷新后保持，其他会话不受影响。

**两条限制。**

1. 发送按钮仍显示**「排队」**。核心对话包没有改动，输入框仍按原生投递方式提示。
2. 仅当**忙碌回车**为「排队」时生效。设为「插话」时消息会并入正在运行的轮次，而不是下一轮队列，没有可接替的队列行，因此开关禁用。

**为什么消息会被重新投递。** 这一版 DSH 在用户取消后会把队列行保留下来，但被中止的轮次直接收尾，不会自己续跑队列——只取消的话，你的消息会一直躺在队列里。所以插件在取消被接受后，把触发这次接替的纯文本队列行取回并重新投递一次，新一轮才真正跑起来。文字、顺序和模型上下文不变，只是这一行会换一个新的消息身份。带附件或图片的消息不参与接替：它会留在队列里，当前轮继续跑。

开关状态按会话存在本机浏览器的 localStorage 里（`dsh-supersede:enabled:<sessionId>`），不跨设备同步。「已被新消息接替」只存在内存中：刷新页面后标记消失，被打断的轮次显示为普通停止。

**卸载。** 打开**插件**，找到本 bundle 并移除；控件与标记消失，发送行为恢复原生。

## Known limits / 已知限制

- The send label stays **Queue**; the switch's own 「接替中」 chip is the only composer-side signal. / 发送按钮仍显示「排队」，输入框侧只有「接替中」标签提示模式。
- **Busy Enter** must be **queue**; with **steer** the switch is disabled. / **忙碌回车**必须是「排队」；设为「插话」时开关禁用。
- The superseded-turn label is page memory only; a reload drops it. / 接替标记只存在页面内存里，刷新即失效。
- The trigger is this browser's own submission. If another client prompts the same idle session and its row first becomes visible after the turn opened, this plugin cannot attribute the row and may still supersede that turn; use the switch in one client at a time. / 触发依据是本浏览器的提交记录；如果另一个客户端往同一个空闲会话发消息，而它的队列行在轮次开启后才首次可见，插件无法归属这条行，仍可能误接替。请同一时间只在一个客户端使用开关。

## Development / 开发

Tests: `node --test client.core.test.js` (or `npm test`) — Node's built-in runner, zero dependencies. There is no build step: the package ships as plain classic scripts.

测试：`node --test client.core.test.js`（或 `npm test`）——Node 内置测试运行器，零依赖。没有构建步骤：包直接以纯 classic script 分发。

The market index is generated after a release commit:

```sh
node scripts/make-index.mjs
```

See [docs/adr/0001-supersede-as-client-plugin.md](docs/adr/0001-supersede-as-client-plugin.md) for the design and its documented limits.

## License

[MIT](LICENSE)
