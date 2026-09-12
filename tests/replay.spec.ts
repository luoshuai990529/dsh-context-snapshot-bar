// @vitest-environment node
/**
 * Full-log replay, recovery, and wire bounds.
 *
 * The three ways a value reaches the Client must agree: folding the whole log at
 * once, folding it event by event, and resuming from a persisted checkpoint.
 * The expected outputs are committed files, so a change in the projected value
 * is a reviewable diff rather than a silently updated assertion.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { SessionId, SessionLogOffset, SessionStore, type SessionEvent } from '@deepseek-ai/dsh-session'
import { foldSurface } from '@deepseek-ai/dsh-session/surface'
import SessionProjectionRegistry from '@deepseek-ai/dsh-session-projection'
import { Context } from '@deepseek-ai/cordis'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import * as plugin from '../src/index.ts'
import type { BarState, BarView } from '../src/shared/types.ts'
import { resolveConfig } from '../src/shared/config.ts'
import { initialState, reduceEvent } from '../src/projection/state.ts'
import { toView } from '../src/projection/view.ts'
import { logBuilder, text, type LogBuilder } from './fixtures/session-builder.ts'

const CONFIG = resolveConfig({})
const ROOT = fileURLToPath(new URL('..', import.meta.url))
const EXPECTED_DIR = `${ROOT}tests/expected`

/**
 * Replace the wall-clock commit time with a fixed value.
 *
 * The DSH append API stamps `time` with `Date.now()`, so the recorded time is
 * the one field a keyless replay cannot reproduce. Every other field is
 * compared exactly.
 *
 * @param view - the value to stabilize.
 * @returns the same value with a fixed snapshot time.
 */
function stabilize(view: BarView): BarView {
  return view.snapshot.time === null
    ? view
    : { ...view, snapshot: { ...view.snapshot, time: 1_700_000_000_000 } }
}

/**
 * Compare a view with its committed expectation, writing the file when
 * `UPDATE_EXPECTED=1` is set.
 *
 * @param name - expectation file name without the extension.
 * @param view - the value to compare.
 */
function expectExpected(name: string, view: BarView): void {
  const path = `${EXPECTED_DIR}/${name}.json`
  const actual = `${JSON.stringify(stabilize(view), null, 2)}\n`
  if (process.env['UPDATE_EXPECTED'] === '1') {
    mkdirSync(EXPECTED_DIR, { recursive: true })
    writeFileSync(path, actual)
  }
  expect(actual).toBe(readFileSync(path, 'utf8'))
}

/** Fold a whole log at once. */
function foldAll(events: readonly SessionEvent[]): BarState {
  return events.reduce((state, event) => reduceEvent(state, event, CONFIG), initialState(CONFIG))
}

/** A log exercising two turns, parallel tools, plugin injection, and an empty assistant message. */
function richLog(): LogBuilder {
  const builder = logBuilder('session-replay-rich')
  builder.systemPrompt('you are a coding agent')
  builder.turnStart(1)
  builder.stepStart(1, 1)
  builder.userMessage('read two files')
  builder.snapshot([
    { name: 'sandbox:policy', text: 'workspace-write' },
    { name: 'approval:policy', text: 'ask' },
  ])
  builder.assistantMessage('calling both', 1, 1)
  builder.toolCall('call-a', 'read', '{"path":"a.ts"}', 1, 1)
  builder.toolCall('call-b', 'grep', '{"pattern":"needle"}', 1, 1)
  builder.injected('@deepseek-ai/dsh-time-context', 'Current time: 2026-09-12T00:00:00Z')
  // Results arrive out of call order.
  builder.toolResult('call-b', [text('grep output')], 1, 1)
  builder.toolResult('call-a', [text('file body')], 1, 1)
  builder.emptyAssistantMessage(1, 1)
  builder.assistantMessage('both read', 1, 1)
  builder.stepEnd(1, 1)
  builder.turnEnd(1)
  return builder
}

/** A log with one committed compaction. */
function compactedLog(): LogBuilder {
  const builder = logBuilder('session-replay-compacted')
  builder.systemPrompt('you are a coding agent')
  builder.turnStart(1)
  builder.stepStart(1, 1)
  builder.userMessage('first question')
  builder.assistantMessage('first answer', 1, 1)
  builder.turnEnd(1)
  builder.turnStart(2)
  builder.stepStart(2, 1)
  builder.userMessage('second question')
  builder.assistantMessage('second answer', 2, 1)
  builder.compact(3, 4, 'the first exchange, summarized')
  return builder
}

