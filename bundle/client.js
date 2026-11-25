/**
 * Client half of @local/dsh-supersede.
 *
 * Ticket 03: the switch is live. While it is on and the session is running, the
 * first observed `next-turn` queue row cancels the running turn; the Host keeps
 * the inbox, so that row opens the next turn by itself.
 *
 * Ticket 04: an accepted cancel arms a per-session, in-memory ledger for the
 * turn that was open at that moment; that turn's `turnTail` then shows
 * 「已被新消息接替」 once it closes `aborted`. The busy-Enter / failure gates
 * belong to later tickets.
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

    /** Simplified Chinese dictionary (the key-set source of truth). */
    const zh = {
      'toggle.label': '接替',
      'toggle.active': '接替中',
      'toggle.title': '运行中发送消息会立即中止当前轮，并用这条消息开启新一轮。',
      'toggle.ariaLabel': '接替：运行中发送消息会立即中止当前轮，并用这条消息开启新一轮。',
      'marker.text': '已被新消息接替',
    }

    /** English dictionary, complete against the zh key set. */
    const en = {
      'toggle.label': 'Supersede',
      'toggle.active': 'Superseding',
      'toggle.title': 'While a turn is running, sending a message cancels the current turn and starts a new one with it.',
      'toggle.ariaLabel': 'Supersede: while a turn is running, sending a message cancels the current turn and starts a new one.',
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
     * is outstanding for this session; `ledger` says which turn, if any, this
     * session's accepted cancel marked.
     * @typedef {{ enabled: boolean, seen: Set<string>, primed: boolean, inFlight: boolean, ledger: { armedFor: number | null, marked: readonly number[] } | null }} SessionRecord
     */
    const sessions = new Map()
    /** Components watching the map; one notification per change, no payload. */
    const watchers = new Set()
    /**
     * The core's frozen `EMPTY_LEDGER`. The chunk only resolves inside `apply`,
     * and the ledger must not be imported here, so this is adopted there; every
     * record is created by a mounted slot component, which exists after that.
     * @type {{ armedFor: number | null, marked: readonly number[] } | null}
     */
    let emptyLedger = null

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
          ledger: emptyLedger,
        }
        sessions.set(key, state)
      }
      return state
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

    /** Tool-row geometry; colors come only from `--dsw-alias-*` theme tokens. */
    const styles = {
      root: {
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        minWidth: 0,
      },
      toggleButton: {
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        boxSizing: 'border-box',
        height: 24,
        margin: 0,
        padding: '0 8px',
        border: '1px solid var(--dsw-alias-border-l2)',
        borderRadius: 999,
        background: 'var(--dsw-alias-bg-layer-1)',
        color: 'var(--dsw-alias-label-secondary)',
        font: 'inherit',
        fontSize: 12,
        lineHeight: '20px',
        whiteSpace: 'nowrap',
        cursor: 'pointer',
        userSelect: 'none',
      },
      toggleButtonOn: {
        borderColor: 'var(--dsw-alias-state-business-primary)',
        color: 'var(--dsw-alias-label-primary)',
      },
      track: {
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'flex-start',
        flex: '0 0 auto',
        boxSizing: 'border-box',
        width: 22,
        height: 14,
        padding: 2,
        borderRadius: 999,
        background: 'var(--dsw-alias-border-l3)',
      },
      trackOn: {
        justifyContent: 'flex-end',
        background: 'var(--dsw-alias-state-business-primary)',
      },
      thumb: {
        width: 10,
        height: 10,
        borderRadius: 999,
        background: 'var(--dsw-alias-switch-thumb)',
      },
      chip: {
        display: 'inline-flex',
        alignItems: 'center',
        boxSizing: 'border-box',
        height: 20,
        padding: '0 6px',
        borderRadius: 999,
        background: 'var(--dsw-alias-bg-layer-2)',
        color: 'var(--dsw-alias-state-business-primary)',
        fontSize: 11,
        lineHeight: '18px',
        whiteSpace: 'nowrap',
      },
      // A subdued line, not a card: no border, background, icon or click
      // target, so it reads as part of the turn tail and nothing shifts.
      marker: {
        display: 'inline-flex',
        alignItems: 'center',
        marginTop: 4,
        color: 'var(--dsw-alias-label-tertiary)',
        fontSize: 12,
        lineHeight: '18px',
      },
    }

    /**
     * Session-scoped supersede switch and its queue trigger.
     * Receives the standard session props (`useInput`, `useSession`, `useAccess`)
     * plus the locale seat (`t`) and this entry's injected face: the decision
     * core, the busy-Enter snapshot face, and the per-session `cancelTurn`. The
     * injected `translate` is the same namespace's bound translator, kept as a
     * fallback because a `t` prop cannot be injected over the locale seat.
     * @param {object} props
     * @returns {object | null}
     */
    function SupersedeToggle(props) {
      const { sessionId, core, busyEnter, useInput, useSession, useAccess, useChat } = props
      const t = props.t ?? props.translate
      const enabled = useSessionEnabled(sessionId)

      // Busy-Enter is a settings snapshot, not a hook context, so the plain
      // service shape feeds `useSyncExternalStore` directly.
      const busyEnterBehavior = React.useSyncExternalStore(
        busyEnter.subscribe,
        busyEnter.getSnapshot,
      )
      const queue = useInput((state) => state.queue)
      const running = useSession((state) => state.running) ?? false
      const denied = useAccess('session/cancel') === false
      // The turn that is open right now. A cancel is accepted for *this*
      // number, which is what lets the marker tell our cancel apart from the
      // Stop button later: both close a turn `aborted`, only identity
      // distinguishes them. Without a chat target the snapshot has no turns.
      const openTurn = useChat((snapshot) => {
        const order = snapshot.timeline.turnOrder
        return order.length === 0 ? null : order[order.length - 1]
      })

      // The injected `cancelTurn` closes over one session, so it can be a fresh
      // closure on every render; a ref keeps it out of the observation deps.
      const cancelTurn = React.useRef(props.cancelTurn)
      cancelTurn.current = props.cancelTurn

      // One verdict per observed snapshot. Everything written here is module
      // memory, never React state, so a verdict cannot schedule a render, and
      // a render never cancels by itself.
      React.useEffect(() => {
        if (sessionId === undefined || sessionId === null) return

        const state = stateOf(sessionId)
        if (!state.primed) {
          // First observation after this page/plugin load: rows already in the
          // Host inbox were queued before the plugin watched, so they are a
          // baseline (normally empty). Record them and never retroactively fire.
          state.primed = true
          state.seen = new Set((queue ?? []).map((row) => row.id))
          return
        }

        const decision = core.decideSupersede({
          enabled,
          busyEnter: busyEnterBehavior,
          running,
          canCancel: !denied,
          queue: queue ?? [],
          seen: state.seen,
          cancelInFlight: state.inFlight,
        })
        // The decision's `seen` is the whole observed snapshot, so this records
        // every id and resets the set when the queue empties. Ids are recorded
        // even when nothing is cancelled: flipping the switch later must not
        // retroactively fire on rows that were already queued.
        state.seen = new Set(decision.seen)
        if (!decision.cancel) return

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
          return
        }
        // Fire and settle: never await here, never retry. The Host keeps the
        // inbox, so the queued message opens the next turn on its own.
        Promise.resolve(request)
          .then((result) => {
            if (result !== undefined && result !== null && result.ok === false) {
              console.warn('dsh-supersede: cancel failed', result.error && result.error.code)
              return
            }
            // Accepted: a void request or a non-failing result. Arm until that
            // turn closes; a failed cancel leaves the ledger untouched, so it
            // can never mark a turn.
            if (armedFor === null || armedFor === undefined) return
            state.ledger = core.armLedger(state.ledger ?? core.EMPTY_LEDGER, armedFor)
            notifySessionState()
          })
          .catch((error) => {
            console.warn('dsh-supersede: cancel failed', error)
          })
          .finally(() => {
            state.inFlight = false
          })
      }, [queue, running, denied, enabled, busyEnterBehavior, openTurn, sessionId])

      if (sessionId === undefined || sessionId === null) return null

      const toggle = () => {
        toggleEnabled(sessionId)
      }

      return h(
        'span',
        { style: styles.root, 'data-dsh-supersede': 'toggle' },
        h(
          'button',
          {
            type: 'button',
            role: 'switch',
            'aria-checked': enabled,
            'aria-label': t('toggle.ariaLabel'),
            title: t('toggle.title'),
            tabIndex: 0,
            style: enabled ? { ...styles.toggleButton, ...styles.toggleButtonOn } : styles.toggleButton,
            onClick: toggle,
          },
          h(
            'span',
            { style: enabled ? { ...styles.track, ...styles.trackOn } : styles.track, 'aria-hidden': true },
            h('span', { style: styles.thumb }),
          ),
          h('span', null, t('toggle.label')),
        ),
        enabled
          ? h(
            'span',
            { style: styles.chip, 'data-dsh-supersede': 'active', title: t('toggle.title') },
            t('toggle.active'),
          )
          : null,
      )
    }

    /**
     * 「已被新消息接替」 on the turn a supersede actually interrupted.
     *
     * Every closed turn renders this entry at its tail. Observing a turn is a
     * ledger transition, not a render decision: the button's cancel armed the
     * ledger for one turn number, and only that turn may be marked — and only
     * when it closed `aborted`. The mark lives in this module's memory, so a
     * reload drops it and the interrupted turn reads as a plain abort again.
     * @param {object} props owner `{ turn, seq }` plus standard session props
     * @returns {object | null}
     */
    function SupersededMarker(props) {
      const { sessionId, core, turn } = props
      const t = props.t ?? props.translate
      const [, rerender] = React.useReducer((count) => count + 1, 0)
      const known = sessionId === undefined || sessionId === null ? null : stateOf(sessionId)
      // The cancel response can resolve before *or* after this entry mounts.
      // Reading the armed number during the render makes the observe effect
      // below react to the arm itself, not only to the turn identity, so a
      // turn that closed early is still marked when the arm lands late.
      const armedFor = known === null ? null : known.ledger?.armedFor ?? null

      // The button writes the ledger; this keeps the mark rendered when the
      // arming lands before or after this entry mounts.
      React.useEffect(() => watchSessionState(() => rerender()), [])

      React.useEffect(() => {
        if (known === null) return
        // `turn.end` is the whole observed `turn/end`; `aborted` is the live
        // cancel vocabulary. `interrupted` is crash recovery only and is never
        // produced by our cancel, so it must not mark.
        const next = core.observeTurn(known.ledger ?? core.EMPTY_LEDGER, {
          turn: turn.turn,
          reasonKind: turn.end?.data?.reason?.kind,
        })
        if (next.ledger === (known.ledger ?? core.EMPTY_LEDGER)) return
        known.ledger = next.ledger
        notifySessionState()
      }, [sessionId, turn.turn, armedFor])

      if (known === null) return null
      if (!core.isMarked(known.ledger ?? core.EMPTY_LEDGER, turn.turn)) return null

      return h(
        'div',
        {
          role: 'note',
          style: styles.marker,
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
        let core
        try {
          core = await require.async('./client.core.js')
        } catch (error) {
          console.warn('dsh-supersede: decision core failed to load', error)
          return
        }
        // Records are only created by mounted slot components, so adopting the
        // core's frozen empty ledger here makes every record ledger-carrying.
        emptyLedger = core.EMPTY_LEDGER

        ctx.effect(
          () => ctx.locale.register(NS, { zh, en }),
          'dsh-supersede: dictionaries',
        )
        const t = ctx.locale.bind(NS)

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

        ctx.slots.inject(SLOT, () => ctx.slots.register({
          name: SLOT,
          id: ENTRY_ID,
          order: 10,
          locale: NS,
          // The locale seat already supplies `t`; injecting a prop named `t`
          // would instead throw on prop overlap. Carry the same bound
          // translator under a free name so the component never lacks one.
          inject: (sessionId) => ({
            translate: t,
            core,
            busyEnter,
            cancelTurn: () => cancelTurn(sessionId),
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
          inject: (sessionId) => ({ core, translate: t }),
        }, SupersededMarker))
      },
    }
  },
})
