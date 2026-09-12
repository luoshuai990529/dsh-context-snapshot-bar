/**
 * The composer entry: the prototype's runtime-snapshot row, docked above the
 * input. It reads the same projection the pane does, reports the same summary
 * and standing, and its click reveals the snapshot card in the right column —
 * the prototype wires the identical toggle to the identical action.
 *
 * @module dsh-context-snapshot-bar/client/ComposerEntry
 */

import type { BarView, SnapshotStatus } from '../shared/types.ts'
import type { ContextSnapshotBarKey, TranslateBar } from './locales.ts'
import { SCOPE, cls } from './display.ts'

/** What the entry asks of the right column. */
export interface ComposerEntryInjected {
  /**
   * Open the snapshot card, revealing the column.
   * @returns nothing; the column records the navigation.
   */
  open: () => void
}

/** Props for the composer entry. */
export interface ComposerEntryProps extends ComposerEntryInjected {
  /** The current projection value, absent until the first baseline or frame carries the key. */
  view: BarView | undefined
  /** Translate a key in this plugin's namespace. */
  t: TranslateBar
}

/** Copy key naming each standing, as the row's state reads. */
const STATUS_KEYS = {
  none: 'snapshot.status.none',
  present: 'snapshot.status.present',
  cleared: 'snapshot.status.cleared',
  removed: 'snapshot.status.removed',
} as const satisfies Record<SnapshotStatus, ContextSnapshotBarKey>

/**
 * The row's summary line: the committed sections and their time, the cleared
 * marker, or the fact that nothing was committed yet.
 * @param view - the current projection value.
 * @param t - namespace-bound translate.
 * @returns the line drawn beside the title.
 */
export function entrySummary(view: BarView | undefined, t: TranslateBar): string {
  const snapshot = view?.snapshot
  if (snapshot === undefined || snapshot.status === 'none') return t('snapshot.status.none')
  if (snapshot.status === 'cleared') return t('snapshot.status.cleared')
  if (snapshot.time === null) return t('snapshot.summaryLine', { count: snapshot.totalSections, time: '—' })
  return t('snapshot.summaryLine', {
    count: snapshot.totalSections,
    time: new Date(snapshot.time).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }),
  })
}

/**
 * Draw the composer row.
 * @param props - the projection value, the column opener, and the copy.
 * @returns the entry element.
 */
export function ComposerEntry({ view, open, t }: ComposerEntryProps) {
  const standing: SnapshotStatus = view?.snapshot.status ?? 'none'
  return (
    <div className={cls(SCOPE, 'csb-entry')}>
      <section className={cls('snapshot-card')} aria-label={t('snapshot.toggleLabel')}>
        <button type="button" className={cls('snapshot-toggle')} aria-label={t('entry.open')} onClick={open}>
          <span className={cls('snapshot-icon')} aria-hidden="true">⌁</span>
          <span className={cls('snapshot-main')}>
            <span className={cls('snapshot-title')}>{t('snapshot.title')}</span>
            <span className={cls('snapshot-summary')}>{entrySummary(view, t)}</span>
          </span>
          <span className={cls('snapshot-state', standing === 'cleared' && 'cleared', standing === 'removed' && 'removed')}>
            {t(STATUS_KEYS[standing])}
          </span>
          <svg className={cls('chevron')} viewBox="0 0 24 24" aria-hidden="true">
            <path d="m7 10 5 5 5-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </section>
    </div>
  )
}
