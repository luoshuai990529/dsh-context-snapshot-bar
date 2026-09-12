/**
 * Fixture builder: assembles Session logs through the DSH `Session` API, so
 * every fixture is validation-clean (JSON-serializable payloads, contiguous
 * seqs, canonical surface metadata) instead of hand-written JSON that only
 * looks like a log.
 *
 * @module dsh-context-snapshot-bar/tests/fixtures/session-builder
 */

import { Session, SessionId, SessionSeq, type SessionEvent } from '@deepseek-ai/dsh-session'
import { foldSurface } from '@deepseek-ai/dsh-session/surface'
import {
  MessageId,
  ToolCallId,
  createAssistantMessage,
  createSystemMessage,
  createToolResultMessage,
  createUserMessage,
  type AssistantStreamRecord,
  type ContentBlock,
} from '@deepseek-ai/dsh-llm'

/** Producer the unified runtime-context snapshot is attributed to. */
export const SNAPSHOT_PLUGIN = '@deepseek-ai/dsh-system-prompt'

/**
 * The producer a compaction's replacement message is attributed to: the seam's
 * checkpoint marker (`{ kind: 'plugin', plugin: 'compact' }`), which is what the
 * projection classifies as a summary.
 */
export const SUMMARY_PLUGIN = 'compact'

/** Body of the unified snapshot's clearing message. */
export const CLEARED_BODY = 'Current runtime context: none. Earlier runtime-context snapshots no longer apply.'

/** One named contribution to a snapshot, as the producer records it. */
export interface SnapshotSection {
  name: string
  text: string
}

/** A log under construction plus the session that validated every append. */
export interface LogBuilder {
  /** The validated session holding the log. */
  session: Session
  /** Every committed event, in seq order. */
  events: SessionEvent[]
  /** Append one event with optional surface metadata. */
  append: (
    type: SessionEvent['type'],
    data: unknown,
    metadata?: { surfaceOp?: unknown, sourceEventSeqs?: readonly number[] },
  ) => SessionEvent
  /** Open a turn. */
  turnStart: (turn: number) => void
  /** Close a turn. */
  turnEnd: (turn: number, reason?: string) => void
  /** Open a step within the current turn. */
  stepStart: (turn: number, step: number) => void
  /** Close a step. */
  stepEnd: (turn: number, step: number) => void
  /** Append the system prompt as surface node 0. */
  systemPrompt: (text: string) => SessionEvent
  /**
   * Append a human prompt.
   *
   * `turn`/`step` are optional because the loop appends `user/message` with the
   * message alone: a human prompt carries no boundary of its own, and the
   * projection has to take the turn that was open when it committed. Passing
   * them stamps the event the way a boundary-carrying event looks.
   */
  userMessage: (text: string, turn?: number, step?: number) => SessionEvent
  /** Append a plugin-injected context message. */
  injected: (plugin: string, text: string, options?: { form?: 'snapshot', sections?: SnapshotSection[] }) => SessionEvent
  /** Append the unified runtime-context snapshot. */
  snapshot: (sections: SnapshotSection[]) => SessionEvent
  /** Append the unified snapshot's clearing message. */
  clearSnapshot: () => SessionEvent
  /** Append an assistant message. */
  assistantMessage: (text: string, turn: number, step: number) => SessionEvent
  /** Append an assistant message with no content, which projects to no model message. */
  emptyAssistantMessage: (turn: number, step: number) => SessionEvent
  /** Append one tool invocation belonging to the newest assistant node. */
  toolCall: (callId: string, name: string, args: string, turn: number, step: number) => SessionEvent
  /** Append one tool result. */
  toolResult: (callId: string, blocks: ContentBlock[], turn: number, step: number) => SessionEvent
  /**
   * Replace one surface range with a compaction summary message.
   *
   * `firstNodeSeq`/`lastNodeSeq` identify two CURRENT SURFACE NODES by their
   * seqs, so the range may span positions whose seqs are not in numeric order;
   * the recorded shadow set is every surface node the replacement removes.
   */
  compact: (
    firstNodeSeq: number,
    lastNodeSeq: number,
    summary: string,
    shadowedSeqs?: readonly number[],
  ) => SessionEvent
  /** Append a summary record priced for a range whose replacement has not landed. */
  compactionSummaryOnly: (
    firstNodeSeq: number,
    lastNodeSeq: number,
    shadowedSeqs: readonly number[],
  ) => SessionEvent
  /** Close a compaction attempt, optionally with an error. */
  compactionEnd: (error?: string) => SessionEvent
  /**
   * Prune one current tool result in place.
   *
   * The shared shadow-price protocol requires the metering event immediately
   * before the replacement, so this appends both; deriving the metered seq from
   * the call itself is what makes the pair correct for any log length.
   */
  prune: (callId: string, blocks: ContentBlock[]) => SessionEvent

