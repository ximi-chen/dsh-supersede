<!-- DSH-FORMAT: md-v1 -->
<!-- DSH-PARENT: 00 -->
<!-- DSH-LABELS: ready-for-agent -->
<!-- DSH-IDEMPOTENCY-KEY: deck-c463ad2b-5985305 -->
<!-- DSH-CREATED: 2026-11-25T07:29:00.968Z -->
<!-- DSH-BLOCKED-BY: 03 -->
# 05: 门禁与失败提示：steer 禁用、缺 API 回退排队、取消失败可见

**What to build:** 把开关在不能兑现时的形态做对，并让失败可见：忙碌回车偏好为「插话」时，开关禁用并以提示说明原因（此时消息根本不进队列，没有可观察的触发点）；拿不到会话绑定或取消权限时，控件隐藏或不动作；任何前置 API 缺失都退回原生排队，而不是让发送出问题。取消调用失败时，在槽位内显示短暂的「接替失败，消息仍在排队」，随后自行消失；不自动重试、不 arm 账本。

**Blocked by:** #03

**Status:** resolved

- [ ] 把忙碌回车设为「插话」：开关禁用，悬停/聚焦提示说明原因；改回排队后立即可用。
- [ ] 忙碌回车偏好读不到时按排队处理（不禁用）；拿不到会话绑定时不渲染控件；无取消权限时不发起取消。
- [ ] 任一前置 API 缺失时，运行中发消息仍是原生排队，发送本身不受影响。
- [ ] 人工制造或模拟一次取消失败：槽位内出现短暂失败提示，消息仍在队列，无重试，且该轮不出现「已被新消息接替」。
- [ ] 提示文案 zh/en 齐备、可被读屏读到（不只靠颜色）；提示细节不影响工具行布局。

## Comments

### local — 2026-11-25T10:30:19.234Z
Merged as 8aeb9c9 (feature commit 078188d). Deliverable: Busy-Enter `steer` renders the switch inert with a spoken reason while preserving the stored state; missing session binding or denied `session/cancel` hides the control (fail closed); a cancel that settles `{ok:false}` shows the transient 「接替失败，消息仍在排队」 status line, never retries and never arms the ledger. zh/en copy added, 27/27 suite green.

## 进度
