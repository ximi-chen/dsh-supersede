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
