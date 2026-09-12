/**
 * Client half of the snapshot digest: ask the Host to describe the record the
 * card is showing, and report what came back.
 *
 * The request carries the contributions the card already displays rather than a
 * session identity, so the Host needs no session lookup and answers the same
 * record identically wherever it appears. Every outcome is a state the card can
 * draw: no channel, in flight, ready, or unavailable.
 *
 * @module dsh-context-snapshot-bar/client/summary
 */

import { useEffect, useRef, useState } from 'react'
import { SUMMARY_CHANNEL, SUMMARY_ENDPOINT } from '../shared/channel.ts'
import type { SnapshotSummaryRequest, SnapshotSummaryResponse } from '../shared/types.ts'

/** How often the card re-checks for a digest channel that has not loaded yet. */
const CALLER_RETRY_MS = 250

/** How many times it re-checks before leaving the digest out for this mount. */
const CALLER_RETRY_LIMIT = 20

/** The slice of the Client Connection service this card uses. */
export type SummaryCaller = (
  channel: string,
  endpoint: string,
  payload: unknown,
  signal?: AbortSignal,
) => Promise<unknown>

/** Why the Host could not answer a digest request. */
export type SummaryUnavailableReason = Extract<SnapshotSummaryResponse, { status: 'unavailable' }>['reason']

/** What the card knows about the digest for the record it is showing. */
export type SummaryState =
  | { readonly status: 'idle' }
  | { readonly status: 'loading' }
  | { readonly status: 'ready', readonly text: string, readonly model: string }
  | { readonly status: 'unavailable', readonly reason: SummaryUnavailableReason, readonly detail?: string }

/** Shared idle value, so an unchanged state keeps its reference and re-renders nothing. */
const IDLE: SummaryState = { status: 'idle' }

/** Shared in-flight value, for the same reason. */
const LOADING: SummaryState = { status: 'loading' }

/** Narrow the transport's result envelope to this endpoint's own answer. */
function readResponse(result: unknown): SummaryState {
  if (result === null || typeof result !== 'object') return { status: 'unavailable', reason: 'failed' }
  const envelope = result as { ok?: unknown, value?: unknown }
  if (envelope.ok !== true) return { status: 'unavailable', reason: 'failed' }
  const value = envelope.value as SnapshotSummaryResponse | undefined
  if (value === undefined || typeof value !== 'object') return { status: 'unavailable', reason: 'failed' }
  if (value.status === 'ready' && typeof value.text === 'string' && typeof value.model === 'string') {
    return { status: 'ready', text: value.text, model: value.model }
  }
  if (value.status === 'unavailable') {
    return typeof value.detail === 'string' && value.detail !== ''
      ? { status: 'unavailable', reason: value.reason, detail: value.detail }
      : { status: 'unavailable', reason: value.reason }
  }
  return { status: 'unavailable', reason: 'failed' }
}

/** The record's own identity: the same seq, language, and entries answer once. */
function identityOf(request: SnapshotSummaryRequest | null): string {
  if (request === null) return ''
  return [
    String(request.snapshotSeq),
    request.locale,
    ...request.sections.map(section => `${section.name}=${section.text}`),
  ].join('\u0000')
}

/**
 * Follow one snapshot record's digest.
 *
 * The caller arrives through a getter because the Client's connection service
 * activates asynchronously: the card mounts before it is there, so the hook
 * re-checks for a bounded time. Both the getter and the request are read through
 * refs and the effect depends only on the record's identity, because a caller
 * that rebuilt either value on every render would otherwise re-run the effect
 * forever. A Client without a digest channel leaves the digest `idle`, and the
 * card then omits the section rather than showing it empty.
 *
 * @param getCaller - reads the current Connection caller, if any.
 * @param request - the record to describe, or null when the card shows none.
 * @returns the digest state for the current request.
 */
export function useSnapshotSummary(
  getCaller: (() => SummaryCaller | undefined) | undefined,
  request: SnapshotSummaryRequest | null,
): SummaryState {
  const [state, setState] = useState<SummaryState>(IDLE)
  const [attempt, setAttempt] = useState(0)
  const readCaller = useRef(getCaller)
  const readRequest = useRef(request)
  readCaller.current = getCaller
  readRequest.current = request
  const identity = identityOf(request)

  useEffect(() => {
    const pending = readRequest.current
    if (pending === null || identity === '') {
      setState(previous => previous.status === 'idle' ? previous : IDLE)
      return
    }
    const call = readCaller.current?.()
    if (call === undefined) {
      setState(previous => previous.status === 'idle' ? previous : IDLE)
      if (attempt >= CALLER_RETRY_LIMIT) return
      const retry = setTimeout(() => { setAttempt(count => count + 1) }, CALLER_RETRY_MS)
      return () => { clearTimeout(retry) }
    }
    const controller = new AbortController()
    setState(previous => previous.status === 'loading' ? previous : LOADING)
    let live = true
    call(SUMMARY_CHANNEL, SUMMARY_ENDPOINT, pending, controller.signal).then(
      (result) => { if (live) setState(readResponse(result)) },
      () => { if (live) setState({ status: 'unavailable', reason: 'failed' }) },
    )
    return () => {
      live = false
      controller.abort()
    }
    // The identity covers the record and its language; `attempt` only advances
    // while the digest channel is still missing.
  }, [identity, attempt])

  return state
}
