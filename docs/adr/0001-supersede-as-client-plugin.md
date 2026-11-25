# 会话级"接替"开关做成纯客户端插件，不改核心包

在"运行中发消息"这条路上，DSH 只有排队（`queue`）和插话（`steer`）两种语义，用户想要第三种：立刻中止当前轮次、以新消息重开。真正决定形态的事实是：模式判定坐在 `@deepseek-ai/dsh-client-ui-conversation` 内部（`BUSY_ENTER_BEHAVIORS` 是闭集），而这个包随应用出厂（`list_bundles` 里 `availability: installation`），不落在 profile 的 `node_modules` 里，插件市场装的包碰不到它。因此决定：做成**纯客户端插件**——会话级开关 + 观察队列新行 + `ctx.remote.session.cancel({sessionId})`——不去 fork 那个包。

## 考虑过的选项

- **fork `dsh-client-ui-conversation`，把第三个值加进 `BUSY_ENTER_BEHAVIORS`**：语义最干净，发送按钮的文案也能改对。但要靠 bundle 的 `overrides` 覆盖核心行，并长期追上游版本 rebase。放弃原因是维护成本，不是技术不可行。
- **客户端 + 宿主半边**（宿主监听 `agent/inbox/inserted`，进程内取消）：零竞态。但开关状态只能用会话命令（`ctx.remote.commands.execute`）传给宿主，会在斜杠菜单里多出一条命令；第三方包能否自建 Remote 端点也未经证实。
- **拦截提交流**：客户端没有提交扩展点——插件拿到的 `InputActions.submit()` 不带模式参数，而客户端事件只有 `connection/reset`、`locale/change`、`slots/changed`、`theme/change`。做不到。

## 后果

- 发送按钮仍显示"排队"，与实际行为不符；靠开关旁的"接替中"标签兜底。
- `cancel` 是一次远程往返，存在窄窗口可能误杀刚刚开跑的新轮；后果是"用户消息 + 一个空轮次"，重发即可。
- 接替留痕只存在浏览器内存，刷新页面后被打断的轮次会退回成普通中止。
- 队列行的"接替发送"做不了：队列行由会话 UI 自己渲染，行内没有插件槽。