  /** Append the seed-end lifecycle marker. */
  endSeed: (inherited?: boolean) => SessionEvent
}

/** Empty assistant stream records; the fold never reads provider streams. */
const EMPTY_STREAM: AssistantStreamRecord[] = []

/** One text block. */
export function text(value: string): ContentBlock {
  return { type: 'text', text: value }
}

/**
 * Start a validated log.
 * @param id - session identity; defaults to a fixed fixture id.
 * @returns the builder.
 */
export function logBuilder(id = 'session-fixture'): LogBuilder {
  const session = Session.create(SessionId(id))
  const events: SessionEvent[] = []
  const append: LogBuilder['append'] = (type, data, metadata) => {
    const committed = (session.append as unknown as (
      type: SessionEvent['type'],
      data: unknown,
      metadata?: unknown,
    ) => SessionEvent)(type, data, {
      ...metadata?.surfaceOp === undefined ? {} : { surfaceOp: metadata.surfaceOp },
      ...metadata?.sourceEventSeqs === undefined ? {} : { sourceEventSeqs: metadata.sourceEventSeqs },
    })
    events.push(committed)
    return committed
  }
  return {
    session,
    events,
    append,
    turnStart: turn => void append('turn/start', { turn }),
    turnEnd: (turn, reason = 'completed') => void append('turn/end', { turn, reason }),
    stepStart: (turn, step) => void append('step/start', { turn, step }),
    stepEnd: (turn, step) => void append('step/end', { turn, step }),
    systemPrompt: value => append(
      'system/message',
      { turn: 1, step: 1, message: createSystemMessage(value, SNAPSHOT_PLUGIN) },
      { surfaceOp: 'append' },
    ),
    userMessage: (value, turn, step) => append(
      'user/message',
      {
        ...createUserMessage({ content: [text(value)], source: { kind: 'user' } }),
        ...turn === undefined ? {} : { turn },
        ...step === undefined ? {} : { step },
      },
      { surfaceOp: 'append' },
    ),
    injected: (plugin, value, options) => append(
      'user/message',
      createUserMessage({
        content: [text(value)],
        source: options?.form === 'snapshot'
          ? { kind: 'plugin', plugin, form: 'snapshot', sections: options.sections ?? [] }
          : { kind: 'plugin', plugin },
      }),
      { surfaceOp: 'append' },
    ),
    snapshot: sections => append(
      'user/message',
      createUserMessage({
        content: [text(sections.map(section => `<${section.name}>\n${section.text}`).join('\n'))],
        source: { kind: 'plugin', plugin: SNAPSHOT_PLUGIN, form: 'snapshot', sections },
      }),
      { surfaceOp: 'append' },
    ),
    clearSnapshot: () => append(
      'user/message',
      createUserMessage({ content: [text(CLEARED_BODY)], source: { kind: 'plugin', plugin: SNAPSHOT_PLUGIN } }),
      { surfaceOp: 'append' },
    ),
    assistantMessage: (value, turn, step) => append(
      'assistant/message',
      {
        turn,
        step,
        message: createAssistantMessage({ content: [text(value)], source: { provider: 'deepseek', model: 'deepseek-chat' } }),
        stream: EMPTY_STREAM,
      },
      { surfaceOp: 'append' },
    ),
    emptyAssistantMessage: (turn, step) => append(
      'assistant/message',
      {
        turn,
        step,
        message: createAssistantMessage({ content: [], source: { provider: 'deepseek', model: 'deepseek-chat' } }),
        stream: EMPTY_STREAM,
      },
      { surfaceOp: 'append' },
    ),
    toolCall: (callId, name, args, turn, step) => append(
      'tool/call',
      { turn, step, callId: ToolCallId(callId), name, arguments: args },
    ),
    toolResult: (callId, blocks, turn, step) => append(
      'tool/result',
      { turn, step, message: createToolResultMessage({ callId: ToolCallId(callId), content: blocks, isError: false }) },
      { surfaceOp: 'append' },
    ),
    compact: (firstNodeSeq, lastNodeSeq, summary, shadowedSeqs) => {
      const replacementSeq = events.length
      const shadowed = shadowedSeqs === undefined
        ? observedSurface(events, firstNodeSeq, lastNodeSeq)
        : [...shadowedSeqs]
      append('compaction/summary', {
        compactionId: 'compaction-fixture',
        summary: [text(summary)],
        shadowedRange: { start: firstNodeSeq, end: lastNodeSeq },
        shadowedSeqs: shadowed,
        shadowedTokenCount: 100,
        provider: 'deepseek',
        model: 'deepseek-chat',
      })
      append('compaction/end', { compactionId: 'compaction-fixture', turn: null })
      return append(
        'user/message',
        createUserMessage({
          content: [text(summary)],
          // The seam's checkpoint provenance: the marker alone, with none of the
          // forms a producer declares for its own context.
          source: { kind: 'plugin', plugin: SUMMARY_PLUGIN },
        }),
        {
          surfaceOp: { op: 'replace', startSeq: firstNodeSeq, endSeq: lastNodeSeq },
          sourceEventSeqs: [...shadowed, replacementSeq],
        },
      )
    },
    compactionSummaryOnly: (firstNodeSeq, lastNodeSeq, shadowedSeqs) => append('compaction/summary', {
      compactionId: 'compaction-fixture',
      summary: [text('unused summary')],
      shadowedRange: { start: firstNodeSeq, end: lastNodeSeq },
      shadowedSeqs,
      shadowedTokenCount: 10,
      provider: 'deepseek',
      model: 'deepseek-chat',
    }),
    compactionEnd: error => append(
      'compaction/end',
      { compactionId: 'compaction-fixture', turn: null, ...(error === undefined ? {} : { error }) },
    ),
    prune: (callId, blocks) => {
      const targetSeq = findToolResultSeq(events, callId)
      const original = events[targetSeq] as Extract<SessionEvent, { type: 'tool/result' }>
      append('compaction/prune', {
        shadowedRange: { start: targetSeq, end: targetSeq },
        shadowedSeqs: [targetSeq],
        shadowedTokenCount: 10,
      })
      // A tool-result replacement may change only the result content, so the
      // shortened event restates the original's turn, step, error, and — as a
      // real prune does — the original message identity.
      const refreshed = createToolResultMessage({ callId: ToolCallId(callId), content: blocks, isError: false })
      return append(
        'tool/result',
        {
          turn: original.data.turn,
          step: original.data.step,
          message: { ...refreshed, id: MessageId(original.data.message.id) },
        },
        {
          surfaceOp: { op: 'replace', startSeq: targetSeq, endSeq: targetSeq },
          sourceEventSeqs: [targetSeq],
        },
      )
    },
    endSeed: inherited => append('session/end-seed', inherited === undefined ? {} : { inherited: true }),
  }
}

