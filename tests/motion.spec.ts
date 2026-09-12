/**
 * The motion rule from the design brief, as a pure function: a first load or a
 * reconnect shows the final state directly, and only what committed since the
 * previous observation is reported as entering.
 */

import { describe, expect, it } from 'vitest'
import { commitIdentity, observeSeqs, sameSeqs } from '../src/client/motion.ts'

describe('observeSeqs', () => {
  it('reports nothing on the first observation', () => {
    const first = observeSeqs(null, [0, 4, 5])
    expect([...first.entering]).toEqual([])
    expect([...first.seen].sort((left, right) => left - right)).toEqual([0, 4, 5])
  })

  it('reports exactly what committed since the previous observation', () => {
    const first = observeSeqs(null, [0, 4])
    const next = observeSeqs(first.seen, [0, 4, 9])
    expect([...next.entering]).toEqual([9])
    const later = observeSeqs(next.seen, [0, 4, 9])
    expect([...later.entering]).toEqual([])
  })

  it('reports nothing when a replacement removes nodes', () => {
    const first = observeSeqs(null, [0, 4, 5, 6])
    const compacted = observeSeqs(first.seen, [0, 9])
    expect([...compacted.entering]).toEqual([9])
  })
})

describe('sameSeqs', () => {
  it('compares by content, and never equates the absent baseline', () => {
    expect(sameSeqs(new Set([1, 2]), new Set([2, 1]))).toBe(true)
    expect(sameSeqs(new Set([1]), new Set([1, 2]))).toBe(false)
    expect(sameSeqs(null, new Set())).toBe(false)
  })
})

describe('commitIdentity', () => {
  it('names the standing and the committing seq, with no record as its own case', () => {
    expect(commitIdentity('present', 148)).toBe('present:148')
    expect(commitIdentity('none', null)).toBe('none:none')
    expect(commitIdentity('cleared', 152)).not.toBe(commitIdentity('present', 152))
  })
})
