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

    // -----------------------------------------------------------------------
    // Supersede ledger
    //
    // Vocabulary alone cannot tell our cancel from the Stop button: both close
    // a turn with `turn/end` reason `aborted` / cause `user`. The only
    // clock-free discriminator is identity — the turn that was open when the
    // cancel was accepted. The client arms the ledger for that turn number;
    // the marker then marks that turn, and only that turn, if it closed
    // `aborted`. Any other reason for the armed turn disarms without a mark, so
    // a later abort is not attributed to this supersede.
    //
    // Ledgers are immutable: every transition returns a new object, and an
    // observation that changes nothing returns the same reference so the React
    // layer can compare identity instead of deep values.
    // -----------------------------------------------------------------------
    const EMPTY_LEDGER = Object.freeze({
      armedFor: null,
      marked: Object.freeze([]),
    })

    /**
     * Arm the ledger for the turn that was open when the cancel was accepted.
     * Past marks are kept so one session can show several superseded turns.
     * @param {{ armedFor: number | null, marked: readonly number[] }} ledger
     * @param {number | null} turnNumber
     * @returns {{ armedFor: number | null, marked: readonly number[] }}
     */
    function armLedger(ledger, turnNumber) {
      return { armedFor: turnNumber, marked: ledger.marked }
    }

    /**
     * Observe one closed turn. A mark is only released when the observation is
     * about the exact armed turn and `turn/end` said `aborted`.
     * @param {{ armedFor: number | null, marked: readonly number[] }} ledger
     * @param {{ turn: number, reasonKind: string | undefined }} observed
     * @returns {{ ledger: object, mark: boolean }}
     */
    function observeTurn(ledger, observed) {
      if (ledger.armedFor === null || ledger.armedFor !== observed.turn) {
        return { ledger, mark: false }
      }
      const mark = observed.reasonKind === 'aborted'
      return {
        ledger: {
          armedFor: null,
          marked: mark ? [...ledger.marked, observed.turn] : ledger.marked,
        },
        mark,
      }
    }

    /**
     * @param {{ armedFor: number | null, marked: readonly number[] }} ledger
     * @param {number} turnNumber
     * @returns {boolean}
     */
    function isMarked(ledger, turnNumber) {
      return ledger.marked.includes(turnNumber)
    }

    return { decideSupersede, DECISION_REASONS, EMPTY_LEDGER, armLedger, observeTurn, isMarked }
  },
})
