// @vitest-environment node
/**
 * Compaction behaviour: a summary only becomes a comparison when its
 * replacement is committed, failures never roll back a committed surface, and
 * a model-free prune is never presented as a summary.
 */

import { describe, expect, it } from 'vitest'
import { deriveEventMessage, type SessionEvent } from '@deepseek-ai/dsh-session'
import { foldSurface } from '@deepseek-ai/dsh-session/surface'
import { isCompactCheckpointSource } from '@deepseek-ai/dsh-compaction/checkpoint'
import { isCheckpointSource } from '../src/compaction-events.ts'
import type { AttemptPhase, BarState } from '../src/shared/types.ts'
import { resolveConfig } from '../src/shared/config.ts'
import { initialState, reduceEvent } from '../src/projection/state.ts'
import { toView } from '../src/projection/view.ts'
import { logBuilder, text, type LogBuilder } from './fixtures/session-builder.ts'

const CONFIG = resolveConfig({})

/** Fold a log the way the projection drive does. */
function fold(events: readonly SessionEvent[]): BarState {
  return events.reduce((state, event) => reduceEvent(state, event, CONFIG), initialState(CONFIG))
}

/** Fold one builder's log. */
function stateOf(builder: LogBuilder): BarState {
  return fold(builder.events)
}

/** Assert the fold's surface matches the canonical oracle. */
function expectOracleAgreement(builder: LogBuilder): void {
  const oracle = foldSurface(builder.events).nodes
    .filter(seq => deriveEventMessage(builder.events[seq as number] as SessionEvent) !== null)
    .map(seq => seq as number)
  const state = stateOf(builder)
  expect(state.surface.flatMap(entry => entry.message === null ? [] : [entry.seq as number])).toEqual(oracle)
}

/** A log with a system prompt, two turns, and a compaction range ready to take. */
function compactableLog(): LogBuilder {
  // Surface order: 0 system, 3 first question, 4 first answer, 8 second
  // question, 9 second answer — turn and step boundaries are not surface nodes.
  const builder = logBuilder()
  builder.systemPrompt('system')
  builder.turnStart(1)
  builder.stepStart(1, 1)
  builder.userMessage('first question', 1, 1)
  builder.assistantMessage('first answer', 1, 1)
  builder.turnEnd(1)
  builder.turnStart(2)
  builder.stepStart(2, 1)
  builder.userMessage('second question', 2, 1)
  builder.assistantMessage('second answer', 2, 1)
  return builder
}

describe('attempt phases', () => {
  it('starts idle, generates, awaits the replacement, then completes', () => {
    const builder = compactableLog()
    const phases: AttemptPhase[] = [toView(stateOf(builder), CONFIG).attempt]
    builder.append('compaction/start', { compactionId: 'compaction-fixture', turn: 1 })
    phases.push(toView(stateOf(builder), CONFIG).attempt)
    builder.compactionSummaryOnly(3, 4, [3, 4])
    phases.push(toView(stateOf(builder), CONFIG).attempt)
    builder.compact(3, 4, 'summary text')
    phases.push(toView(stateOf(builder), CONFIG).attempt)
    expect(phases).toEqual(['idle', 'generating', 'awaiting-replacement', 'completed'])
  })

  it('reports a failed attempt without touching the committed surface', () => {
    const builder = compactableLog()
    const before = toView(stateOf(builder), CONFIG)
    builder.append('compaction/start', { compactionId: 'compaction-fixture', turn: 1 })
    builder.compactionSummaryOnly(3, 4, [3, 4])
    builder.compactionEnd('summarizer unreachable')
    const after = toView(stateOf(builder), CONFIG)
    expect(after.attempt).toBe('failed')
    expect(after.totalMessages).toBe(before.totalMessages)
    expect(after.latestCompression).toBeNull()
    expectOracleAgreement(builder)
  })

  it('keeps the last successful comparison when a later attempt fails', () => {
    const builder = compactableLog()
    builder.compact(3, 4, 'first summary')
    const committed = toView(stateOf(builder), CONFIG).latestCompression
    builder.append('compaction/start', { compactionId: 'compaction-fixture', turn: 2 })
    builder.compactionSummaryOnly(8, 9, [8, 9])
    builder.compactionEnd('failed after a committed compaction')
    const after = toView(stateOf(builder), CONFIG)
    expect(after.attempt).toBe('failed')
    expect(after.latestCompression).toEqual(committed)
  })

  it('marks an attempt interrupted when the seed ends under it', () => {
    const builder = compactableLog()
    builder.append('compaction/start', { compactionId: 'compaction-fixture', turn: null })
    builder.compactionSummaryOnly(3, 4, [3, 4])
    builder.endSeed()
    expect(toView(stateOf(builder), CONFIG).attempt).toBe('interrupted')
  })

  it('does not leave a manual compaction running across turn boundaries', () => {
    const builder = compactableLog()
    builder.append('compaction/start', { compactionId: 'compaction-fixture', turn: null })
    builder.turnEnd(2)
    expect(toView(stateOf(builder), CONFIG).attempt).toBe('interrupted')
  })
})

