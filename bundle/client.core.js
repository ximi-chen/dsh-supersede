/**
 * Pure decision core of @local/dsh-supersede, delivered as a package-local
 * client chunk loaded with `require.async('./client.core.js')`.
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
    // `aborted`. Any other reason for an armed turn removes just that arm
    // without a mark, so a later abort is not attributed to this supersede.
    //
    // Zero is the sentinel "any next aborted turn": the ledger can be armed
    // while the snapshot has no open turn yet.
    //
    // Ledgers are immutable: every transition returns a new object, and an
    // observation that changes nothing returns the same reference so the React
    // layer can compare identity instead of deep values.
    // -----------------------------------------------------------------------

    /**
     * The in-memory record of which turns an accepted cancel may still mark.
     * @typedef {{ armed: readonly number[], marked: readonly number[] }} Ledger
     */

    /** @type {Ledger} */
    const EMPTY_LEDGER = Object.freeze({
      armed: Object.freeze([]),
      marked: Object.freeze([]),
    })

    /**
     * Arm the ledger for one turn (0 arms "any next aborted turn"). A second
     * arm before the first turn closes is kept, so supersedes in a row each
     * leave their own mark. Past marks are always kept.
     * @param {Ledger} ledger
     * @param {number} turnNumber
     * @returns {Ledger}
     */
    function armLedger(ledger, turnNumber) {
      if (ledger.armed.includes(turnNumber)) return ledger
      return { armed: [...ledger.armed, turnNumber], marked: ledger.marked }
    }

    /**
     * Observe one closed turn. An armed turn that closed `aborted` is marked
     * once and disarmed; any other close removes only that arm, never a mark.
     * @param {Ledger} ledger
     * @param {{ turn: number, reasonKind: string | undefined }} observed
     * @returns {{ ledger: Ledger, mark: boolean }}
     */
    function observeTurn(ledger, observed) {
      const { armed, marked } = ledger
      const turn = observed.turn
      if (armed.length === 0 || marked.includes(turn)) {
        return { ledger, mark: false }
      }
      if (!armed.includes(turn) && !armed.includes(0)) {
        return { ledger, mark: false }
      }

      if (observed.reasonKind === 'aborted') {
        return {
          ledger: {
            armed: armed.filter((number) => number !== turn && number !== 0),
            marked: [...marked, turn],
          },
          mark: true,
        }
      }

      const remaining = armed.filter((number) => number !== turn)
      if (remaining.length === armed.length) return { ledger, mark: false }
      return { ledger: { armed: remaining, marked }, mark: false }
    }

    /**
     * @param {Ledger} ledger
     * @param {number} turnNumber
     * @returns {boolean}
     */
    function isMarked(ledger, turnNumber) {
      return ledger.marked.includes(turnNumber)
    }

    return { decideSupersede, DECISION_REASONS, EMPTY_LEDGER, armLedger, observeTurn, isMarked }
  },
})
