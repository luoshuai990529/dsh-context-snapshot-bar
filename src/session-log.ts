/**
 * The Session-log readings this plugin performs without importing the harness.
 *
 * A bundle row whose module cannot be resolved leaves a fiber-less Loader entry,
 * and `dsh` refuses to start on one, so the Host bundle imports no harness module
 * at all. The two readings below are rules of the Session format, and
 * `tests/session-log.spec.ts` holds each of them equal to the harness
 * implementation it mirrors.
 *
 * @module dsh-context-snapshot-bar/session-log
 */

import type { SessionEvent, SessionSeq } from '@deepseek-ai/dsh-session/types'

/**
 * Admit a numeric value as an existing Session event position.
 *
 * Mirrors the Session package's `SessionSeq`, whose brand is compile-time only:
 * the same validation admits the same number.
 *
 * @param value - non-negative safe integer admitted by the owning log operation.
 * @returns the same number with the Session-sequence brand.
 * @throws {TypeError} when `value` is not a non-negative safe integer.
 */
export function sessionSeq(value: number): SessionSeq {
  if (!Number.isSafeInteger(value) || value < 0 || Object.is(value, -0)) {
    throw new TypeError(`sessionSeq must be a non-negative safe integer, got ${String(value)}`)
  }
  return value as SessionSeq
}

/**
 * Whether a committed event contributes a message to the Session surface.
 *
 * Mirrors the Session package's `deriveEventMessage`, of which this plugin only
 * tests the null case: an empty-content `system/message` or `assistant/message`
 * projects to no message, `user/message` and `tool/result` always project to one,
 * and boundaries, attempts, and log-only records project to none.
 *
 * @param event - the committed event.
 * @returns whether the event produces a wire message.
 */
export function producesMessage(event: SessionEvent): boolean {
  switch (event.type) {
    case 'user/message':
    case 'tool/result':
      return true
    case 'system/message':
    case 'assistant/message':
      return event.data.message.content.length > 0
    default:
      return false
  }
}
