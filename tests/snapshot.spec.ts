// @vitest-environment node
/**
 * Snapshot projection: which messages the plugin recognises as the unified
 * runtime-context snapshot, how clearing and replacement-out-of-surface differ,
 * and that unrelated traffic leaves the projected value untouched.
 *
 * Every log comes from the DSH `Session` append API, so the fixture is a valid
 * session rather than JSON that merely resembles one.
 */

import { describe, expect, it } from 'vitest'
import { foldSurface } from '@deepseek-ai/dsh-session/surface'
import type { BarState, BarView } from '../src/shared/types.ts'
import { resolveConfig } from '../src/shared/config.ts'
import { initialState, reduceEvent } from '../src/projection/state.ts'
import { toView } from '../src/projection/view.ts'
import { logBuilder, type LogBuilder, type SessionEvent } from './fixtures/session-builder.ts'

const CONFIG = resolveConfig({})

/** Fold a log through the plugin's reducer the way the projection drive does. */
function fold(events: readonly SessionEvent[]): BarState {
  return events.reduce((state, event) => reduceEvent(state, event, CONFIG), initialState(CONFIG))
}

/** Fold a log and produce the bounded view. */
function viewOf(events: readonly SessionEvent[]): BarView {
  return toView(fold(events), CONFIG)
}

/** Assert the oracle agrees with the fold about which seqs are current messages. */
function expectSurfaceMatchesOracle(builder: LogBuilder): void {
  const oracle = foldSurface(builder.events).nodes
  const state = fold(builder.events)
  expect(state.surface.map(entry => entry.seq)).toEqual([...oracle])
}

describe('snapshot recognition', () => {
  it('reports no record for an empty session', () => {
    const view = viewOf([])
    expect(view.snapshot).toEqual({ status: 'none', seq: null, time: null, sections: [], totalSections: 0, omittedSections: 0 })
  })

  it('keeps a system prompt with no snapshot record distinct from a cleared snapshot', () => {
    const builder = logBuilder()
    builder.systemPrompt('you are a coding agent')
    const view = viewOf(builder.events)
    expect(view.snapshot.status).toBe('none')
    expect(view.totalMessages).toBe(1)
  })

  it('records a two-section snapshot with its sections, seq, and commit time', () => {
    const builder = logBuilder()
    builder.systemPrompt('prompt')
    const snapshot = builder.snapshot([
      { name: 'sandbox:policy', text: 'workspace-write' },
      { name: 'approval:policy', text: 'ask' },
    ])
    const view = viewOf(builder.events)
    expect(view.snapshot.status).toBe('present')
    expect(view.snapshot.seq).toBe(snapshot.seq)
    expect(view.snapshot.time).toBe(snapshot.time)
    expect(view.snapshot.sections.map(section => section.name)).toEqual(['sandbox:policy', 'approval:policy'])
    expect(view.snapshot.sections[0]?.text).toBe('workspace-write')
    expect(view.snapshot.totalSections).toBe(2)
    expect(view.snapshot.omittedSections).toBe(0)
  })

  it('keeps an unknown third-party section by its own name and text', () => {
    const builder = logBuilder()
    builder.snapshot([
      { name: 'third-party:policy', text: 'whatever the plugin assembled' },
    ])
    const [section] = viewOf(builder.events).snapshot.sections
    expect(section).toMatchObject({ name: 'third-party:policy', text: 'whatever the plugin assembled', truncated: false })
  })

  it('does not let another producer overwrite the unified snapshot', () => {
    const builder = logBuilder()
    builder.snapshot([{ name: 'sandbox:policy', text: 'workspace-write' }])
    builder.injected('@deepseek-ai/dsh-time-context', 'Current time: 2026-09-12T00:00:00Z')
    builder.injected('@deepseek-ai/dsh-tmux-context', 'tmux pane 3')
    builder.injected('some-other-plugin', 'unrelated', {
      form: 'snapshot',
      sections: [{ name: 'other', text: 'not ours' }],
    })
    const view = viewOf(builder.events)
    expect(view.snapshot.status).toBe('present')
    expect(view.snapshot.sections.map(section => section.name)).toEqual(['sandbox:policy'])
  })

  it('keeps other producers in the trajectory as injected nodes', () => {
    const builder = logBuilder()
    builder.injected('@deepseek-ai/dsh-time-context', 'Current time: 2026-09-12T00:00:00Z')
    const view = viewOf(builder.events)
    expect(view.nodes).toHaveLength(1)
    expect(view.nodes[0]?.kind).toBe('injected')
    expect(view.nodes[0]?.sourceName).toBe('@deepseek-ai/dsh-time-context')
    expect(view.nodes[0]?.excerpt).toBe('Current time: 2026-09-12T00:00:00Z')
  })

  it('does not treat the runtime-context heading as the clearing message', () => {
    const builder = logBuilder()
    builder.snapshot([{ name: 'sandbox:policy', text: 'workspace-write' }])
    builder.injected(
      '@deepseek-ai/dsh-system-prompt',
      'Current runtime context. This snapshot supersedes earlier runtime-context snapshots.',
    )
    const view = viewOf(builder.events)
    expect(view.snapshot.status).toBe('present')
    expect(view.snapshot.sections.map(section => section.name)).toEqual(['sandbox:policy'])
  })

  it('treats a cleared snapshot as cleared, not as the previous value', () => {
    const builder = logBuilder()
    builder.snapshot([{ name: 'sandbox:policy', text: 'workspace-write' }])
    const cleared = builder.clearSnapshot()
    const view = viewOf(builder.events)
    expect(view.snapshot.status).toBe('cleared')
    expect(view.snapshot.seq).toBe(cleared.seq)
    expect(view.snapshot.sections).toEqual([])
  })

  it('reports removed when a replacement takes the snapshot out of the surface', () => {
    const builder = logBuilder()
    builder.systemPrompt('prompt')
    const snapshot = builder.snapshot([{ name: 'sandbox:policy', text: 'workspace-write' }])
    // A compaction replaces the snapshot node alone with a summary node, so the
    // snapshot's own seq leaves the surface without being cleared. Surface node
    // 0 holds the system prompt and may only be rewritten by another
    // system/message, so the range starts after it.
    builder.compact(snapshot.seq, snapshot.seq, 'summary of the earlier context')
    const view = viewOf(builder.events)
    expect(view.snapshot.status).toBe('removed')
    expect(view.snapshot.seq).toBe(snapshot.seq)
    expect(view.snapshot.sections.map(section => section.name)).toEqual(['sandbox:policy'])
  })

  it('presents a restored snapshot with the same text under a new seq', () => {
    const builder = logBuilder()
    const first = builder.snapshot([{ name: 'sandbox:policy', text: 'workspace-write' }])
    const second = builder.snapshot([{ name: 'sandbox:policy', text: 'workspace-write' }])
    const view = viewOf(builder.events)
    expect(first.seq).not.toBe(second.seq)
    expect(view.snapshot.seq).toBe(second.seq)
    expect(view.snapshot.status).toBe('present')
    expect(view.snapshot.sections[0]?.text).toBe('workspace-write')
  })

  it('truncates an over-long section and says so', () => {
    const builder = logBuilder()
    builder.snapshot([{ name: 'sandbox:policy', text: 'x'.repeat(5000) }])
    const [section] = viewOf(builder.events).snapshot.sections
    expect(section?.text).toHaveLength(2000)
    expect(section?.truncated).toBe(true)
  })

  it('publishes only the configured number of sections and reports the rest', () => {
    const builder = logBuilder()
    const sections = Array.from({ length: 40 }, (_, index) => ({ name: `section-${index}`, text: 'text' }))
    builder.snapshot(sections)
    const view = viewOf(builder.events)
    expect(view.snapshot.sections).toHaveLength(32)
    expect(view.snapshot.totalSections).toBe(40)
    expect(view.snapshot.omittedSections).toBe(8)
  })
})