describe('committed comparison', () => {
  it('publishes nothing until the replacement is committed', () => {
    const builder = compactableLog()
    const before = toView(stateOf(builder), CONFIG).totalMessages
    builder.compactionSummaryOnly(3, 4, [3, 4])
    const view = toView(stateOf(builder), CONFIG)
    expect(view.latestCompression).toBeNull()
    expect(view.attempt).toBe('awaiting-replacement')
    expect(view.totalMessages).toBe(before)
  })

  it('records the replacement, the summary text, and the replaced nodes', () => {
    const builder = compactableLog()
    const replacement = builder.compact(3, 4, 'the two earlier messages, summarized')
    const view = toView(stateOf(builder), CONFIG)
    const compression = view.latestCompression
    expect(compression?.replacementSeq).toBe(replacement.seq)
    expect(compression?.generatedExcerpt).toBe('the two earlier messages, summarized')
    expect(compression?.beforeCount).toBe(2)
    expect(compression?.omittedBeforeCount).toBe(0)
    expect(compression?.before.map(node => node.excerpt)).toEqual(['first question', 'first answer'])
    expect(compression?.checkpoint.seq).toBe(replacement.seq)
    expect(view.totalMessages).toBe(4)
    expectOracleAgreement(builder)
  })

  it('classifies the committed checkpoint as the summary it replaced the messages with', () => {
    const builder = compactableLog()
    const replacement = builder.compact(3, 4, 'the two earlier messages, summarized')
    const view = toView(stateOf(builder), CONFIG)
    // The checkpoint stands for what it replaced, so the track labels it as a
    // summary rather than as generic injected context.
    expect(view.latestCompression?.checkpoint.kind).toBe('summary')
    const checkpoint = view.nodes.find(node => node.seq === replacement.seq)
    expect(checkpoint?.kind).toBe('summary')
    expect(view.nodes.filter(node => node.kind === 'injected')).toEqual([])
  })

  it('records a compaction whose replaced span holds a record deriving no message', () => {
    // The system-prompt producer blanks its own record with an empty system
    // message: the position stays on the surface and derives no model message, so
    // the recorded shadow set counts one entry more than the derived nodes do.
    // Matching the two as node sets left this whole compaction unrecorded, which
    // is what hid every replaced turn from the trajectory card.
    const builder = logBuilder('session-compaction-blank')
    builder.systemPrompt('system')
    builder.turnStart(1)
    builder.stepStart(1, 1)
    const question = builder.userMessage('first question', 1, 1)
    builder.assistantMessage('first answer', 1, 1)
    builder.turnEnd(1)
    const reissued = builder.systemPrompt('system, second issue')
    const blanked = builder.blankSystemPrompt(Number(reissued.seq), 1, 1)
    const replacement = builder.compact(Number(question.seq), Number(blanked.seq), 'summarized')

    const view = toView(stateOf(builder), CONFIG)
    expect(view.latestCompression?.checkpoint.seq).toBe(replacement.seq)
    expect(view.latestCompression?.checkpoint.kind).toBe('summary')
    // Two messages were replaced; the blanked record contributes no message.
    expect(view.latestCompression?.beforeCount).toBe(2)
    expect(view.latestCompression?.before.map(node => node.excerpt))
      .toEqual(['first question', 'first answer'])
    expect(view.latestCompression?.beforeFirstTurn).toBe(1)
    expect(view.latestCompression?.beforeLastTurn).toBe(1)
  })

  it('recognises the compaction marker the way the compaction package does', () => {
    // The plugin reads the marker off the session log instead of importing the
    // compaction package, because a bundle that cannot resolve a harness
    // subpath leaves a fiber-less loader entry and aborts `dsh` startup. This
    // test is the other half of that trade: a marker change fails here rather
    // than silently demoting every summary to generic injected context.
    const sources = [
      { kind: 'plugin', plugin: 'compact' },
      { kind: 'plugin', plugin: 'compact-other' },
      { kind: 'plugin', plugin: '' },
      { kind: 'plugin' },
      { kind: 'user' },
      { kind: 'tool' },
    ]
    for (const source of sources) {
      expect(isCheckpointSource(source)).toBe(isCompactCheckpointSource(source as never))
    }
  })

  it('recognises an old summary plus new messages compacted into a new summary', () => {
    const builder = compactableLog()
    const first = builder.compact(3, 4, 'first summary')
    builder.userMessage('third question', 3, 1)
    builder.assistantMessage('third answer', 3, 1)
    const third = builder.userMessage('fourth question', 3, 1)
    const fourth = builder.assistantMessage('fourth answer', 3, 1)
    const second = builder.compact(first.seq, fourth.seq, 'second summary')
    void third
    const view = toView(stateOf(builder), CONFIG)
    expect(view.latestCompression?.replacementSeq).toBe(second.seq)
    expect(view.latestCompression?.generatedExcerpt).toBe('second summary')
    expect(view.latestCompression?.before.map(node => node.excerpt))
      .toEqual(['first summary', 'second question', 'second answer', 'third question', 'third answer', 'fourth question', 'fourth answer'])
    expect(view.totalMessages).toBe(2)
    expectOracleAgreement(builder)
  })

  it('bounds the replaced nodes it publishes and reports the rest', () => {
    const builder = logBuilder()
    builder.systemPrompt('system')
    for (let index = 0; index < 130; index += 1) builder.userMessage(`message ${index}`, 1, 1)
    builder.compact(1, 130, 'wide summary')
    const compression = toView(stateOf(builder), CONFIG).latestCompression
    expect(compression?.beforeCount).toBe(130)
    expect(compression?.before).toHaveLength(CONFIG.comparisonNodeLimit)
    expect(compression?.omittedBeforeCount).toBe(130 - CONFIG.comparisonNodeLimit)
    expect(compression?.before.at(-1)?.excerpt).toBe('message 129')
  })

  it('matches a summary whose shadow set is reported out of surface order', () => {
    const builder = compactableLog()
    builder.compactionSummaryOnly(3, 4, [4, 3])
    const replacement = builder.append(
      'user/message',
      {
        content: [text('summary from an unordered shadow set')],
        source: { kind: 'plugin', plugin: '@deepseek-ai/dsh-compaction', form: 'recall' },
        role: 'user',
      },
      { surfaceOp: { op: 'replace', startSeq: 3, endSeq: 4 }, sourceEventSeqs: [3, 4] },
    )
    const compression = toView(stateOf(builder), CONFIG).latestCompression
    expect(compression?.replacementSeq).toBe(replacement.seq)
    expect(compression?.beforeCount).toBe(2)
  })
})