/**
 * Locate the current surface node holding one tool call's result.
 * @param events - the committed log so far.
 * @param callId - the call identity to find.
 * @returns the result event's seq.
 */
function findToolResultSeq(events: readonly SessionEvent[], callId: string): number {
  for (const seq of foldSurface(events).nodes) {
    const event = events[seq as number]
    const message = event?.type === 'tool/result' ? event.data.message : undefined
    if (message?.source.callId === callId) return seq as number
  }
  throw new Error(`fixture: no current tool result for call ${callId}`)
}

/**
 * Read the surface nodes a replacement range covers, using the canonical fold.
 * @param events - the committed log so far.
 * @param firstNodeSeq - the range's first current surface node.
 * @param lastNodeSeq - the range's last current surface node.
 * @returns the seqs the range covers, in surface order.
 */
function observedSurface(events: readonly SessionEvent[], firstNodeSeq: number, lastNodeSeq: number): number[] {
  const nodes = foldSurface(events).nodes
  const startIdx = nodes.indexOf(SessionSeq(firstNodeSeq))
  const endIdx = nodes.indexOf(SessionSeq(lastNodeSeq))
  if (startIdx === -1 || endIdx === -1 || startIdx > endIdx) {
    throw new Error(`fixture: ${firstNodeSeq}..${lastNodeSeq} is not a current surface span`)
  }
  return nodes.slice(startIdx, endIdx + 1).map(seq => seq as number)
}

/** Re-exported so tests can name the surface oracle's input type. */
export type { SessionEvent }
