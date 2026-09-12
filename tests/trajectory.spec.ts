// @vitest-environment node
/**
 * Linear assembly: the groups and chips must follow SURFACE order, never a seq
 * ordering, because a checkpoint stands at an older surface position with a
 * higher seq. These cases pin that difference down.
 */

import { describe, expect, it } from 'vitest'
import type { NodeView } from '../src/shared/types.ts'
import { chipsFor, committedResults, prunedSeqOf, segmentNodes, stepsFor, turnSpan } from '../src/client/trajectory.ts'

/** One minimal node view. */
function node(seq: number, overrides: Partial<NodeView> = {}): NodeView {
  return {
    seq: seq as NodeView['seq'],
    kind: 'user',
    turn: null,
    step: null,
    title: 't',
    excerpt: 'e',
    truncated: false,
    sourceName: null,
    toolCalls: [],
    resultFor: null,
    ...overrides,
  }
}

describe('segmentNodes', () => {
  it('leads with the anchor and then one group per turn in first-appearance order', () => {
    const segments = segmentNodes([
      node(0, { kind: 'system' }),
      node(1, { turn: 1, step: 1 }),
      node(2, { kind: 'assistant', turn: 1, step: 2 }),
      node(5, { turn: 2, step: 1 }),
    ], false)
    expect(segments.map(segment => segment.kind)).toEqual(['anchor', 'turn', 'turn'])
    expect(segments.map(segment => segment.turn)).toEqual([null, 1, 2])
    expect(segments[1]?.nodes.map(item => item.seq)).toEqual([1, 2])
    expect(segments[1]).toMatchObject({ stepFrom: 1, stepTo: 2 })
  })

  it('keeps surface order when the checkpoint carries the highest seq', () => {
    const nodes = [
      node(0, { kind: 'system' }),
      node(9, { kind: 'summary', turn: 2, step: 1 }),
      node(8, { turn: 2, step: 1 }),
    ]
    const segments = segmentNodes(nodes, true)
    expect(segments.map(segment => segment.kind)).toEqual(['anchor', 'replaced', 'turn'])
    expect(segments[1]?.nodes.map(item => item.seq)).toEqual([9])
    expect(segments[2]?.nodes.map(item => item.seq)).toEqual([8])
    // Sorting by seq would have produced the opposite order.
    expect(nodes.map(item => item.seq)).not.toEqual([...nodes].sort((a, b) => a.seq - b.seq).map(item => item.seq))
  })

  it('keeps the checkpoint inside its turn until a replacement committed', () => {
    const segments = segmentNodes([node(9, { kind: 'summary', turn: 2, step: 1 })], false)
    expect(segments.map(segment => segment.kind)).toEqual(['turn'])
  })

  it('falls back to an unattributed group for messages without a turn', () => {
    expect(segmentNodes([node(4, { kind: 'injected' })], false).map(segment => segment.kind)).toEqual(['other'])
  })

  it('returns nothing for an empty log', () => {
    expect(segmentNodes([], false)).toEqual([])
  })
})

describe('chipsFor', () => {
  it('resolves a result by call identity and leaves a missing result null', () => {
    const owner = node(2, {
      kind: 'assistant',
      toolCalls: [
        { callId: 'call-1' as never, name: 'read', argsExcerpt: '{}', truncated: false },
        { callId: 'call-2' as never, name: 'grep', argsExcerpt: '{a}', truncated: true },
      ],
    })
    const all = [owner, node(3, { kind: 'tool-result', excerpt: 'body', resultFor: 'call-2' as never })]
    const chips = chipsFor(owner, all, null)
    expect(chips.map(chip => chip.name)).toEqual(['read', 'grep'])
    expect(chips[0]).toMatchObject({ resultExcerpt: null, resultSeq: null, pruned: false })
    expect(chips[1]).toMatchObject({ resultExcerpt: 'body', resultSeq: 3, argsTruncated: true, pruned: false })
  })

  it('marks the result a committed prune shortened', () => {
    const owner = node(2, {
      kind: 'assistant',
      toolCalls: [{ callId: 'call-1' as never, name: 'read', argsExcerpt: '{}', truncated: false }],
    })
    const all = [owner, node(6, { kind: 'tool-result', excerpt: 'short', resultFor: 'call-1' as never })]
    expect(chipsFor(owner, all, 6)[0]?.pruned).toBe(true)
    expect(chipsFor(owner, all, 5)[0]?.pruned).toBe(false)
  })
})

describe('stepsFor', () => {
  it('produces one step per message with its own chips', () => {
    const all = [
      node(0, { kind: 'system' }),
      node(2, {
        kind: 'assistant',
        toolCalls: [{ callId: 'c' as never, name: 'read', argsExcerpt: '{}', truncated: false }],
      }),
      node(3, { kind: 'tool-result', resultFor: 'c' as never }),
    ]
    const steps = stepsFor(all, null)
    expect(steps.map(step => step.node.seq)).toEqual([0, 2, 3])
    expect(steps[1]?.chips).toHaveLength(1)
    expect(committedResults(steps[1]?.chips ?? [])).toBe(1)
    expect(steps[0]?.chips).toEqual([])
  })
})

describe('prunedSeqOf', () => {
  it('reports a prune seq and ignores other changes', () => {
    expect(prunedSeqOf({ latestChange: { kind: 'prune', seq: 6 } })).toBe(6)
    expect(prunedSeqOf({ latestChange: { kind: 'append', seq: 6 } })).toBeNull()
    expect(prunedSeqOf({ latestChange: null })).toBeNull()
    expect(prunedSeqOf(undefined)).toBeNull()
  })
})

describe('turnSpan', () => {
  it('reports the span and null when nothing is attributed', () => {
    expect(turnSpan([node(0, { kind: 'system' }), node(1, { turn: 2 }), node(2, { turn: 5 })]))
      .toEqual({ from: 2, to: 5 })
    expect(turnSpan([node(0, { kind: 'system' })])).toBeNull()
  })
})
