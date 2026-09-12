/**
 * Assembling the trajectory into the linear form the panel renders: one turn
 * group after another, each holding the messages that belong to it in surface
 * order, with every tool invocation paired to the result that answers it.
 *
 * The view already arrives in surface order, which is the model-visible order.
 * This module never re-sorts by seq: after a replacement a checkpoint stands at
 * an older surface position with a higher seq, and sorting by seq would report a
 * different conversation than the model sees.
 *
 * @module dsh-context-snapshot-bar/client/trajectory
 */

import type { NodeView } from '../shared/types.ts'

/** Which part of the line a group belongs to. */
export type SegmentKind = 'anchor' | 'turn' | 'replaced' | 'other'

/** One group of the line: the session anchor, a turn, or the replaced range. */
export interface Segment {
  /** React key, stable across renders. */
  key: string
  /** Which part of the line this group is. */
  kind: SegmentKind
  /** Turn number for a turn group, else null. */
  turn: number | null
  /** Lowest step number in the group, or null when no member carries one. */
  stepFrom: number | null
  /** Highest step number in the group, or null when no member carries one. */
  stepTo: number | null
  /** The messages in this group, in surface order. */
  nodes: readonly NodeView[]
}

/** One tool invocation paired with the result node that answers it. */
export interface ToolChip {
  /** Provider-issued call identity. */
  callId: string
  /** Tool name the assistant requested. */
  name: string
  /** Bounded argument excerpt. */
  argsExcerpt: string
  /** Whether the arguments were cut. */
  argsTruncated: boolean
  /** Bounded result excerpt, or null while the result has not been committed. */
  resultExcerpt: string | null
  /** Whether the result excerpt was cut. */
  resultTruncated: boolean
  /** The result node's seq, or null while it is missing. */
  resultSeq: number | null
  /** Whether a committed prune shortened this result in place. */
  pruned: boolean
}

/** One message line. */
export interface Step {
  /** The node this line presents. */
  node: NodeView
  /** The invocation chips hanging off this message. */
  chips: readonly ToolChip[]
}

/**
 * Group the current messages into the line's segments.
 *
 * The session anchor leads, then one group per turn in first-appearance order,
 * then any message that carries no turn. A committed replacement adds its own
 * group so the checkpoint stands apart from the turns it replaced.
 *
 * @param nodes - the current message nodes, in surface order.
 * @param summaryMode - whether a committed replacement means the checkpoint is its own group.
 * @returns the groups in render order.
 */
export function segmentNodes(nodes: readonly NodeView[], summaryMode: boolean): readonly Segment[] {
  const segments: Segment[] = []
  const taken = new Set<number>()
  const anchorIdx = nodes.findIndex(node => node.kind === 'system')
  if (anchorIdx !== -1) {
    taken.add(anchorIdx)
    segments.push(group(`anchor-${nodes[anchorIdx]?.seq ?? 0}`, 'anchor', null, [nodes[anchorIdx] as NodeView]))
  }
  const summaryIdx = nodes.findIndex(node => node.kind === 'summary')
  if (summaryMode && summaryIdx !== -1) {
    taken.add(summaryIdx)
    segments.push(group(`replaced-${nodes[summaryIdx]?.seq ?? 0}`, 'replaced', null, [nodes[summaryIdx] as NodeView]))
  }
  const turns: number[] = []
  for (const [index, node] of nodes.entries()) {
    if (taken.has(index) || node.turn === null) continue
    if (!turns.includes(node.turn)) turns.push(node.turn)
  }
  for (const turn of turns) {
    const members = nodes
      .map((node, index) => ({ node, index }))
      .filter(entry => !taken.has(entry.index) && entry.node.turn === turn)
    for (const entry of members) taken.add(entry.index)
    segments.push(group(`turn-${turn}`, 'turn', turn, members.map(entry => entry.node)))
  }
  const rest = nodes.filter((_, index) => !taken.has(index))
  if (rest.length > 0) segments.push(group('other', 'other', null, rest))
  return segments
}

/**
 * Build one segment and derive its step span.
 * @param key - React key for the group.
 * @param kind - which part of the line this group is.
 * @param turn - the turn number, or null.
 * @param nodes - the group's messages.
 * @returns the segment.
 */
function group(key: string, kind: SegmentKind, turn: number | null, nodes: readonly NodeView[]): Segment {
  const steps = nodes.flatMap(node => node.step === null ? [] : [node.step])
  return {
    key,
    kind,
    turn,
    stepFrom: steps.length === 0 ? null : Math.min(...steps),
    stepTo: steps.length === 0 ? null : Math.max(...steps),
    nodes,
  }
}

/**
 * Pair every recorded invocation on one message with the result that answers it.
 *
 * @param node - the message that may carry invocations.
 * @param all - every current message, used to resolve results by call identity.
 * @param prunedSeq - the seq of the node a committed prune shortened, or null.
 * @returns one chip per invocation, in invocation order.
 */
export function chipsFor(node: NodeView, all: readonly NodeView[], prunedSeq: number | null): readonly ToolChip[] {
  return node.toolCalls.map(call => {
    const result = all.find(candidate =>
      candidate.kind === 'tool-result' && candidate.resultFor === call.callId) ?? null
    return {
      callId: String(call.callId),
      name: call.name,
      argsExcerpt: call.argsExcerpt,
      argsTruncated: call.truncated,
      resultExcerpt: result === null ? null : result.excerpt,
      resultTruncated: result?.truncated ?? false,
      resultSeq: result === null ? null : Number(result.seq),
      pruned: result !== null && prunedSeq !== null && Number(result.seq) === prunedSeq,
    }
  })
}

/**
 * Build every line of the panel in render order.
 * @param nodes - the current message nodes.
 * @param prunedSeq - the seq of the node a committed prune shortened, or null.
 * @returns one step per message, with its chips.
 */
export function stepsFor(nodes: readonly NodeView[], prunedSeq: number | null): readonly Step[] {
  return nodes.map(node => ({ node, chips: chipsFor(node, nodes, prunedSeq) }))
}

/**
 * The seq of the node a committed prune shortened.
 * @param view - the current projection value, or undefined.
 * @returns the seq, or null when the latest change was not a prune.
 */
export function prunedSeqOf(view: { latestChange: { kind: string, seq: number } | null } | undefined): number | null {
  const change = view?.latestChange ?? null
  return change !== null && change.kind === 'prune' ? change.seq : null
}

/**
 * Describe the turn span the line covers.
 * @param nodes - the current message nodes.
 * @returns the lowest and highest turn present, or null when none is attributed.
 */
export function turnSpan(nodes: readonly NodeView[]): { from: number, to: number } | null {
  const turns = nodes.flatMap(node => node.turn === null ? [] : [node.turn])
  if (turns.length === 0) return null
  return { from: Math.min(...turns), to: Math.max(...turns) }
}

/**
 * Count the tool results a message's chips present.
 * @param chips - the message's chips.
 * @returns how many chips have a committed result.
 */
export function committedResults(chips: readonly ToolChip[]): number {
  return chips.filter(chip => chip.resultSeq !== null).length
}
