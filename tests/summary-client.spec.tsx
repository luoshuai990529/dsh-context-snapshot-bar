// @vitest-environment jsdom
/**
 * The Client half of the digest: which record it asks about, and what it does
 * while the Client's connection service is not there yet.
 */

import { describe, expect, it } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useSnapshotSummary, type SummaryCaller } from '../src/client/summary.ts'
import { SUMMARY_CHANNEL, SUMMARY_ENDPOINT } from '../src/shared/channel.ts'
import type { SnapshotSummaryRequest } from '../src/shared/types.ts'

/** One request the card would send. */
const REQUEST: SnapshotSummaryRequest = {
  snapshotSeq: 12,
  locale: 'zh',
  sections: [{ name: 'sandbox:policy', text: 'policy text' }],
}

/** A caller that answers ready for the digest endpoint. */
function readyCaller(): SummaryCaller & { calls: unknown[][] } {
  const calls: unknown[][] = []
  const call = (channel: string, endpoint: string, payload: unknown): Promise<unknown> => {
    calls.push([channel, endpoint, payload])
    return Promise.resolve({ ok: true, value: { status: 'ready', text: '摘要', model: 'p/m' } })
  }
  return Object.assign(call, { calls })
}

describe('useSnapshotSummary', () => {
  it('stays idle without a request so a hidden card costs no call', async () => {
    const call = readyCaller()
    const { result } = renderHook(() => useSnapshotSummary(() => call, null))
    expect(result.current.status).toBe('idle')
    expect(call.calls).toHaveLength(0)
  })

  it('asks the digest channel for the record it is showing', async () => {
    const call = readyCaller()
    const { result } = renderHook(() => useSnapshotSummary(() => call, REQUEST))
    await waitFor(() => { expect(result.current.status).toBe('ready') })
    expect(result.current).toEqual({ status: 'ready', text: '摘要', model: 'p/m' })
    expect(call.calls[0]?.[0]).toBe(SUMMARY_CHANNEL)
    expect(call.calls[0]?.[1]).toBe(SUMMARY_ENDPOINT)
    expect(call.calls[0]?.[2]).toBe(REQUEST)
  })

  it('waits for a connection service that has not activated yet', async () => {
    const call = readyCaller()
    let available: SummaryCaller | undefined
    const { result } = renderHook(() => useSnapshotSummary(() => available, REQUEST))
    expect(result.current.status).toBe('idle')
    available = call
    // The hook re-checks on its own; no plugin-body state is involved.
    await waitFor(() => { expect(result.current.status).toBe('ready') }, { timeout: 2000 })
  })

  it('reports a failed call as unavailable rather than throwing', async () => {
    const failing: SummaryCaller = () => Promise.reject(new Error('transport down'))
    const { result } = renderHook(() => useSnapshotSummary(() => failing, REQUEST))
    await waitFor(() => { expect(result.current.status).toBe('unavailable') })
    expect(result.current).toEqual({ status: 'unavailable', reason: 'failed' })
  })

  it('passes the Host refusal through with its reason', async () => {
    const refusing: SummaryCaller = () => Promise.resolve({ ok: true, value: { status: 'unavailable', reason: 'unconfigured' } })
    const { result } = renderHook(() => useSnapshotSummary(() => refusing, REQUEST))
    await waitFor(() => { expect(result.current.status).toBe('unavailable') })
    expect(result.current).toEqual({ status: 'unavailable', reason: 'unconfigured' })
  })

  it('never asks twice for the same record while it stays mounted', async () => {
    const call = readyCaller()
    const { rerender } = renderHook(() => useSnapshotSummary(() => call, REQUEST))
    await waitFor(() => { expect(call.calls.length).toBe(1) })
    rerender()
    await new Promise(resolve => setTimeout(resolve, 50))
    expect(call.calls.length).toBe(1)
  })
})
