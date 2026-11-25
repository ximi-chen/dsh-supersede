# dsh-supersede

A private DSH client bundle that adds a per-session 「接替」/“Supersede” switch to the
left of the composer toolbar. While a turn is running, sending a message should
cancel that turn and start a new one with the message, instead of waiting its
turn in the queue.

## Install

Install this directory as a local bundle — **Plugins** > **Add plugin** in the
app, or `plugin_manager` `install_bundle` with the absolute path of `bundle/`.
The patch inserts one row (`dsh-supersede`); uninstalling or disabling it removes
the switch and leaves no residue, because the only persisted value is a
localStorage key.

## What this version does

- Renders the switch in `conversation.input.left`: `role="switch"`, `aria-checked`,
  keyboard operable (Enter/Space), with a title/aria-label explaining the effect.
- Shows the 「接替中」/“Superseding” chip next to it while it is on.
- Remembers the switch **per session** in localStorage under
  `dsh-supersede:enabled:<sessionId>`: a reload keeps it, another session is
  unaffected, and a new session starts off.

This is the skeleton ticket: the switch currently does **not** change how a
message is delivered. The turn trigger, the 「已被新消息接替」 turn marker, and
the gates arrive in later tickets.

## Limitations

1. **The send button still says 「排队」/“queue”.** The core conversation package is
   not modified, so the composer keeps announcing the stock delivery mode.
2. **Only works when the busy-Enter preference is 「排队」/“queue”.** With 「插话」/“steer”,
   a message sent during a run goes to the next step instead of the next-turn
   queue, so there is no queued message for the switch to act on.
