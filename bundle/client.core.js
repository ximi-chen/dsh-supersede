/**
 * Pure decision core of @local/dsh-supersede, delivered as a package-local
 * client chunk so ticket 03 can load it with `require.async('./client.core.js')`.
 *
 * Classic script on purpose: the shell's module loader registers lazy factories,
 * not ES modules. The factory has no dependencies and no side effects.
 */
window.__ModuleLoader__.load({
  id: '@local/dsh-supersede',
  chunk: 'client.core.js',
  factory(require) {
    /** Stable names for the literals the decision can report. */
    const DECISION_REASONS = {
      queueEmpty: 'queue-empty',
      steer: 'steer',
      denied: 'denied',
      off: 'off',
      idle: 'idle',
      inFlight: 'in-flight',
      noNewRow: 'no-new-row',
      cancel: 'cancel',
    }

    /**
     * Decide whether one observed queue snapshot should cancel the running turn.
     * @param {object} input plain snapshot
     * @returns {{ cancel: boolean, seen: readonly string[], reason: string }}
     */
    function decideSupersede(input) {
      const ids = input.queue.map((row) => row.id)
      const record = (reason) => ({ cancel: false, seen: ids, reason })

      if (ids.length === 0) return record(DECISION_REASONS.queueEmpty)
      if (input.busyEnter === 'steer') return record(DECISION_REASONS.steer)
      if (input.canCancel === false) return record(DECISION_REASONS.denied)
      if (input.enabled === false) return record(DECISION_REASONS.off)
      if (input.running === false) return record(DECISION_REASONS.idle)
      if (input.cancelInFlight === true) return record(DECISION_REASONS.inFlight)
      if (!ids.some((id) => !input.seen.has(id))) {
        return record(DECISION_REASONS.noNewRow)
      }
      return { cancel: true, seen: ids, reason: DECISION_REASONS.cancel }
    }

    return { decideSupersede, DECISION_REASONS }
  },
})
