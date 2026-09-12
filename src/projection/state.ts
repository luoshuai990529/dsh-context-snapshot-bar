/**
 * The projection's fold: pure, synchronous, and driven by committed Session
 * events. The state is plain JSON so the projection cache can persist it, and
 * every path returns the same state reference for an event the plugin does not
 * care about, which is what keeps the projection drive from publishing on
 * unrelated traffic.
 *
 * @module dsh-context-snapshot-bar/projection/state
 */

import type { SessionEvent } from '@deepseek-ai/dsh-session/types'
import { producesMessage, sessionSeq } from '../session-log.ts'
import type {} from '../compaction-events.ts'
import type { ContentBlock } from '@deepseek-ai/dsh-llm'
import type {
  BarState,
  NodeView,
  PendingCompaction,
  SnapshotState,
  SurfaceEntry,
} from '../shared/types.ts'
import { configFingerprint, type Config } from '../shared/config.ts'
import { excerpt } from './excerpt.ts'
import {
  SNAPSHOT_CLEARED_BODY,
  SNAPSHOT_PRODUCER,
  fullTextOf,
  nodeFromEvent,
  toolCallView,
} from './node.ts'

/** The state for an empty Session log. */
export function initialState(config: Config): BarState {
  return {
    pendingPrune: null,
    surface: [],
    snapshot: { status: 'none', seq: null, time: null, sections: [] },
    pending: [],
    latestCompression: null,
    attempt: 'idle',
    latestChange: null,
    turn: null,
    step: null,
    revision: 0,
    configFingerprint: configFingerprint(config),
  }
}

/** The message payload a surface-eligible event may carry. */
interface MessagePayload {
  content: readonly ContentBlock[]
  source: {
    kind: string
    plugin?: string
    form?: string
    sections?: readonly { name: string, text: string }[]
  }
}

/** Fields this fold reads beyond the narrowed event payload. */
interface EventEnvelope {
  seq: number
  time?: number
  sourceEventSeqs?: readonly number[]
  surfaceOp?: unknown
}

/**
 * Fold one committed Session event into the projection state.
 *
 * @param state - the state covering every earlier event.
 * @param event - the next committed Session event.
 * @param config - the resolved plugin configuration.
 * @returns the next state, or the same reference when this event changes nothing the plugin shows.
 */
export function reduceEvent(state: BarState, event: SessionEvent, config: Config): BarState {
  return reduceCommitted(state, event, config)
}

/**
 * Fold one committed event; see {@link reduceEvent}.
 * @param state - the state covering every earlier event.
 * @param event - the next committed Session event.
 * @param config - the resolved plugin configuration.
 * @returns the next state.
 */
function reduceCommitted(state: BarState, event: SessionEvent, config: Config): BarState {
  switch (event.type) {
    case 'turn/start':
      return state.turn === event.data.turn && state.step === null
        ? state
        : { ...state, turn: event.data.turn, step: null }
    case 'turn/end':
      return settleAttempt({ ...state, turn: null, step: null })
    case 'step/start':
      return state.step === event.data.step
        ? state
        : { ...state, turn: event.data.turn, step: event.data.step }
    case 'step/end':
      return state.step === null ? state : { ...state, step: null }
    case 'user/message':
    case 'system/message':
    case 'assistant/message':
    case 'tool/result':
      // Every message-producing event is surface-eligible, so it either appends
      // or replaces; an unrecognised marker leaves the state untouched.
      return foldSurfaceEvent(state, event, config)
    case 'tool/call':
      return foldToolCall(state, event, config)
    case 'compaction/start':
      return state.attempt === 'generating' ? state : { ...state, attempt: 'generating' }
    case 'compaction/summary':
      return foldSummary(state, event)
    case 'compaction/end':
      return foldCompactionEnd(state, event.data.error !== undefined)
    case 'compaction/prune':
      return {
        ...state,
        pendingPrune: {
          startSeq: sessionSeq(event.data.shadowedRange.start),
          endSeq: sessionSeq(event.data.shadowedRange.end),
        },
      }
    case 'session/end-seed':
      return state.attempt === 'generating' || state.attempt === 'awaiting-replacement'
        ? { ...state, attempt: 'interrupted' }
        : state
    default:
      return state
  }
}

/**
 * Whether a recorded snapshot seq still occupies a current surface position.
 * @param state - the state covering every committed event.
 * @returns true when the snapshot's own event is still in the surface.
 */