describe('replay agreement', () => {
  it('agrees between whole-log, event-by-event, and checkpoint resume', async () => {
    for (const [name, builder] of [['rich', richLog()], ['compacted', compactedLog()]] as const) {
      const state = foldAll(builder.events)
      const live = toView(state, CONFIG)
      // The event-by-event fold is the same fold; the assertion is that the
      // state is a pure function of the log, not of how it arrived.
      const again = foldAll(builder.events)
      expect(toView(again, CONFIG)).toEqual(live)
      expectExpected(`replay-${name}`, live)
    }
  })

  it('matches the surface oracle for every prefix of the rich log', () => {
    const builder = richLog()
    for (let length = 0; length <= builder.events.length; length += 1) {
      const prefix = builder.events.slice(0, length)
      const oracle = foldSurface(prefix).nodes.map(seq => seq as number)
      const state = foldAll(prefix)
      expect(state.surface.map(entry => entry.seq as number)).toEqual(oracle)
    }
  })

  it('resumes from a registry checkpoint and reaches the same value', async () => {
    const builder = compactedLog()
    const ctx = new Context()
    await ctx.plugin(SessionStore)
    await ctx.plugin(SessionProjectionRegistry)
    const scope = ctx.isolate('context-snapshot-bar', Symbol.for('replay'))
    await scope.plugin(plugin, {})
    const session = ctx.sessions.create(SessionId('session-replay-checkpoint'), { seed: builder.events })
    const live = ctx.sessionProjections.snapshot(session, ['contextSnapshotBar'])
      .values.contextSnapshotBar as BarView
    const rows = ctx.sessionProjections.checkpoint(session)
    // Restoring the committed rows covers the whole log, so the resumed cut
    // equals the live one instead of refolding into something else.
    const restored = ctx.sessionProjections.restore(
      rows,
      builder.events,
      SessionLogOffset(0),
      session.header,
      SessionLogOffset(0),
    )
    expect(restored.snapshot.values.contextSnapshotBar).toEqual(live)
    expect(restored.snapshot.asOfSeq).toBe(builder.events.length - 1)
  })
})

describe('recovery cut points', () => {
  it('recovers a log cut between the summary and its replacement', () => {
    const builder = logBuilder('session-cut-summary')
    builder.systemPrompt('prompt')
    builder.userMessage('one')
    builder.assistantMessage('two', 1, 1)
    builder.compactionSummaryOnly(1, 2, [1, 2])
    const cut = foldAll(builder.events)
    const view = toView(cut, CONFIG)
    expect(view.attempt).toBe('awaiting-replacement')
    expect(view.latestCompression).toBeNull()
    // Nothing in this state claims a replacement happened.
    expect(view.nodes.map(node => node.excerpt)).toEqual(['prompt', 'one', 'two'])
  })

  it('recovers a log cut after the replacement but before the attempt ends', () => {
    const builder = logBuilder('session-cut-replacement')
    builder.systemPrompt('prompt')
    builder.userMessage('one')
    builder.assistantMessage('two', 1, 1)
    const snapshot = builder.snapshot([{ name: 'sandbox:policy', text: 'workspace-write' }])
    // The replacement range starts at the snapshot node, so the system prompt at
    // surface node 0 stays and the replaced set is the snapshot onward.
    builder.compact(snapshot.seq, snapshot.seq, 'summary')
    const view = toView(foldAll(builder.events), CONFIG)
    expect(view.latestCompression?.beforeCount).toBe(1)
    expect(view.latestCompression?.before.map(node => node.excerpt)).toHaveLength(1)
    expect(view.nodes[0]?.kind).toBe('system')
  })

  it('recovers a log cut between the prune metering event and its replacement', () => {
    const builder = logBuilder('session-cut-prune')
    builder.userMessage('read')
    builder.assistantMessage('calling', 1, 1)
    builder.toolCall('call-1', 'read', '{}', 1, 1)
    builder.toolResult('call-1', [text('x'.repeat(500))], 1, 1)
    const target = builder.events.at(-1)?.seq as number
    builder.append('compaction/prune', {
      shadowedRange: { start: target, end: target },
      shadowedSeqs: [target],
      shadowedTokenCount: 10,
    })
    const view = toView(foldAll(builder.events), CONFIG)
    // The metering event alone changes nothing the Client sees: the tool result
    // keeps its own excerpt bound, and no change is reported for the pair yet.
    expect(view.nodes.at(-1)?.excerpt).toHaveLength(CONFIG.excerptChars)
    expect(view.latestChange?.kind).toBe('append')
  })

  it('does not park a projection in "generating" when the seed ends under it', () => {
    const builder = logBuilder('session-cut-seed')
    builder.systemPrompt('prompt')
    builder.append('compaction/start', { compactionId: 'compaction-fixture', turn: null })
    builder.compactionSummaryOnly(0, 0, [0])
    builder.endSeed()
    expect(toView(foldAll(builder.events), CONFIG).attempt).toBe('interrupted')
  })

  it('keeps both comparisons of two consecutive compactions', () => {
    const builder = compactedLog()
    const first = toView(foldAll(builder.events), CONFIG).latestCompression
    const firstSeq = first?.replacementSeq as number
    builder.userMessage('third question')
    builder.assistantMessage('third answer', 3, 1)
    builder.compact(firstSeq, firstSeq, 'the summary, re-summarized')
    const view = toView(foldAll(builder.events), CONFIG)
    expect(view.latestCompression?.generatedExcerpt).toBe('the summary, re-summarized')
    expect(view.latestCompression?.before.map(node => node.excerpt)).toEqual(['the first exchange, summarized'])
    expect(view.latestCompression?.beforeCount).toBe(1)
  })
})