describe('prune', () => {
  it('reports a tool-result shortening as a prune, not as a summary', () => {
    const builder = logBuilder()
    builder.userMessage('read the file', 1, 1)
    builder.assistantMessage('calling', 1, 1)
    builder.toolCall('call-1', 'read', '{"path":"a.ts"}', 1, 1)
    builder.toolResult('call-1', [text('x'.repeat(4000))], 1, 1)
    const prunedEvent = builder.prune('call-1', [text('x'.repeat(200))])
    const view = toView(stateOf(builder), CONFIG)
    const pruned = view.nodes.at(-1)
    expect(pruned?.kind).toBe('tool-result')
    expect(pruned?.excerpt).toHaveLength(200)
    expect(pruned?.seq).toBe(prunedEvent.seq)
    expect(view.latestChange?.kind).toBe('prune')
    expect(view.latestCompression).toBeNull()
    expectOracleAgreement(builder)
  })

  it('keeps a committed summary comparison when a tool result is pruned', () => {
    const builder = compactableLog()
    builder.compact(3, 4, 'summary')
    const committed = toView(stateOf(builder), CONFIG).latestCompression
    builder.turnStart(3)
    builder.stepStart(3, 1)
    builder.userMessage('read a file', 3, 1)
    builder.assistantMessage('calling', 3, 1)
    builder.toolCall('call-9', 'read', '{}', 3, 1)
    builder.toolResult('call-9', [text('body'.repeat(500))], 3, 1)
    builder.prune('call-9', [text('short')])
    const view = toView(stateOf(builder), CONFIG)
    expect(view.latestCompression).toEqual(committed)
    expect(view.latestChange?.kind).toBe('prune')
  })
})

describe('lifecycle boundaries', () => {
  it('keeps a manual compaction turn null', () => {
    const builder = compactableLog()
    builder.append('compaction/start', { compactionId: 'compaction-fixture', turn: null })
    expect(stateOf(builder).attempt).toBe('generating')
  })

  it('never recounts a summary replacement as a second model message', () => {
    const builder = compactableLog()
    builder.compact(3, 4, 'summary')
    const view = toView(stateOf(builder), CONFIG)
    // Two replaced messages became one summary node.
    expect(view.totalMessages).toBe(4)
    expect(view.nodes.filter(node => node.excerpt === 'summary')).toHaveLength(1)
  })
})