export function snapshotStillOnSurface(state: BarState): boolean {
  const seq = state.snapshot.seq
  if (seq === null) return false
  return state.surface.some(entry => entry.seq === seq)
}

/**
 * Mark an attempt interrupted when a lifecycle boundary closes under it.
 * @param state - the state to settle.
 * @returns the settled state, or the same reference when no attempt was open.
 */
function settleAttempt(state: BarState): BarState {
  return state.attempt === 'generating' || state.attempt === 'awaiting-replacement'
    ? { ...state, attempt: 'interrupted' }
    : state
}

/**
 * Fold one surface event: append a new node, or apply a positional replacement.
 * @param state - the state covering every earlier event.
 * @param event - the committed surface event.
 * @param config - the resolved plugin configuration.
 * @returns the next state, or the same reference when the event adds no node and replaces nothing.
 */
function foldSurfaceEvent(state: BarState, event: SessionEvent, config: Config): BarState {
  const envelope = event as unknown as EventEnvelope
  const op = envelope.surfaceOp
  if (op === 'append') {
    const entry: SurfaceEntry = {
      seq: sessionSeq(event.seq),
      message: !producesMessage(event)
        ? null
        : nodeFromEvent(event, config, [], { turn: state.turn, step: state.step }),
    }
    return {
      ...state,
      surface: [...state.surface, entry],
      snapshot: snapshotAfter(state.snapshot, event, config),
      latestChange: {
        kind: 'append',
        seq: sessionSeq(event.seq),
        before: [],
        after: entry.message === null ? [] : [entry.message],
        omittedBeforeCount: 0,
      },
      revision: state.revision + 1,
    }
  }
  if (typeof op !== 'object' || op === null) return state
  const range = op as { startSeq: number, endSeq: number }
  const startIdx = state.surface.findIndex(entry => entry.seq === range.startSeq)
  const endIdx = state.surface.findIndex(entry => entry.seq === range.endSeq)
  if (startIdx === -1 || endIdx === -1 || startIdx > endIdx) return state
  const removed = state.surface.slice(startIdx, endIdx + 1)
  const entry: SurfaceEntry = {
    seq: sessionSeq(event.seq),
    message: !producesMessage(event)
        ? null
        : nodeFromEvent(event, config, [], { turn: state.turn, step: state.step }),
  }
  const before = removed.flatMap(item => item.message === null ? [] : [item.message])
  const settled = settleCompaction(state, event, before, entry, config)
  return {
    ...state,
    surface: [...state.surface.slice(0, startIdx), entry, ...state.surface.slice(endIdx + 1)],
    snapshot: snapshotAfter(state.snapshot, event, config),
    pending: settled.pending,
    latestCompression: settled.compression ?? state.latestCompression,
    attempt: settled.compression === null ? state.attempt : 'completed',
    pendingPrune: null,
    latestChange: {
      kind: state.pendingPrune === null ? 'replace' : 'prune',
      seq: sessionSeq(event.seq),
      before,
      after: entry.message === null ? [] : [entry.message],
      omittedBeforeCount: 0,
    },
    revision: state.revision + 1,
  }
}

/**
 * Read the snapshot record a message establishes, if it establishes one.
 *
 * A normal snapshot must match the producer, carry the `snapshot` form, and
 * carry sections; the clearing message must match the producer and its exact
 * body. Any other plugin injection leaves the record alone.
 *
 * @param current - the snapshot record covering every earlier event.
 * @param event - the committed surface event.
 * @param config - the resolved plugin configuration.
 * @returns the next snapshot record, or the same reference when this message records none.
 */
function snapshotAfter(current: SnapshotState, event: SessionEvent, config: Config): SnapshotState {
  if (event.type !== 'user/message') return current
  const payload = event.data as unknown as MessagePayload
  const source = payload.source
  if (source.kind !== 'plugin' || source.plugin !== SNAPSHOT_PRODUCER) return current
  const time = (event as unknown as EventEnvelope).time ?? null
  if (source.form === 'snapshot' && Array.isArray(source.sections)) {
    return {
      status: 'present',
      seq: sessionSeq(event.seq),
      time,
      sections: source.sections.map(section => {
        const bounded = excerpt(section.text, config.snapshotPreviewChars)
        return { name: section.name, text: bounded.text, truncated: bounded.truncated }
      }),
    }
  }
  if (fullTextOf(payload.content) === SNAPSHOT_CLEARED_BODY) {
    return { status: 'cleared', seq: sessionSeq(event.seq), time, sections: [] }
  }
  return current
}

