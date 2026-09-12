// @vitest-environment node
/**
 * The two Session-log readings the Host bundle performs itself, held equal to
 * the harness implementations they mirror.
 *
 * The plugin reads the log instead of importing the harness because a bundle row
 * whose module cannot be resolved leaves a fiber-less Loader entry, which aborts
 * `dsh` startup. That trade only holds while the local readings agree with the
 * Session package, so every event of a rich log and both sequence-validation
 * outcomes are compared here.
 */

import { describe, expect, it } from 'vitest'
import { deriveEventMessage, SessionSeq } from '@deepseek-ai/dsh-session'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import { producesMessage, sessionSeq } from '../src/session-log.ts'
import { logBuilder, text, type LogBuilder } from './fixtures/session-builder.ts'

/** A log carrying every surface shape the plugin folds. */
function richLog(): LogBuilder {
  const builder = logBuilder('session-session-log')
  builder.systemPrompt('you are a harness')
  builder.turnStart(1)
  builder.stepStart(1, 1)
  builder.userMessage('first question')
  builder.injected('@deepseek-ai/dsh-time-context', 'Current time: 2026-09-12T00:00:00Z')
  builder.snapshot([{ name: 'workspace', text: 'dsh-context-snapshot-bar' }])
  builder.assistantMessage('first answer', 1, 1)
  builder.emptyAssistantMessage(1, 1)
  builder.toolCall('call-1', 'bash', '{"command":"ls"}', 1, 1)
  builder.toolResult('call-1', [text('lib/index.js')], 1, 1)
  builder.stepEnd(1, 1)
  builder.turnEnd(1, 'completed')
  builder.turnStart(2)
  builder.stepStart(2, 1)
  builder.userMessage('second question')
  builder.assistantMessage('second answer', 2, 1)
  builder.compact(3, 4, 'the earlier messages, summarized')
  builder.prune('call-1', [text('pruned result')])
  builder.clearSnapshot()
  builder.stepEnd(2, 1)
  builder.turnEnd(2, 'completed')
  return builder
}

describe('Session-log readings', () => {
  it('agrees with deriveEventMessage on every event of a rich log', () => {
    const events = richLog().events
    expect(events.length).toBeGreaterThan(10)
    for (const event of events) {
      expect({ type: event.type, produces: producesMessage(event) })
        .toEqual({ type: event.type, produces: deriveEventMessage(event) !== null })
    }
  })

  it('agrees with deriveEventMessage on the empty-content rule of each role', () => {
    // Minimal event objects: both readings are pure functions of the event, and
    // the Session validator would only add surface bookkeeping here.
    const shape = (type: string, data: unknown): SessionEvent => ({ type, data }) as unknown as SessionEvent
    const message = (role: string, blocks: unknown[]) => ({ message: { role, content: blocks } })
    const cases: SessionEvent[] = [
      shape('assistant/message', message('assistant', [])),
      shape('assistant/message', message('assistant', [text('an answer')])),
      shape('system/message', message('system', [])),
      shape('system/message', message('system', [text('a prompt')])),
      shape('user/message', message('user', [])),
      shape('user/message', message('user', [text('a question')])),
      shape('tool/result', { message: { role: 'tool', content: [] } }),
      shape('turn/start', { turn: 1 }),
    ]
    for (const event of cases) {
      expect({ type: event.type, produces: producesMessage(event) })
        .toEqual({ type: event.type, produces: deriveEventMessage(event) !== null })
    }
    // The comparison above only proves agreement, so state the rule itself:
    // empty system and assistant messages project to no message, an empty user
    // message still does, and a boundary never does.
    expect(producesMessage(cases[0] as SessionEvent)).toBe(false)
    expect(producesMessage(cases[2] as SessionEvent)).toBe(false)
    expect(producesMessage(cases[4] as SessionEvent)).toBe(true)
    expect(producesMessage(cases[7] as SessionEvent)).toBe(false)
  })

  it('agrees with SessionSeq on admitted and rejected values', () => {
    for (const value of [0, 1, 42, Number.MAX_SAFE_INTEGER]) {
      expect(sessionSeq(value)).toBe(SessionSeq(value))
    }
    for (const value of [-1, -0, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 2]) {
      expect(() => sessionSeq(value)).toThrow(TypeError)
      expect(() => SessionSeq(value)).toThrow(TypeError)
    }
  })
})
