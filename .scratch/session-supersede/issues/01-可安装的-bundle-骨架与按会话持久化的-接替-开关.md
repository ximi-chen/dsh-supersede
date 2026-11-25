<!-- DSH-FORMAT: md-v1 -->
<!-- DSH-PARENT: 00 -->
<!-- DSH-LABELS: ready-for-agent -->
<!-- DSH-IDEMPOTENCY-KEY: deck-b283d9fc-5985305 -->
<!-- DSH-CREATED: 2026-11-25T07:28:45.036Z -->
# 01: 可安装的 bundle 骨架与按会话持久化的「接替」开关

**What to build:** 建立这个仓库里的私有客户端 bundle，并把它装进当前 profile：客户端入口立即加载，在输入框工具行左侧（`conversation.input.left`）注册一个紧凑的「接替」开关。开启时开关旁出现小号「接替中」文字 chip。开关状态按会话保存在浏览器本地：刷新页面保持，切换会话互不影响，新会话默认关闭；空白首页（无会话）不渲染控件。宿主半边是空 apply，只为满足 bundle 形态。这一张只证明「装得上、看得见、记得住」；开关开/关暂时不改变任何投递语义。

**Blocked by:** 无（可立即开始）

**Status:** resolved

- [ ] bundle 安装进当前 profile 后，刷新页面，任意会话的输入框工具行左侧出现「接替」开关；空白首页不出现。
- [ ] 打开开关后「接替中」chip 立即出现，关闭即消失；控件 `role="switch"`、`aria-checked` 随状态变化，键盘可达。
- [ ] 刷新页面后该会话仍保持原状态；另一个会话不受影响；新建会话默认关闭。
- [ ] 开关只用主题令牌，亮/暗主题下都像工具行的一部分；窄宽度工具行不破版。
- [ ] 新增可见文案全部走语言服务，zh 与 en 齐备。
- [ ] 客户端注册的资源在卸载/页面重载时被正确释放。

## Comments

### local — 2026-11-25T10:30:15.972Z
Implemented and merged as b7d51d7 (feature commit 0ea3458). Deliverable: build-free `@local/dsh-supersede` bundle with a per-session 「接替」 switch in the composer's left tool row, zh/en copy, and `localStorage` state keyed `dsh-supersede:enabled:<sessionId>`; installed into the profile with `application: applied`. Verified by `node --check`, manifest/asset assertions and reinstall; browser visual acceptance stays manual.

## 进度