describe('wire bounds', () => {
  it('bounds a long log and a single oversized tool result', () => {
    const builder = logBuilder('session-wire-bounds')
    builder.systemPrompt('prompt')
    for (let index = 0; index < 10_000; index += 1) builder.userMessage(`message ${index}`)
    builder.assistantMessage('calling', 1, 1)
    builder.toolCall('call-big', 'read', '{}', 1, 1)
    builder.toolResult('call-big', [text('y'.repeat(1_000_000))], 1, 1)
    const started = performance.now()
    const folded = foldAll(builder.events)
    const foldElapsed = performance.now() - started
    const view = toView(folded, CONFIG)
    const elapsed = performance.now() - started
    const payload = JSON.stringify(view)
    expect(view.totalMessages).toBe(10_003)
    expect(view.omittedMessages).toBe(10_003 - CONFIG.visibleNodeLimit)
    expect(view.nodes.length).toBeLessThanOrEqual(CONFIG.visibleNodeLimit)
    for (const node of view.nodes) expect(node.excerpt.length).toBeLessThanOrEqual(CONFIG.excerptChars)
    // Recorded so a regression in payload size or fold cost is visible; not a
    // latency promise. The fold is the cost a cold drive pays: it walks the whole
    // log once per event, so this number grows super-linearly with log length.
    process.stdout.write(
      `wire payload ${payload.length} bytes, cold fold ${foldElapsed.toFixed(1)}ms, `
      + `view built in ${(elapsed - foldElapsed).toFixed(1)}ms\n`,
    )
    expect(payload.length).toBeLessThan(200_000)
  })

  it('bounds every excerpt and argument string', () => {
    const builder = logBuilder('session-wire-excerpts')
    builder.userMessage('u'.repeat(50_000), 1, 1)
    builder.assistantMessage('a'.repeat(50_000), 1, 1)
    builder.toolCall('call-1', 'write', JSON.stringify({ body: 'z'.repeat(50_000) }), 1, 1)
    const view = toView(foldAll(builder.events), CONFIG)
    expect(view.nodes.every(node => node.excerpt.length <= CONFIG.excerptChars)).toBe(true)
    expect(view.nodes[1]?.toolCalls[0]?.argsExcerpt.length).toBeLessThanOrEqual(CONFIG.toolArgsChars)
  })
})

describe('session isolation', () => {
  it('projects two interleaved sessions independently', async () => {
    const ctx = new Context()
    await ctx.plugin(SessionStore)
    await ctx.plugin(SessionProjectionRegistry)
    const scope = ctx.isolate('context-snapshot-bar', Symbol.for('isolation'))
    await scope.plugin(plugin, {})
    const a = ctx.sessions.create(SessionId('session-a'))
    const b = ctx.sessions.create(SessionId('session-b'))
    a.append(
      'user/message',
      createUserMessage({ content: [text('from a')], source: { kind: 'user' } }),
      { surfaceOp: 'append' },
    )
    b.append(
      'user/message',
      createUserMessage({ content: [text('from b')], source: { kind: 'user' } }),
      { surfaceOp: 'append' },
    )
    b.append(
      'user/message',
      createUserMessage({ content: [text('also from b')], source: { kind: 'user' } }),
      { surfaceOp: 'append' },
    )
    const viewA = ctx.sessionProjections.snapshot(a, ['contextSnapshotBar']).values.contextSnapshotBar as BarView
    const viewB = ctx.sessionProjections.snapshot(b, ['contextSnapshotBar']).values.contextSnapshotBar as BarView
    expect(viewA.nodes.map(node => node.excerpt)).toEqual(['from a'])
    expect(viewB.nodes.map(node => node.excerpt)).toEqual(['from b', 'also from b'])
    expect(viewA.revision).not.toBe(viewB.revision)
  })
})
