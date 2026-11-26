<div align="center">
  <img src="icon.svg" width="88" height="88" alt="Supersede">
  <h1>dsh-supersede · 接替</h1>
  <p>输入框里的按会话开关：一轮正在运行时，你发下一条消息，它立刻中止那一轮并开启新一轮，而不是在队列里排队。</p>
  <p>
    <a href="https://github.com/ximi-chen/dsh-supersede"><img alt="GitHub" src="https://img.shields.io/badge/GitHub-ximi--chen%2Fdsh--supersede-24292f?logo=github"></a>
    <img alt="license" src="https://img.shields.io/badge/license-MIT-3b82f6">
    <img alt="DSH" src="https://img.shields.io/badge/DSH-%E2%89%A50.2.2--rc.5%20%3C0.3.0-5b6cff">
    <img alt="tests" src="https://img.shields.io/badge/tests-29%20passing-16a34a">
    <img alt="runtime dependencies" src="https://img.shields.io/badge/runtime%20deps-0-6b7280">
  </p>
</div>

<div align="center"><a href="#为什么需要它">中文</a> · <a href="#english">English</a></div>

---

## 为什么需要它

DeepSeek Harness 的输入框只有两种投递方式：

- **排队** —— 消息等这一轮跑完再发。
- **插话** —— 消息并入正在运行的这一轮。

两种都不适合「我改主意了，刚才那一轮不用继续」：排队要等，插话会把新指令混进已经跑偏的旧轮里。

**接替**补上第三种：**中止当前轮，用这条新消息开启下一轮。**

## 它做什么

| 场景 | 原生行为 | 打开接替后 |
| --- | --- | --- |
| 轮次运行中，发送文字消息 | 进入队列，等这一轮结束 | 中止这一轮，用这条消息立刻开启下一轮 |
| 会话空闲时，发送消息 | 直接开启新一轮 | 完全相同，不会被接替 |
| 消息带附件或图片 | 进入队列 | 仍进入队列，当前轮继续跑 |

被中止的那一轮会标上「已被新消息接替」，你能看清是哪一轮被打断了。

## 在哪里

输入框工具行最左侧，一个「接替」按钮。默认关闭，点一下只在当前会话打开。

开关状态按会话存在本机浏览器的 `localStorage`（`dsh-supersede:enabled:<sessionId>`）：刷新后保持，其他会话不受影响，也不跨设备同步。

## 安装

**插件市场。** 等 [awesome-dsh-plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin) 收录合并后，在社区市场（dsh-market）搜索 **Supersede**。

**从 Discover 索引源。** 在 **插件 → 实验性插件** 里启用**自定义插件索引**，再到 **插件 → Discover → 索引源** 添加：

```
https://raw.githubusercontent.com/ximi-chen/dsh-supersede/main/plugin-index.json
```

**从 Git 安装。**

```sh
dsh plugin add "github:ximi-chen/dsh-supersede"
```

使用命名 profile 时加上 `--profile <name>`。要固定到某个发布提交，改用该提交的 `git+https` 规格。

**本地目录。** 在 DSH 里打开 **插件 → 添加插件** 并选择本目录，或调用 `plugin_manager` 的 `install_bundle` 传入绝对路径。

## 使用

1. 打开一个会话，点输入框工具行左侧的「接替」，旁边出现「接替中」标签。
2. 发送任意消息，让一轮开始跑。
3. 这一轮还在跑的时候再发一条消息——它中止当前轮，并以这条消息开启下一轮。

发送按钮仍然写着**「排队」**：核心对话包没有改动，输入框按原生投递方式提示，模式以「接替中」标签为准。

中止没成功时不会丢消息：取消被拒绝，提示「接替失败，消息仍在排队」，消息留在队列；重新投递失败，提示「接替失败，文字已放回输入框」，文字回到草稿。

## 前置条件

- **DSH Web 端**，版本 `>=0.2.2-rc.5 <0.3.0-0`。
- **忙碌回车必须为「排队」**。设为「插话」时消息会并入正在运行的轮次，没有可接替的队列行，开关禁用并提示原因。

## 已知限制

| 限制 | 说明 |
| --- | --- |
| 发送按钮文案不变 | 显示「排队」，模式由「接替中」标签提示。 |
| 只在排队模式下可用 | 「插话」模式开关禁用。 |
| 接替标记只存在页面内存 | 刷新后标记消失，被打断的轮次显示为普通停止。 |
| 单客户端使用 | 触发依据是本浏览器的提交记录。若另一个客户端往同一个空闲会话发消息，而它的队列行在轮次开启后才首次可见，插件无法归属这条行，仍可能误接替。 |

## 实现要点

