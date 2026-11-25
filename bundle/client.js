/**
 * Client half of @local/dsh-supersede.
 *
 * Ticket 01 scope: one compact per-session 「接替」 switch in the composer's left
 * tool row, remembered in localStorage. The switch does not change delivery yet;
 * later tickets add the queue trigger, the turn marker, and the gates.
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

    /** Simplified Chinese dictionary (the key-set source of truth). */
    const zh = {
      'toggle.label': '接替',
      'toggle.active': '接替中',
      'toggle.title': '运行中发送消息会立即中止当前轮，并用这条消息开启新一轮。',
      'toggle.ariaLabel': '接替：运行中发送消息会立即中止当前轮，并用这条消息开启新一轮。',
    }

    /** English dictionary, complete against the zh key set. */
    const en = {
      'toggle.label': 'Supersede',
      'toggle.active': 'Superseding',
      'toggle.title': 'While a turn is running, sending a message cancels the current turn and starts a new one with it.',
      'toggle.ariaLabel': 'Supersede: while a turn is running, sending a message cancels the current turn and starts a new one.',
    }

    // =======================================================================
    // Per-session state
    //
    // The only persisted value is `enabled`, stored per session under
    // `dsh-supersede:enabled:<sessionId>`; a missing key means off. Everybody
    // else (queue bookkeeping, cancel flags) stays in this module's memory.
    // Later tickets extend the record here instead of rewriting the switch.
    // =======================================================================
    const STORAGE_PREFIX = 'dsh-supersede:enabled:'

    /** sessionId (string) -> { enabled: boolean }; hydrated lazily, page-local. */
    const sessions = new Map()
    /** Components watching the map; one notification per change, no payload. */
    const watchers = new Set()

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
     * @returns {{ enabled: boolean }}
     */
    function stateOf(sessionId) {
      const key = String(sessionId)
      let state = sessions.get(key)
      if (state === undefined) {
        state = { enabled: readStoredEnabled(key) }
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
    }

    /**
     * Session-scoped supersede switch.
     * Receives the standard session props plus the locale seat (`t`); the
     * injected `translate` is the same namespace's bound translator, kept as a
     * fallback because a `t` prop cannot be injected over the locale seat.
     * @param {object} props
     * @returns {object | null}
     */
    function SupersedeToggle(props) {
      const { sessionId } = props
      const t = props.t ?? props.translate
      const enabled = useSessionEnabled(sessionId)

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

    return {
      inject: ['slots', 'sessions', 'locale'],
      /**
       * Register the dictionaries and the one slot entry.
       * The dictionaries live in this entry's `ctx.effect`, so unloading the
       * plugin removes them; `ctx.slots.inject` owns the entry through the
       * caller fiber's effect and disposes both the wait and the contribution.
       * @param {object} ctx client plugin context
       * @returns {void}
       */
      apply(ctx) {
        ctx.effect(
          () => ctx.locale.register(NS, { zh, en }),
          'dsh-supersede: dictionaries',
        )
        const t = ctx.locale.bind(NS)
        ctx.slots.inject(SLOT, () => ctx.slots.register({
          name: SLOT,
          id: ENTRY_ID,
          order: 10,
          locale: NS,
          // The locale seat already supplies `t`; injecting a prop named `t`
          // would instead throw on prop overlap. Carry the same bound
          // translator under a free name so the component never lacks one.
          inject: () => ({ translate: t }),
        }, SupersedeToggle))
      },
    }
  },
})
