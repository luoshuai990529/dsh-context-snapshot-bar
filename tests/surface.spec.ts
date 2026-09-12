// @vitest-environment node
/**
 * Current-surface behaviour: the plugin's ordered index, its exact message
 * count, node classification, and tool-call correlation, checked against the
 * canonical `foldSurface` + `deriveEventMessage` oracle for every prefix of
 * each log.
 */

import { describe, expect, it } from 'vitest'
import { SessionSeq, deriveEventMessage, type SessionEvent } from '@deepseek-ai/dsh-session'
import { foldSurface } from '@deepseek-ai/dsh-session/surface'
import { toolCallView } from '../src/projection/node.ts'
import type { BarState } from '../src/shared/types.ts'
import { resolveConfig } from '../src/shared/config.ts'
import { initialState, reduceEvent } from '../src/projection/state.ts'
import { toView } from '../src/projection/view.ts'
import { ToolCallId } from '@deepseek-ai/dsh-llm'
import { logBuilder, text } from './fixtures/session-builder.ts'

const CONFIG = resolveConfig({})

/** Fold a log the way the projection drive does. */
function fold(events: readonly SessionEvent[]): BarState {
  return events.reduce((state, event) => reduceEvent(state, event, CONFIG), initialState(CONFIG))
}

/** The oracle's message seqs for a log. */
function oracleSeqs(events: readonly SessionEvent[]): number[] {
  const nodes = foldSurface(events).nodes
  return nodes
    .filter(seq => deriveEventMessage(events[seq as number] as SessionEvent) !== null)
    .map(seq => seq as number)
}

describe('owning turn', () => {
  it('gives a human message the turn that was open when it committed', () => {
    const builder = logBuilder()
    builder.systemPrompt('system prompt')
    builder.turnStart(1)
    builder.stepStart(1, 1)
    builder.userMessage('first question')
    builder.assistantMessage('first answer', 1, 1)
    builder.turnEnd(1)
    builder.turnStart(2)
    builder.stepStart(2, 1)
    builder.userMessage('second question')
    const view = toView(fold(builder.events), CONFIG)
    // The loop's boundary events carry the turn; a human message does not, so it
    // takes the one that was open — otherwise it belongs to no turn and reads as
    // a session anchor.
    expect(view.nodes.filter(node => node.kind === 'user').map(node => [node.excerpt, node.turn]))
      .toEqual([['first question', 1], ['second question', 2]])
    // The system prompt is appended with its own boundary, so it keeps the
    // turn the loop stamped on it rather than inheriting anything.
    expect(view.nodes.find(node => node.kind === 'system')?.turn).toBe(1)
  })

  it('leaves a human message committed between turns outside every turn', () => {
    const builder = logBuilder()
    builder.userMessage('queued before any turn')
    const view = toView(fold(builder.events), CONFIG)
    expect(view.nodes[0]?.turn).toBeNull()
  })
})

