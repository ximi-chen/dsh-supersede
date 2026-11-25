import test from 'node:test'
import assert from 'node:assert/strict'

let registration
globalThis.window = {
  __ModuleLoader__: {
    load: (value) => {
      registration = value
    },
  },
}
await import('./client.core.js')

const core = registration.factory(() => {
  throw new Error('the core must not require()')
})
const { decideSupersede, DECISION_REASONS } = core
const { EMPTY_LEDGER, armLedger, observeTurn, isMarked } = core

/** Build a plain snapshot; each test overrides only what it is about. */
function snapshot(overrides = {}) {
  return {
    enabled: true,
    busyEnter: 'queue',
    running: true,
    canCancel: true,
    queue: [],
    seen: new Set(),
    cancelInFlight: false,
    ...overrides,
  }
}

const queueIds = (queue) => queue.map((row) => row.id)

test('registers a package-local core chunk under the bundle id', () => {
  assert.equal(registration.id, '@local/dsh-supersede')
  assert.equal(registration.chunk, 'client.core.js')
})

test('enabled, running, one new queue row: cancels once and records the row', () => {
  const queue = [{ id: 'm1' }]
  const decision = decideSupersede(snapshot({ queue }))
  assert.deepEqual(decision, {
    cancel: true,
    seen: queueIds(queue),
    reason: DECISION_REASONS.cancel,
  })
})

test('evaluating the same snapshot twice does not cancel again', () => {
  const queue = [{ id: 'm1' }]
  const first = decideSupersede(snapshot({ queue }))
  assert.equal(first.cancel, true)

  const second = decideSupersede(
    snapshot({ queue, seen: new Set(first.seen) }),
  )
  assert.deepEqual(second, {
    cancel: false,
    seen: queueIds(queue),
    reason: DECISION_REASONS.noNewRow,
  })
})

test('enabled but idle: records the new row without cancelling, and it never fires later', () => {
  const queue = [{ id: 'm1' }]
  const idle = decideSupersede(snapshot({ queue, running: false }))
  assert.deepEqual(idle, {
    cancel: false,
    seen: queueIds(queue),
    reason: DECISION_REASONS.idle,
  })

  const later = decideSupersede(snapshot({ queue, seen: new Set(idle.seen) }))
  assert.deepEqual(later, {
    cancel: false,
    seen: queueIds(queue),
    reason: DECISION_REASONS.noNewRow,
  })
})

test('disabled: records the row without cancelling; enabling later does not fire it', () => {
  const queue = [{ id: 'm1' }]
  const off = decideSupersede(snapshot({ queue, enabled: false }))
  assert.deepEqual(off, {
    cancel: false,
    seen: queueIds(queue),
    reason: DECISION_REASONS.off,
  })

  const on = decideSupersede(snapshot({ queue, seen: new Set(off.seen) }))
  assert.deepEqual(on, {
    cancel: false,
    seen: queueIds(queue),
    reason: DECISION_REASONS.noNewRow,
  })
})

test('busy-Enter steer: no cancel, records the rows, reports the UI gate reason', () => {
  const queue = [{ id: 'm1' }, { id: 'm2' }]
  const decision = decideSupersede(snapshot({ queue, busyEnter: 'steer' }))
  assert.deepEqual(decision, {
    cancel: false,
    seen: queueIds(queue),
    reason: DECISION_REASONS.steer,
  })
})

test('session refuses cancellation: no cancel, records the row, reports denied', () => {
  const queue = [{ id: 'm1' }]
  const decision = decideSupersede(snapshot({ queue, canCancel: false }))
  assert.deepEqual(decision, {
    cancel: false,
    seen: queueIds(queue),
    reason: DECISION_REASONS.denied,
  })
})

test('cancel in flight: a new row waits, never fires after settling, and a later row does', () => {
  const firstQueue = [{ id: 'm1' }]
  const inFlight = decideSupersede(
    snapshot({ queue: firstQueue, cancelInFlight: true }),
  )
  assert.deepEqual(inFlight, {
    cancel: false,
    seen: queueIds(firstQueue),
    reason: DECISION_REASONS.inFlight,
  })

  const settled = decideSupersede(
    snapshot({ queue: firstQueue, seen: new Set(inFlight.seen) }),
  )
  assert.deepEqual(settled, {
    cancel: false,
    seen: queueIds(firstQueue),
    reason: DECISION_REASONS.noNewRow,
  })

  const nextQueue = [{ id: 'm1' }, { id: 'm2' }]
  const next = decideSupersede(
    snapshot({ queue: nextQueue, seen: new Set(settled.seen) }),
  )
  assert.deepEqual(next, {
    cancel: true,
    seen: queueIds(nextQueue),
    reason: DECISION_REASONS.cancel,
  })
})

test('one snapshot with two new rows: one cancel decision, both rows recorded', () => {
  const queue = [{ id: 'm1' }, { id: 'm2' }]
  const decision = decideSupersede(snapshot({ queue }))
  assert.deepEqual(decision, {
    cancel: true,
    seen: queueIds(queue),
    reason: DECISION_REASONS.cancel,
  })
})

test('empty queue: no cancel and the seen list resets', () => {
  const decision = decideSupersede(
    snapshot({ queue: [], seen: new Set(['stale-id']) }),
  )
  assert.deepEqual(decision, {
    cancel: false,
    seen: [],
    reason: DECISION_REASONS.queueEmpty,
  })
})