纯客户端 bundle，不改核心对话包，零运行时依赖。

这一版 DSH 在用户取消后会保留队列行，但被中止的轮次直接收尾，不会自己续跑队列——只取消的话，消息会一直躺在队列里。所以取消被接受后，插件把触发这次接替的纯文本队列行取回，用新的 request id 重新投递一次，新一轮才真正跑起来。文字、顺序和模型上下文不变，只有这条消息的身份是新的；带附件或图片的消息无法重投，因此不参与接替。

设计取舍与更多限制见 [ADR 0001](docs/adr/0001-supersede-as-client-plugin.md)。

## 卸载

打开 **插件**，找到本 bundle 并移除。控件与标记消失，发送行为恢复原生。

## 开发

```sh
node --test client.core.test.js   # 或 npm test，29 个用例，Node 内置运行器，零依赖
```

没有构建步骤：包直接以纯 classic script 分发。

| 文件 | 作用 |
| --- | --- |
| `index.js` | bundle 入口 |
| `cordis.patch.yml` | 插件补丁 |
| `client.js` | 浏览器半边：开关、观察队列、取消与重投 |
| `client.core.js` | 纯判定逻辑：这一行该不该接替 |
| `locale/*.json` | 中英文案 |

市场索引在发布提交之后生成：

```sh
node scripts/make-index.mjs
```

问题与改动欢迎提到 [Issues](https://github.com/ximi-chen/dsh-supersede/issues)；提交前请先跑一遍上面的测试。

## English

**What it is.** A per-session **Supersede** switch for the [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) composer. Turn it on, and the next message you send while a turn is running cancels that turn and opens the next one with your message, instead of waiting in the queue. The interrupted turn is labelled “Superseded by a new message”. Messages you send while the session is idle start their own turn exactly as stock and are never superseded.

**Why.** DSH's composer offers two delivery modes: *queue* (wait for the turn to finish) and *steer* (merge into the running turn). Neither fits “never mind, drop what you were doing and do this instead”. Supersede is the third: cancel the turn, run the next one with the new message.

| Situation | Stock | With Supersede |
| --- | --- | --- |
| Send text while a turn runs | Queue until the turn ends | Cancel the turn, start the next one now |
| Send while idle | Start a turn | Identical — never superseded |
| Send with attachments or images | Queue | Still queued; the running turn continues |

**Where.** At the left of the composer's tool row, off by default, per session. The state lives in this browser's `localStorage` (`dsh-supersede:enabled:<sessionId>`): it survives a reload, does not affect other sessions, and is not synced across devices.

**Install.** From the community market (once the [awesome-dsh-plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin) listing is merged), from the index source above under **Plugins → Discover → Index sources**, or with:

```sh
dsh plugin add "github:ximi-chen/dsh-supersede"
```

Add `--profile <name>` for a named profile; pin a release with the commit's `git+https` spec. From a local checkout, use **Plugins → Add plugin** or `plugin_manager` `install_bundle`.

**Requirements.** DSH web, `>=0.2.2-rc.5 <0.3.0-0`, with **Busy Enter** set to *queue*. With *steer* the switch is disabled.

**Limits.**

- The send button still reads **Queue**: the core conversation package is untouched, so the composer keeps announcing the stock mode; the 「接替中」 chip is the real signal.
- The superseded-turn label is page memory only: a reload drops it and the turn reads as an ordinary stop.
- Use the switch in one client at a time. If another client prompts the same idle session and its queue row first becomes visible after the turn opened, the plugin cannot attribute the row and may still supersede that turn.

**Failure paths.** A rejected cancel leaves the message in the queue (“Supersede failed, message still queued”); a rejected re-submission restores the text to the draft (“Supersede failed, text put back in the input”).

**Implementation.** A pure client bundle: no core package changes, no runtime dependencies. This DSH build keeps pending queue rows after a user cancel but does not resume them, so after an accepted cancel the plugin takes the triggering plain-text row back from the queue and re-submits it with a new request id — that is the missing wake-up. Words, order and model context are unchanged; only the message identity is new. Rows carrying attachments or images cannot be re-submitted, so they stay queued and are not superseded.

**Uninstall.** Open **Plugins**, find this bundle and remove it: the switch and the label disappear and sending returns to stock behaviour.

**Development.** `node --test client.core.test.js` (or `npm test`) — Node's built-in runner, 29 tests, zero dependencies, no build step. The market index is generated after a release commit with `node scripts/make-index.mjs`. See [ADR 0001](docs/adr/0001-supersede-as-client-plugin.md) for the design and its documented limits. Issues and pull requests are welcome; run the tests before you send a change.

## License

[MIT](LICENSE)