describe('surface index', () => {
  it('agrees with the oracle on a two-turn log', () => {
    const builder = logBuilder()
    builder.systemPrompt('system')
    builder.userMessage('first', 1, 1)
    builder.assistantMessage('answer', 1, 1)
    builder.turnEnd(1)
    builder.turnStart(2)
    builder.stepStart(2, 1)
    builder.userMessage('second', 2, 1)
    builder.assistantMessage('again', 2, 1)
    for (let length = 0; length <= builder.events.length; length += 1) {
      const prefix = builder.events.slice(0, length)
      expect(fold(prefix).surface.map(entry => entry.seq as number)).toEqual(oracleSeqs(prefix))
    }
  })

  it('counts only the messages the model sees', () => {
    const builder = logBuilder()
    builder.systemPrompt('system')
    builder.userMessage('hello', 1, 1)
    builder.emptyAssistantMessage(1, 1)
    builder.assistantMessage('visible', 1, 1)
    const view = toView(fold(builder.events), CONFIG)
    // The empty assistant message keeps its surface position but is not a message.
    expect(view.totalMessages).toBe(3)
    expect(view.nodes.map(node => node.excerpt)).toEqual(['system', 'hello', 'visible'])
  })

  it('keeps an empty system message as a position without counting it', () => {
    const builder = logBuilder()
    builder.systemPrompt('')
    builder.userMessage('hello', 1, 1)
    const state = fold(builder.events)
    expect(state.surface.map(entry => entry.message === null)).toEqual([true, false])
    expect(toView(state, CONFIG).totalMessages).toBe(1)
  })

  it('classifies system, user, injected, assistant, and tool-result nodes', () => {
    const builder = logBuilder()
    builder.systemPrompt('system')
    builder.userMessage('hello', 1, 1)
    builder.assistantMessage('calling', 1, 1)
    builder.toolCall('call-1', 'read', '{"path":"a.ts"}', 1, 1)
    builder.toolResult('call-1', [text('file body')], 1, 1)
    const nodes = toView(fold(builder.events), CONFIG).nodes
    expect(nodes.map(node => node.kind)).toEqual(['system', 'user', 'assistant', 'tool-result'])
    expect(nodes.map(node => node.title)).toEqual(['system prompt', 'user message', 'read', 'tool result'])
  })

  it('attaches tool calls to the assistant node that requested them', () => {
    const builder = logBuilder()
    builder.userMessage('hello', 1, 1)
    builder.assistantMessage('calling two tools', 1, 1)
    builder.toolCall('call-1', 'read', '{"path":"a.ts"}', 1, 1)
    builder.toolCall('call-2', 'grep', '{"pattern":"x"}', 1, 1)
    builder.toolResult('call-2', [text('second result')], 1, 1)
    builder.toolResult('call-1', [text('first result')], 1, 1)
    const view = toView(fold(builder.events), CONFIG)
    const assistant = view.nodes.find(node => node.kind === 'assistant')
    expect(assistant?.toolCalls.map(call => call.name)).toEqual(['read', 'grep'])
    expect(assistant?.toolCalls.map(call => call.callId)).toEqual(['call-1', 'call-2'])
    expect(assistant?.title).toBe('read')
    const results = view.nodes.filter(node => node.kind === 'tool-result')
    expect(results.map(node => node.resultFor)).toEqual(['call-2', 'call-1'])
    // A tool result is a user-role message but never a human message.
    expect(view.nodes.filter(node => node.kind === 'user')).toHaveLength(1)
  })

  it('bounds tool arguments and reports the truncation', () => {
    const builder = logBuilder()
    builder.assistantMessage('calling', 1, 1)
    builder.toolCall('call-1', 'write', `{"path":"a.ts","body":"${'x'.repeat(400)}"}`, 1, 1)
    const call = toView(fold(builder.events), CONFIG).nodes[0]?.toolCalls[0]
    expect(call?.argsExcerpt).toHaveLength(CONFIG.toolArgsChars)
    expect(call?.truncated).toBe(true)
  })

  it('records the turn and step that owned each node', () => {
    const builder = logBuilder()
    builder.turnStart(3)
    builder.stepStart(3, 2)
    builder.userMessage('hello', 3, 2)
    const node = toView(fold(builder.events), CONFIG).nodes[0]
    expect(node?.turn).toBe(3)
    expect(node?.step).toBe(2)
  })

  it('replaces a surface range by position, not by seq interval', () => {
    const builder = logBuilder()
    builder.systemPrompt('system')
    builder.userMessage('one', 1, 1)
    builder.assistantMessage('two', 1, 1)
    builder.userMessage('three', 1, 1)
    // Replace the middle node only: a numeric `seq >= start && seq <= end` test
    // would also take the node that a previous replace moved to a higher seq.
    builder.compact(1, 1, 'summary of "one"')
    const view = toView(fold(builder.events), CONFIG)
    expect(view.nodes.map(node => node.excerpt)).toEqual(['system', 'summary of "one"', 'two', 'three'])
    expect(fold(builder.events).surface.map(entry => entry.seq as number)).toEqual(oracleSeqs(builder.events))
  })

  it('replaces a surface range whose seqs are not in numeric order', () => {
    const builder = logBuilder()
    builder.systemPrompt('system')
    builder.userMessage('one', 1, 1)
    builder.assistantMessage('two', 1, 1)
    // Replacing node 1 lands a higher seq at its position.
    const reopenedSeq = builder.compact(1, 1, 'summary').seq
    builder.userMessage('three', 1, 1)
    // Now the standing node at position 1 has a HIGHER seq than the node at
    // position 2, so the range cannot be computed from the seq interval.
    builder.compact(reopenedSeq, 2, 'wide summary')
    expect(fold(builder.events).surface.map(entry => entry.seq as number)).toEqual(oracleSeqs(builder.events))
  })

  it('publishes the tail within the visible limit and reports what it dropped', () => {
    const builder = logBuilder()
    builder.systemPrompt('system')
    for (let index = 0; index < 130; index += 1) builder.userMessage(`message ${index}`, 1, 1)
    const view = toView(fold(builder.events), CONFIG)
    expect(view.totalMessages).toBe(131)
    expect(view.nodes).toHaveLength(CONFIG.visibleNodeLimit)
    expect(view.omittedMessages).toBe(131 - CONFIG.visibleNodeLimit)
    // The system prompt stays as the anchor even though the tail window is far past it.
    expect(view.nodes[0]?.kind).toBe('system')
    expect(view.nodes.at(-1)?.excerpt).toBe('message 129')
  })

  it('keeps every node when the log is shorter than the limit', () => {
    const builder = logBuilder()
    builder.systemPrompt('system')
    builder.userMessage('one', 1, 1)
    const view = toView(fold(builder.events), CONFIG)
    expect(view.nodes).toHaveLength(2)
    expect(view.omittedMessages).toBe(0)
  })
})