/**
 * Record one tool invocation against the assistant node that requested it.
 * @param state - the state covering every earlier event.
 * @param event - the committed `tool/call` event.
 * @param config - the resolved plugin configuration.
 * @returns the next state, or the same reference when no assistant node can own the call.
 */
function foldToolCall(
  state: BarState,
  event: Extract<SessionEvent, { type: 'tool/call' }>,
  config: Config,
): BarState {
  let ownerIdx = -1
  for (let index = state.surface.length - 1; index >= 0; index -= 1) {
    if (state.surface[index]?.message?.kind === 'assistant') {
      ownerIdx = index
      break
    }
  }
  if (ownerIdx === -1) return state
  const owner = state.surface[ownerIdx] as SurfaceEntry
  const message = owner.message as NodeView
  const call = toolCallView(event.data.callId, event.data.name, event.data.arguments, config)
  const updated: NodeView = {
    ...message,
    title: message.toolCalls.length === 0 ? call.name : message.title,
    toolCalls: [...message.toolCalls, call],
  }
  const surface = [...state.surface]
  surface[ownerIdx] = { seq: owner.seq, message: updated }
  return { ...state, surface }
}

/**
 * Pair a replacement with the compaction summary that priced it.
 *
 * The summary reports the exact nodes it replaces, so the pairing is decided by
 * that set rather than by adjacency: a failed attempt whose replacement never
 * landed leaves no match, and the log stays the only authority on what was
 * actually replaced.
 *
 * @param state - the state covering every earlier event.
 * @param event - the committed replacement event.
 * @param before - the node views the replacement removed.
 * @param entry - the entry the replacement installed.
 * @param config - the resolved plugin configuration.
 * @returns the remaining pending summaries and the committed comparison, when one completed.
 */
function settleCompaction(
  state: BarState,
  event: SessionEvent,
  before: readonly NodeView[],
  entry: SurfaceEntry,
  config: Config,
): { pending: readonly PendingCompaction[], compression: BarState['latestCompression'] } {
  const sourceSeqs = (event as unknown as EventEnvelope).sourceEventSeqs
  if (sourceSeqs === undefined || sourceSeqs.length === 0 || state.pending.length === 0) {
    return { pending: state.pending, compression: null }
  }
  const removed = new Set(before.map(node => node.seq as number))
  const matchIdx = state.pending.findIndex(pending =>
    pending.shadowedSeqs.length === removed.size
    && pending.shadowedSeqs.every(seq => removed.has(seq as number)))
  if (matchIdx === -1) return { pending: state.pending, compression: null }
  const pending = state.pending[matchIdx] as PendingCompaction
  const checkpoint = entry.message ?? nodeFromEvent(event, config, [], { turn: state.turn, step: state.step })
  const kept = before.slice(Math.max(0, before.length - config.comparisonNodeLimit))
  return {
    pending: state.pending.filter((_, index) => index !== matchIdx),
    compression: {
      replacementSeq: sessionSeq(event.seq),
      generatedExcerpt: pending.summaryExcerpt,
      checkpoint,
      before: kept,
      beforeCount: before.length,
      omittedBeforeCount: before.length - kept.length,
    },
  }
}

/**
 * Record one compaction summary waiting for its replacement.
 * @param state - the state covering every earlier event.
 * @param event - the committed `compaction/summary` event.
 * @returns the next state carrying the pending summary.
 */
function foldSummary(
  state: BarState,
  event: Extract<SessionEvent, { type: 'compaction/summary' }>,
): BarState {
  const pending: PendingCompaction = {
    summarySeq: sessionSeq(event.seq),
    startSeq: sessionSeq(event.data.shadowedRange.start),
    endSeq: sessionSeq(event.data.shadowedRange.end),
    shadowedSeqs: event.data.shadowedSeqs.map(seq => sessionSeq(seq)),
    summaryExcerpt: fullTextOf(event.data.summary),
  }
  return { ...state, pending: [...state.pending, pending], attempt: 'awaiting-replacement' }
}

/**
 * Record the end of one compaction attempt.
 * @param state - the state covering every earlier event.
 * @param failed - whether the end event carried an error.
 * @returns the next state, or the same reference when the phase does not move.
 */
function foldCompactionEnd(state: BarState, failed: boolean): BarState {
  const next = failed ? 'failed' : 'completed'
  return state.attempt === next ? state : { ...state, attempt: next }
}
