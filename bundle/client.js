/**
 * Client half of @local/dsh-supersede.
 *
 * While the switch is on and the session is running, the first observed
 * `next-turn` queue row cancels the running turn; the Host keeps the inbox, so
 * that row opens the next turn by itself.
 *
 * An accepted cancel arms a per-session, in-memory ledger for the turn that was
 * open at that moment; that turn's `turnTail` then shows 「已被新消息接替」 once
 * it closes `aborted`.
 *
 * The switch hides where it cannot act (no retained session binding, or the
 * peer may not cancel), disables itself with a readable reason while busy Enter
 * is `steer`, and a failed cancel shows a transient 「接替失败，消息仍在排队」
 * instead of pretending the message superseded.
 *
 * This is a classic script on purpose: the browser registers a lazy factory with
 * the shell's module loader and a bundle without a build step can only require
 * baseline modules, so the dictionaries live here. `locale/*.json` supplies the
 * plugin's display metadata and is not imported by this file.
 */
window.__ModuleLoader__.load({
  id: '@local/dsh-supersede',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    /** Dictionary namespace owned by this plugin. */
    const NS = 'dsh-supersede'
    /** Slot entry id; the slot is Session-scoped, so there is one per conversation. */
    const ENTRY_ID = 'dsh-supersede.toggle'
    /** Slot that holds the toolbar controls left of the composer input. */
    const SLOT = 'conversation.input.left'
    /** Slot rendered at the end of a closed turn, before its hover actions. */
    const TURN_TAIL_SLOT = 'conversation.chat.turnTail'
    /** Marker entry id; Session-scoped, one per closed turn in the chat. */
    const MARKER_ENTRY_ID = 'dsh-supersede.marker'
    /** How long the transient cancel-failure line stays on screen. */
    const FAILURE_VISIBLE_MS = 5000

    /** Simplified Chinese dictionary (the key-set source of truth). */
    const zh = {
      'toggle.label': '接替',
      'toggle.active': '接替中',
      'toggle.title': '运行中发送消息会立即中止当前轮，并用这条消息开启新一轮。',
      'toggle.ariaLabel': '接替：运行中发送消息会立即中止当前轮，并用这条消息开启新一轮。',
      'toggle.disabled.steer': '忙碌回车为「插话」时不适用接替',
      'toggle.failure': '接替失败，消息仍在排队',
      'toggle.failure.draft': '接替失败，文字已放回输入框',
      'marker.text': '已被新消息接替',
    }

    /** English dictionary, complete against the zh key set. */
    const en = {
      'toggle.label': 'Supersede',
      'toggle.active': 'Superseding',
      'toggle.title': 'While a turn is running, sending a message cancels the current turn and starts a new one with it.',
      'toggle.ariaLabel': 'Supersede: while a turn is running, sending a message cancels the current turn and starts a new one.',
      'toggle.disabled.steer': 'Not available while busy Enter is set to steer',
      'toggle.failure': 'Supersede failed; the message is still queued.',
      'toggle.failure.draft': 'Supersede failed; the text is back in the composer.',
      'marker.text': 'Superseded by a new message',
    }

    // =======================================================================
    // Per-session state
    //
    // The only persisted value is `enabled`, stored per session under
    // `dsh-supersede:enabled:<sessionId>`; a missing key means off. The queue
    // bookkeeping (`seen`) and the one-cancel-at-a-time flag (`inFlight`) stay
    // in this module's memory, so a reload starts from a blank verdict.
    // =======================================================================
    const STORAGE_PREFIX = 'dsh-supersede:enabled:'

    /**
     * sessionId (string) -> record; hydrated lazily, page-local.
     * `seen` holds every queue id already judged; `primed` says the first
     * observation of this page/plugin load already ran (its rows are a
     * baseline, never a supersede request); `inFlight` says one cancel request
     * is outstanding for this session; `ledger` says which turns, if any, this
     * session's accepted cancels marked (the core's `Ledger` shape);
     * `selfWake` holds the prompt request ids this plugin minted to restart
     * the queue, so its own wake rows are never mistaken for a new message.
     * @typedef {{ enabled: boolean, seen: Set<string>, primed: boolean, inFlight: boolean, ledger: { armed: readonly number[], marked: readonly number[] } | null, selfWake: Set<string> }} SessionRecord
     */
    const sessions = new Map()
    /** Components watching the map; one notification per change, no payload. */
    const watchers = new Set()
    /**
     * The decision core, resolved once by `apply`. Slot components mount only
     * after that point, which is what lets `ledgerOf` fall back to its frozen
     * empty ledger.
     * @type {object | null}
     */
    let core = null

    /** @param {unknown} sessionId @returns {string} */
    function storageKey(sessionId) {
      return STORAGE_PREFIX + String(sessionId)
    }

    /**
     * @param {unknown} sessionId
     * @returns {boolean} stored value, false when storage is denied or unreadable
     */
    function readStoredEnabled(sessionId) {
      try {
        return window.localStorage.getItem(storageKey(sessionId)) === '1'
      } catch {
        return false
      }
    }

    /**
     * @param {unknown} sessionId
     * @param {boolean} enabled
     * @returns {void}
     */
    function writeStoredEnabled(sessionId, enabled) {
      try {
        if (enabled) window.localStorage.setItem(storageKey(sessionId), '1')
        else window.localStorage.removeItem(storageKey(sessionId))
      } catch {
        // Denied storage still renders and still toggles for this page.
      }
    }

    /**
     * @param {unknown} sessionId
     * @returns {SessionRecord}
     */
    function stateOf(sessionId) {
      const key = String(sessionId)
      let state = sessions.get(key)
      if (state === undefined) {
        state = {
          enabled: readStoredEnabled(key),
          seen: new Set(),
          primed: false,
          inFlight: false,
          ledger: null,
          selfWake: new Set(),
        }
        sessions.set(key, state)
      }
      return state
    }

    /**
     * The record's ledger, or the core's frozen empty ledger until an accepted
     * cancel arms it.
     * @param {SessionRecord} state
     * @returns {{ armed: readonly number[], marked: readonly number[] }}
     */
    function ledgerOf(state) {
      return state.ledger ?? core.EMPTY_LEDGER
    }

    /**
     * Whether one queue row can be re-submitted verbatim: plain text only, so
     * the re-delivery carries the same words and no attachment reference that
     * a new prompt cannot express.
     * @param {readonly object[] | undefined} content
     * @returns {boolean}
     */
    function isTextOnly(content) {
      return Array.isArray(content) && content.length > 0
        && content.every((block) => block !== null && typeof block === 'object'
          && block.type === 'text' && typeof block.text === 'string' && block.text.trim() !== '')
    }

    /**
     * Plain text of one text-only row, for a draft fallback and for the
     * transient copy.
     * @param {readonly object[]} content
     * @returns {string}
     */
    function textOf(content) {
      return content.map((block) => block.text).join('\n\n')
    }

    /**
     * The prompt parts for one text-only row.
     * @param {readonly object[]} content
     * @returns {{ type: 'text', text: string }[]}
     */
    function textPartsOf(content) {
      return content.map((block) => ({ type: 'text', text: block.text }))
    }

    /**
     * A prompt request id this plugin owns. The Host echoes it on the durable
     * user message, which is how the self-wake row is recognized later.
     * @returns {string}
     */
    function newRequestId() {
      try {
        return window.crypto.randomUUID()
      } catch {
        return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
      }
    }

    /** @param {unknown} sessionId @returns {boolean} */
    function isEnabled(sessionId) {
      // No session means no switch (the slot itself is Session-scoped; this is
      // the defensive arm that must never mint an "undefined" storage key).
      if (sessionId === undefined || sessionId === null) return false
      return stateOf(sessionId).enabled
    }

    /**
     * @param {unknown} sessionId
     * @param {boolean} enabled
     * @returns {void}
     */
    function setEnabled(sessionId, enabled) {
      const state = stateOf(sessionId)
      if (state.enabled === enabled) return
      state.enabled = enabled
      writeStoredEnabled(sessionId, enabled)
      notifySessionState()
    }

    /**
     * Tell every mounted slot component that some session record changed. One
     * failing watcher must not starve the others.
     * @returns {void}
     */
    function notifySessionState() {
      for (const watcher of [...watchers]) {
        try {
          watcher()
        } catch (error) {
          console.error('dsh-supersede: state watcher failed', error)
        }
      }
    }

    /** @param {unknown} sessionId @returns {void} */
    function toggleEnabled(sessionId) {
      setEnabled(sessionId, !isEnabled(sessionId))
    }

    /**
     * @param {() => void} watcher
     * @returns {() => void} unsubscribe
     */
    function watchSessionState(watcher) {
      watchers.add(watcher)
      return () => {
        watchers.delete(watcher)
      }
    }
    // =======================================================================
    // End per-session state
    // =======================================================================

    /**
     * Follow one session's stored switch. A Session-scoped list cell can be
     * reused for another conversation after a session switch, so a changed
     * `sessionId` reads that session's own key during the render and the effect
     * below adopts it; a remount (`key`) is not the plugin's to force.
     * @param {unknown} sessionId
     * @returns {boolean}
     */
    function useSessionEnabled(sessionId) {
      const [enabled, setEnabledState] = React.useState(() => isEnabled(sessionId))
      const mountedFor = React.useRef(sessionId)
      const switched = mountedFor.current !== sessionId
      const current = switched ? isEnabled(sessionId) : enabled

      React.useEffect(() => {
        mountedFor.current = sessionId
        setEnabledState(isEnabled(sessionId))
      }, [sessionId])

      React.useEffect(
        () => watchSessionState(() => {
          setEnabledState(isEnabled(sessionId))
        }),
        [sessionId],
      )

      return current
    }

    /**
     * Presentation only: every colour is a `--dsw-alias-*` theme token and the
     * rules keep the composer's tool-row rhythm — a 24px control, a 20px chip
     * and 11–12px type. The stylesheet is injected once from `apply` and owned
     * by that effect, so unloading the plugin removes it with the rest.
     */
    const CSS = `
.dsh-supersede-root {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  flex: none;
  white-space: nowrap;
}

/* Text plus a small track, like the shipped toolbar controls. The switch is
 * never natively disabled: aria-disabled keeps it focusable and readable so
 * the reason stays reachable on hover and on focus. */
.dsh-supersede-toggle {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  box-sizing: border-box;
  height: 24px;
  margin: 0;
  padding: 0;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  font: inherit;
  font-size: 12px;
  line-height: 20px;
  white-space: nowrap;
  cursor: pointer;
  user-select: none;
}

.dsh-supersede-toggle[aria-checked='true'] {
  color: var(--dsw-alias-label-primary);
}

.dsh-supersede-toggle:hover:not([aria-disabled='true']) {
  color: var(--dsw-alias-label-primary);
}

.dsh-supersede-toggle:focus-visible {
  outline: 1px solid var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary));
  outline-offset: 2px;
}

.dsh-supersede-toggle[aria-disabled='true'] {
  color: var(--dsw-alias-label-dimmed);
  cursor: not-allowed;
}

.dsh-supersede-track {
  display: inline-flex;
  align-items: center;
  justify-content: flex-start;
  flex: none;
  box-sizing: border-box;
  width: 22px;
  height: 14px;
  padding: 2px;
  border-radius: 999px;
  background: var(--dsw-alias-border-l2);
}

.dsh-supersede-toggle[aria-checked='true'] .dsh-supersede-track {
  justify-content: flex-end;
  background: var(--dsw-alias-state-business-primary);
}

.dsh-supersede-thumb {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--dsw-alias-bg-layer-1);
}

.dsh-supersede-chip {
  display: inline-flex;
  align-items: center;
  flex: none;
  box-sizing: border-box;
  height: 20px;
  padding: 0 6px;
  border-radius: 999px;
  background: var(--dsw-alias-bg-module-platform);
  color: var(--dsw-alias-state-business-primary);
  font-size: 11px;
  line-height: 18px;
  white-space: nowrap;
}

/* No card chrome: it reads as a transient note. Nothing is reserved for it
 * and it may wrap inside the cell instead of widening the tool row. */
.dsh-supersede-failure {
  min-width: 0;
  color: var(--dsw-alias-state-error-primary);
  font-size: 11px;
  line-height: 18px;
  white-space: normal;
  overflow-wrap: anywhere;
}

/* A subdued line, not a card: no border, background, icon or click target,
 * so it reads as part of the turn tail and nothing shifts. */
.dsh-supersede-marker {
  display: flex;
  align-items: center;
  margin-top: 4px;
  color: var(--dsw-alias-label-tertiary);
  font-size: 12px;
  line-height: 18px;
}
`

    /**
     * Session-scoped supersede switch and its queue trigger.
     * Receives the standard session props (`useInput`, `useSession`, `useAccess`)
     * plus the locale seat (`t`) and this entry's injected face: the decision
     * core, the busy-Enter snapshot face, the per-session `cancelTurn`, and
     * `hasBinding` (whether this session still has a face to cancel through).
     * @param {object} props
     * @returns {object | null}
     */
    function SupersedeToggle(props) {
      const { sessionId, core, busyEnter, hasBinding, useInput, useSession, useAccess, useChat } = props
      const t = props.t
      const enabled = useSessionEnabled(sessionId)

      // Busy-Enter is a settings snapshot, not a hook context, so the plain
      // service shape feeds `useSyncExternalStore` directly.
      const busyEnterBehavior = React.useSyncExternalStore(
        busyEnter.subscribe,
        busyEnter.getSnapshot,
      )
      // `steer` means the message is merged into the running turn instead of
      // entering the queue, so there is no observable trigger: offer the switch
      // as inert with a reason instead of silently doing nothing.
      const gated = busyEnterBehavior === 'steer'
      const queue = useInput((state) => state.queue)
      const running = useSession((state) => state.running) ?? false
      const denied = useAccess('session/cancel') === false
      // The turn that is open right now. A cancel is accepted for *this*
      // number, which is what lets the marker tell our cancel apart from the
      // Stop button later: both close a turn `aborted`, only identity
      // distinguishes them. With no turn yet, arm "any next aborted turn" (0);
      // with the last turn already closed, do not arm at all (null), so a
      // manual Stop that closed the turn before the cancel response is never
      // marked.
      const openTurn = useChat((snapshot) => {
        const order = snapshot.timeline.turnOrder
        if (order.length === 0) return 0
        const last = order[order.length - 1]
        return snapshot.timeline.turns.get(last)?.status === 'open' ? last : null
      })

      // The injected `cancelTurn` closes over one session, so it can be a fresh
      // closure on every render; a ref keeps it out of the observation deps.
      const cancelTurn = React.useRef(props.cancelTurn)
      cancelTurn.current = props.cancelTurn
      // Same for the re-delivery face: its identity changes per session cell.
      const reopenRows = React.useRef(props.reopenRows)
      reopenRows.current = props.reopenRows
      // Async settles must not write into another session's composer.
      const liveSession = React.useRef(sessionId)
      liveSession.current = sessionId

      // A cancel that settles `{ ok: false }` (or throws) must be visible, but
      // only for a moment: the message is still queued and the user may act.
      const [failure, setFailure] = React.useState(null)
      const failureTimer = React.useRef(null)
      // The observation effect calls this without taking it as a dependency;
      // assigning the ref each render keeps the latest `setFailure` in play.
      const showFailure = React.useRef(() => {})
      showFailure.current = (key = 'toggle.failure') => {
        setFailure(key)
        if (failureTimer.current !== null) clearTimeout(failureTimer.current)
        failureTimer.current = setTimeout(() => {
          failureTimer.current = null
          setFailure(null)
        }, FAILURE_VISIBLE_MS)
      }

      // A reused cell must not carry another session's failure line, and an
      // unmount must not leave a timer that calls `setFailure` on nothing.
      React.useEffect(() => {
        setFailure(null)
        if (failureTimer.current !== null) {
          clearTimeout(failureTimer.current)
          failureTimer.current = null
        }
        return () => {
          if (failureTimer.current !== null) {
            clearTimeout(failureTimer.current)
            failureTimer.current = null
          }
        }
      }, [sessionId])

      // One verdict per observed snapshot. Everything written here is module
      // memory, never React state, so a verdict cannot schedule a render, and
      // a render never cancels by itself.
      React.useEffect(() => {
        if (sessionId === undefined || sessionId === null) return

        const state = stateOf(sessionId)
        const allRows = queue ?? []
        // Rows this plugin re-submitted to restart the queue are delivery
        // machinery, not a new user message: keep them out of the verdict.
        const visible = allRows.filter((row) => !state.selfWake.has(row.source?.rpcId))
        if (!state.primed) {
          // First observation after this page/plugin load: rows already in the
          // Host inbox were queued before the plugin watched, so they are a
          // baseline (normally empty). Record them and never retroactively fire.
          state.primed = true
          state.seen = new Set(visible.map((row) => row.id))
          return
        }

        const newRows = visible.filter((row) => !state.seen.has(row.id))
        const decision = core.decideSupersede({
          enabled,
          busyEnter: busyEnterBehavior,
          running,
          canCancel: !denied,
          queue: visible,
          seen: state.seen,
          cancelInFlight: state.inFlight,
        })
        // The decision's `seen` is the whole observed snapshot, so this records
        // every id and resets the set when the queue empties. Ids are recorded
        // even when nothing is cancelled: flipping the switch later must not
        // retroactively fire on rows that were already queued.
        state.seen = new Set(decision.seen)
        if (!decision.cancel) return

        // This Host build does not resume pending inbox work after a user
        // cancel: the aborted driver ends and the queued rows would sit idle.
        // Only a prompt admitted after the abort latches a wake, so a supersede
        // also re-delivers the plain-text rows it is about to strand. Rows with
        // attachments cannot be re-expressed as prompt parts; when none of the
        // new rows is plain text, leave the stock queue behaviour untouched.
        if (!newRows.some((row) => isTextOnly(row.content))) {
          console.warn('dsh-supersede: no text-only row can restart the turn; leaving the queue untouched')
          return
        }

        state.inFlight = true
        // Captured before the request leaves: the ledger must name the turn
        // that was open when we asked, not whatever opens after it.
        const armedFor = openTurn
        let request
        try {
          request = cancelTurn.current()
        } catch (error) {
          console.warn('dsh-supersede: cancel failed', error)
          state.inFlight = false
          showFailure.current()
          return
        }
        // Fire and settle: never retry the cancel. Once accepted, re-deliver
        // the triggering message so the queued turn actually starts.
        Promise.resolve(request)
          .then(async (result) => {
            if (result !== undefined && result !== null && result.ok === false) {
              console.warn('dsh-supersede: cancel failed', result.error && result.error.code)
              // The queued message did not supersede anything: say so, and
              // leave the ledger untouched so no turn can be marked.
              showFailure.current()
              return
            }
            // Accepted: a void request or a non-failing result. Arm until that
            // turn closes; a failed cancel leaves the ledger untouched, so it
            // can never mark a turn.
            if (armedFor !== null && armedFor !== undefined) {
              state.ledger = core.armLedger(ledgerOf(state), armedFor)
              notifySessionState()
            }
            const stranded = await reopenRows.current(newRows)
            if (stranded.length === 0) return
            // The row left the queue but could not be re-submitted: give the
            // words back rather than dropping them silently.
            console.warn('dsh-supersede: could not re-submit the message; restored the draft')
            if (liveSession.current === sessionId) {
              showFailure.current('toggle.failure.draft')
              try {
                props.inputActions.setDraft(stranded.join('\n\n'))
              } catch (error) {
                console.warn('dsh-supersede: could not restore the draft', error)
              }
            }
          })
          .catch((error) => {
            console.warn('dsh-supersede: cancel failed', error)
            showFailure.current()
          })
          .finally(() => {
            state.inFlight = false
          })
      }, [queue, running, denied, enabled, busyEnterBehavior, openTurn, sessionId])

      // Hooks are all above this line; the following are plain early exits.
      // No session, no retained binding, or no cancel permission means the
      // switch could not act, so it is not offered at all (the shipped UI
      // treats a denied cancel as "offer no control").
      if (sessionId === undefined || sessionId === null) return null
      if (!hasBinding()) return null
      if (denied) return null

      const reason = t('toggle.disabled.steer')
      const toggle = () => {
        // Gating is presentation only: the stored value is untouched, so
        // switching busy Enter back to `queue` restores the old state at once.
        if (gated) return
        toggleEnabled(sessionId)
      }
      const onKeyDown = (event) => {
        // A native button activates on Enter/Space by dispatching a click; for
        // `aria-disabled` it stays focusable, so block that activation too.
        if (!gated) return
        if (event.key === 'Enter' || event.key === ' ' || event.key === 'Spacebar') {
          event.preventDefault()
        }
      }

      return h(
        'span',
        { className: 'dsh-supersede-root', 'data-dsh-supersede': 'toggle' },
        h(
          'button',
          {
            type: 'button',
            role: 'switch',
            className: 'dsh-supersede-toggle',
            'aria-checked': enabled,
            'aria-disabled': gated ? true : undefined,
            'aria-label': gated ? reason : t('toggle.ariaLabel'),
            title: gated ? reason : t('toggle.title'),
            tabIndex: 0,
            onClick: toggle,
            onKeyDown,
          },
          h(
            'span',
            { className: 'dsh-supersede-track', 'aria-hidden': true },
            h('span', { className: 'dsh-supersede-thumb' }),
          ),
          h('span', null, t('toggle.label')),
        ),
        // The chip states the mode, not the ability to trigger it: it stays
        // visible under `steer` while the switch itself explains its gate.
        enabled
          ? h(
            'span',
            {
              className: 'dsh-supersede-chip',
              'data-dsh-supersede': 'active',
              title: t('toggle.title'),
            },
            t('toggle.active'),
          )
          : null,
        failure
          ? h(
            'span',
            {
              role: 'status',
              'aria-live': 'polite',
              className: 'dsh-supersede-failure',
              'data-dsh-supersede': 'failure',
            },
            t(failure),
          )
          : null,
      )
    }

    /**
     * 「已被新消息接替」 on the turn a supersede actually interrupted.
     *
     * Every closed turn renders this entry at its tail. Observing a turn is a
     * ledger transition, not a render decision: an accepted cancel armed the
     * ledger for the turn that was open then, and only that turn may be marked
     * — and only when it closed `aborted`. The mark lives in this module's
     * memory, so a reload drops it and the interrupted turn reads as a plain
     * abort again.
     * @param {object} props owner `{ turn, seq }` plus standard session props
     * @returns {object | null}
     */
    function SupersededMarker(props) {
      const { sessionId, core, turn } = props
      const t = props.t
      const [, rerender] = React.useReducer((count) => count + 1, 0)
      const known = sessionId === undefined || sessionId === null ? null : stateOf(sessionId)
      // The cancel response can resolve before *or* after this entry mounts.
      // Reading the ledger identity during the render makes the observe effect
      // below react to the arm itself, not only to the turn identity, so a
      // turn that closed early is still marked when the arm lands late.
      const ledger = known === null ? null : ledgerOf(known)

      // The button writes the ledger; this keeps the mark rendered when the
      // arming lands before or after this entry mounts.
      React.useEffect(() => watchSessionState(() => rerender()), [])

      React.useEffect(() => {
        if (known === null) return
        const current = ledgerOf(known)
        // `turn.end` is the whole observed `turn/end`; `aborted` is the live
        // cancel vocabulary. `interrupted` is crash recovery only and is never
        // produced by our cancel, so it must not mark.
        const next = core.observeTurn(current, {
          turn: turn.turn,
          reasonKind: turn.end?.data?.reason?.kind,
        })
        if (next.ledger === current) return
        known.ledger = next.ledger
        notifySessionState()
      }, [sessionId, turn.turn, ledger])

      if (known === null) return null
      if (!core.isMarked(ledgerOf(known), turn.turn)) return null

      return h(
        'span',
        {
          role: 'note',
          className: 'dsh-supersede-marker',
          'data-dsh-supersede': 'marker',
        },
        t('marker.text'),
      )
    }

    return {
      inject: ['slots', 'sessions', 'locale', 'configForms'],
      /**
       * Load the decision core, then register the dictionaries and the switch.
       * Nothing is registered before the chunk resolves: a missing chunk leaves
       * stock DSH behaviour untouched (fail closed). The dictionaries live in
       * this entry's `ctx.effect`, so unloading the plugin removes them;
       * `ctx.slots.inject` owns the entry through the caller fiber's effect and
       * disposes both the wait and the contribution.
       * @param {object} ctx client plugin context
       * @returns {Promise<void>}
       */
      async apply(ctx) {
        try {
          core = await require.async('./client.core.js')
        } catch (error) {
          console.warn('dsh-supersede: decision core failed to load', error)
          return
        }

        ctx.effect(
          () => ctx.locale.register(NS, { zh, en }),
          'dsh-supersede: dictionaries',
        )
        // One stylesheet for both entries, owned by this effect. `data-plugin`
        // is also the loader's teardown handle, so an unload removes the tag
        // even when this cleanup never runs.
        ctx.effect(() => {
          const tag = document.createElement('style')
          tag.dataset.plugin = '@local/dsh-supersede'
          tag.dataset.pluginCss = '@local/dsh-supersede/styles.css'
          tag.textContent = CSS
          document.head.appendChild(tag)
          return () => {
            tag.remove()
          }
        }, 'dsh-supersede: stylesheet')

        // Busy-Enter is read once; two stable bound methods are all the slot
        // component needs. `form.getSnapshot`/`form.subscribe` use `this`, so
        // they are always called on the form object, never destructured.
        const form = ctx.configForms.get('ui-conversation')
        const busyEnter = {
          subscribe: (listener) => form.subscribe(listener),
          getSnapshot: () => form.getSnapshot().value?.busyEnter ?? 'queue',
        }

        /**
         * Ask the session face to cancel the running turn.
         * Never `ctx.conversation.cancel`: that path throws and records
         * `promptError`. A missing binding is a local failure, not a throw.
         * @param {unknown} sessionId
         * @returns {Promise<object> | object} RemoteResult or a no-binding failure
         */
        const cancelTurn = (sessionId) => {
          const binding = ctx.sessions.binding(sessionId)
          if (binding === undefined) return { ok: false, error: { code: 'no-binding' } }
          return binding.session.cancel()
        }

        /**
         * Re-submit plain-text queue rows after an accepted cancel. The Host
         * does not resume pending inbox work after a user cancel, so the
         * aborted driver would leave them idle; a prompt admitted now latches
         * the wake that starts the next turn. Rows are taken back first so the
         * same words never run twice. Non-text rows stay queued and are claimed
         * by that wake in FIFO order.
         * @param {unknown} sessionId
         * @param {readonly object[]} rows
         * @returns {Promise<string[]>} texts that could not be re-submitted
         */
        const reopenRows = async (sessionId, rows) => {
          const binding = ctx.sessions.binding(sessionId)
          if (binding === undefined) return []
          const state = stateOf(sessionId)
          const failed = []
          for (const row of rows) {
            if (!isTextOnly(row.content)) continue
            const requestId = newRequestId()
            // Recorded before the prompt so its echo can never look like a new
            // user message and trigger a second cancel.
            state.selfWake.add(requestId)
            let removed
            try {
              removed = await binding.session.updateQueue(row.id, { kind: 'remove' })
            } catch (error) {
              console.warn('dsh-supersede: could not take back the queued row', error)
              state.selfWake.delete(requestId)
              continue
            }
            if (removed === undefined || removed.ok !== true) {
              // Something claimed it already: the message is not lost.
              state.selfWake.delete(requestId)
              continue
            }
            try {
              const sent = await binding.session.prompt(textPartsOf(row.content), 'queue', undefined, requestId)
              if (sent !== undefined && sent.ok === false) {
                console.warn('dsh-supersede: re-delivery rejected', sent.error && sent.error.code)
                state.selfWake.delete(requestId)
                failed.push(textOf(row.content))
              }
            } catch (error) {
              console.warn('dsh-supersede: re-delivery failed', error)
              state.selfWake.delete(requestId)
              failed.push(textOf(row.content))
            }
          }
          return failed
        }

        ctx.slots.inject(SLOT, () => ctx.slots.register({
          name: SLOT,
          id: ENTRY_ID,
          order: 10,
          locale: NS,
          inject: (sessionId) => ({
            core,
            busyEnter,
            cancelTurn: () => cancelTurn(sessionId),
            // Re-delivery for the queue rows the cancel would otherwise strand.
            reopenRows: (rows) => reopenRows(sessionId, rows),
            // The switch is only offered while the session still has a face to
            // cancel through; a missing binding is hidden, not shown broken.
            hasBinding: () => ctx.sessions.binding(sessionId) !== undefined,
          }),
        }, SupersedeToggle))

        // `order: 100` places the marker after the shipped turn-tail cards and
        // before the turn's action row: last, where a note about the whole turn
        // belongs, without moving anything that was already there.
        ctx.slots.inject(TURN_TAIL_SLOT, () => ctx.slots.register({
          name: TURN_TAIL_SLOT,
          id: MARKER_ENTRY_ID,
          order: 100,
          locale: NS,
          inject: () => ({ core }),
        }, SupersededMarker))
      },
    }
  },
})