describe('toolCallView', () => {
  it('keeps short arguments verbatim', () => {
    expect(toolCallView(ToolCallId('call-1'), 'read', '{"path":"a.ts"}', CONFIG))
      .toEqual({ callId: 'call-1', name: 'read', argsExcerpt: '{"path":"a.ts"}', truncated: false })
  })

  it('bounds long arguments', () => {
    const call = toolCallView(ToolCallId('call-1'), 'read', 'x'.repeat(500), CONFIG)
    expect(call.argsExcerpt).toHaveLength(CONFIG.toolArgsChars)
    expect(call.truncated).toBe(true)
  })
})

describe('revision', () => {
  it('increments only when a published value changes', () => {
    const builder = logBuilder()
    builder.userMessage('hello', 1, 1)
    const first = fold(builder.events)
    const header = (builder.session.append as unknown as (type: string, data: unknown) => SessionEvent)(
      'request/context',
      { route: { provider: 'deepseek', model: 'deepseek-chat' }, systemPromptUpdate: 'per-step' },
    )
    const after = reduceEvent(first, header, CONFIG)
    expect(after).toBe(first)
    expect(toView(after, CONFIG).revision).toBe(toView(first, CONFIG).revision)
  })

  it('reports the latest committed change with its seq', () => {
    const builder = logBuilder()
    builder.userMessage('hello', 1, 1)
    const view = toView(fold(builder.events), CONFIG)
    expect(view.latestChange?.kind).toBe('append')
    expect(view.latestChange?.seq).toBe(0)
    expect(view.latestChange?.after).toHaveLength(1)
  })
})

describe('surface positions', () => {
  it('keeps a null-message position so a later replacement can find it', () => {
    const builder = logBuilder()
    builder.systemPrompt('')
    builder.userMessage('hello', 1, 1)
    const state = fold(builder.events)
    expect(state.surface[0]?.message).toBeNull()
    expect(state.surface.map(entry => SessionSeq(entry.seq))).toEqual(foldSurface(builder.events).nodes)
  })
})
