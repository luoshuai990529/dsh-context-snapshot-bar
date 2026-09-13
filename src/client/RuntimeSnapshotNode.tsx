/**
 * One runtime-context record as a node in the message trajectory: the record's
 * own status, position, section count, and — when the Host can answer — the
 * digest of that record's own bounded sections.
 *
 * The node never shows another record's text: a historical snapshot whose digest
 * is unavailable falls back to its own section text, labelled as a source
 * excerpt, rather than borrowing the newest record's summary.
 *
 * @module dsh-context-snapshot-bar/client/RuntimeSnapshotNode
 */

import { createContext, useContext } from 'react'
import type { NodeView } from '../shared/types.ts'
import { activeLocale, cls } from './display.ts'
import type { TranslateBar } from './locales.ts'
import { useSnapshotSummary, type SummaryCaller } from './summary.ts'

/**
 * Arrival and digest inputs the trajectory hands to each of its runtime nodes.
 *
 * `latestSeq` marks the newest valid record, `arriving` holds the seqs whose
 * one-shot arrival animation is playing, and `summaryCaller` is the digest
 * channel the Client provides asynchronously.
 */
export const RuntimeSnapshotContext = createContext<{
  /** Seq of the newest valid record, or null when none is in context. */
  latestSeq: number | null
  /** Seqs whose arrival animation is currently playing. */
  arriving: ReadonlySet<number>
  /** Reads the digest channel's caller, if the Client has one. */
  summaryCaller?: (() => SummaryCaller | undefined) | undefined
}>({ latestSeq: null, arriving: new Set() })

/**
 * Draw one runtime snapshot node.
 *
 * @param props - the record's own node view and the card's copy.
 * @returns the node element.
 */
export function RuntimeSnapshotNode({ node, t }: { node: NodeView; t: TranslateBar }) {
  const context = useContext(RuntimeSnapshotContext)
  const record = node.runtimeSnapshot
  const summary = useSnapshotSummary(context.summaryCaller,
    record?.status === 'present' && record.sections.length > 0 ? {
      snapshotSeq: Number(node.seq),
      locale: activeLocale(t),
      sections: record.sections,
    } : null)
  if (record === undefined) return null
  const cleared = record.status === 'cleared'
  const text = cleared ? t('runtime.cleared') : summary.status === 'ready' ? summary.text
    : summary.status === 'loading' ? t('snapshot.digest.loading')
    : record.sections.map(section => section.text).join(' · ') || node.excerpt
  return <article className={cls('runtime-node', context.arriving.has(Number(node.seq)) && 'runtime-arrival')} data-runtime-seq={node.seq}>
    <div className={cls('runtime-node-head')}>
      <svg className={cls('runtime-node-icon')} viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="5" width="14" height="14" rx="3" /><path d="M9 1v4m6-4v4M9 19v4m6-4v4M1 9h4m-4 6h4m14-6h4m-4 6h4M9 9h6v6H9z" /></svg>
      <strong>{t('runtime.title')}</strong>
      <span className={cls('runtime-node-badge')}>{t(cleared ? 'snapshot.clearedLabel' : context.latestSeq === Number(node.seq) ? 'runtime.latest' : 'runtime.history')}</span>
      <span className={cls('runtime-node-meta')}>{t('runtime.position', { turn: node.turn ?? '—', step: node.step ?? '—', seq: Number(node.seq) })}</span>
    </div>
    <p className={cls('runtime-node-digest')} title={text}>{text}</p>
    {!cleared && <div className={cls('runtime-node-footer')}>{t('runtime.sections', { count: record.totalSections })} · {t(summary.status === 'ready' ? 'runtime.digest' : summary.status === 'loading' ? 'snapshot.digest.loading' : 'runtime.excerpt')}</div>}
  </article>
}