test('does not mutate the frozen snapshot, its queue rows, or its seen set', () => {
  const queue = Object.freeze([
    Object.freeze({ id: 'm1' }),
    Object.freeze({ id: 'm2' }),
  ])
  const seen = new Set(['m1'])
  const input = Object.freeze(snapshot({ queue, seen }))
  const untouchedIds = queueIds(queue)
  const untouchedSeen = [...seen]

  const decision = decideSupersede(input)

  assert.deepEqual(decision, {
    cancel: true,
    seen: untouchedIds,
    reason: DECISION_REASONS.cancel,
  })
  assert.deepEqual(queueIds(input.queue), untouchedIds)
  assert.deepEqual([...input.seen], untouchedSeen)
  assert.equal(input.seen.size, untouchedSeen.length)
})

// ---------------------------------------------------------------------------
// Ledger: which turn, if any, this session's supersede actually interrupted.
//
// `armLedger` records the turn that was open when a cancel was accepted.
// `observeTurn` runs for closed turns as the marker renders them; it marks
// exactly that armed turn, and only when `turn/end` said `aborted`.
// ---------------------------------------------------------------------------

test('ledger: arm for a turn, observe that turn closed aborted; it is marked and disarmed', () => {
  const armed = armLedger(EMPTY_LEDGER, 3)
  assert.equal(armed.armedFor, 3)

  const { ledger, mark } = observeTurn(armed, { turn: 3, reasonKind: 'aborted' })

  assert.equal(mark, true)
  assert.deepEqual(ledger.marked, [3])
  assert.equal(ledger.armedFor, null)
  assert.equal(isMarked(ledger, 3), true)
})

test('ledger: a normal completion disarms without a mark, and a later abort is not marked', () => {
  const armed = armLedger(EMPTY_LEDGER, 3)

  const completed = observeTurn(armed, { turn: 3, reasonKind: 'completed' })
  assert.equal(completed.mark, false)
  assert.equal(completed.ledger.armedFor, null)
  assert.deepEqual(completed.ledger.marked, [])

  const laterAbort = observeTurn(completed.ledger, { turn: 4, reasonKind: 'aborted' })
  assert.equal(laterAbort.mark, false)
  assert.equal(laterAbort.ledger, completed.ledger)
  assert.equal(isMarked(laterAbort.ledger, 4), false)
})

test('ledger: an aborted turn with no arm is never marked', () => {
  const { ledger, mark } = observeTurn(EMPTY_LEDGER, { turn: 3, reasonKind: 'aborted' })

  assert.equal(mark, false)
  assert.equal(ledger, EMPTY_LEDGER)
  assert.equal(isMarked(ledger, 3), false)
})

test('ledger: arming for one turn does not mark a different turn that aborts', () => {
  const armed = armLedger(EMPTY_LEDGER, 3)

  const other = observeTurn(armed, { turn: 4, reasonKind: 'aborted' })
  assert.equal(other.mark, false)
  assert.equal(other.ledger, armed)
  assert.equal(other.ledger.armedFor, 3)
  assert.equal(isMarked(other.ledger, 4), false)

  // The armed turn is still the one that can be marked.
  const own = observeTurn(other.ledger, { turn: 3, reasonKind: 'aborted' })
  assert.equal(own.mark, true)
  assert.equal(isMarked(own.ledger, 3), true)
})

test('ledger: observing the same marked turn again keeps one mark and the same ledger', () => {
  const marked = observeTurn(armLedger(EMPTY_LEDGER, 3), {
    turn: 3,
    reasonKind: 'aborted',
  }).ledger

  const again = observeTurn(marked, { turn: 3, reasonKind: 'aborted' })

  assert.equal(again.mark, false)
  assert.equal(again.ledger, marked)
  assert.deepEqual(again.ledger.marked, [3])
})

test('ledger: a second supersede marks a second turn and keeps the first mark', () => {
  const first = observeTurn(armLedger(EMPTY_LEDGER, 3), {
    turn: 3,
    reasonKind: 'aborted',
  }).ledger

  const second = observeTurn(armLedger(first, 4), { turn: 4, reasonKind: 'aborted' })

  assert.equal(second.mark, true)
  assert.deepEqual(second.ledger.marked, [3, 4])
  assert.equal(isMarked(second.ledger, 3), true)
  assert.equal(isMarked(second.ledger, 4), true)
})

test('ledger: neither function mutates its ledger or the observed turn', () => {
  const ledger = Object.freeze({ armedFor: 3, marked: Object.freeze([1]) })
  const event = Object.freeze({ turn: 3, reasonKind: 'aborted' })

  const armed = armLedger(ledger, 4)
  assert.deepEqual(ledger, { armedFor: 3, marked: [1] })
  assert.equal(armed.armedFor, 4)
  assert.deepEqual(armed.marked, [1])

  const { ledger: marked, mark } = observeTurn(ledger, event)
  assert.equal(mark, true)
  assert.notEqual(marked, ledger)
  assert.deepEqual(ledger, { armedFor: 3, marked: [1] })
  assert.deepEqual(event, { turn: 3, reasonKind: 'aborted' })
  assert.deepEqual(marked.marked, [1, 3])

  // A turn outside the armed window leaves the ledger untouched by identity.
  assert.equal(
    observeTurn(ledger, Object.freeze({ turn: 9, reasonKind: 'aborted' })).ledger,
    ledger,
  )
  assert.equal(EMPTY_LEDGER.armedFor, null)
  assert.deepEqual(EMPTY_LEDGER.marked, [])
})