describe('state identity', () => {
  it('returns the same state reference for an event the plugin ignores', () => {
    const builder = logBuilder()
    builder.systemPrompt('prompt')
    const before = fold(builder.events)
    const ignored = builder.events.at(-1) as SessionEvent
    expect(reduceEvent(before, ignored, CONFIG)).not.toBe(before)
    const state = fold(builder.events)
    const header = (builder.session.append as unknown as (type: string, data: unknown) => SessionEvent)(
      'request/context',
      { route: { provider: 'deepseek', model: 'deepseek-chat' }, systemPromptUpdate: 'per-step' },
    )
    expect(reduceEvent(state, header, CONFIG)).toBe(state)
  })

  it('reuses the published view while the state reference is unchanged', () => {
    const builder = logBuilder()
    builder.snapshot([{ name: 'sandbox:policy', text: 'workspace-write' }])
    const state = fold(builder.events)
    expect(toView(state, CONFIG)).toBe(toView(state, CONFIG))
  })

  it('produces a new view when the state changes', () => {
    const builder = logBuilder()
    builder.snapshot([{ name: 'sandbox:policy', text: 'workspace-write' }])
    const first = fold(builder.events)
    builder.userMessage('next', 1, 1)
    const second = fold(builder.events)
    expect(second).not.toBe(first)
    expect(toView(second, CONFIG)).not.toBe(toView(first, CONFIG))
  })
})

describe('surface oracle agreement', () => {
  it('matches foldSurface for a multi-turn log with an injected snapshot', () => {
    const builder = logBuilder()
    builder.systemPrompt('prompt')
    builder.userMessage('hello', 1, 1)
    builder.snapshot([{ name: 'sandbox:policy', text: 'workspace-write' }])
    builder.assistantMessage('hi', 1, 1)
    builder.turnEnd(1)
    builder.turnStart(2)
    builder.stepStart(2, 1)
    builder.userMessage('again', 2, 1)
    builder.emptyAssistantMessage(2, 1)
    expectSurfaceMatchesOracle(builder)
  })

  it('matches foldSurface for a compacted log', () => {
    const builder = logBuilder()
    builder.systemPrompt('prompt')
    builder.userMessage('hello', 1, 1)
    builder.assistantMessage('hi', 1, 1)
    builder.userMessage('again', 2, 1)
    builder.assistantMessage('ok', 2, 1)
    builder.compact(1, 4, 'summary')
    expectSurfaceMatchesOracle(builder)
  })
})
