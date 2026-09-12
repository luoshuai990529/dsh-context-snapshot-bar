/**
 * The runtime-snapshot card: the prototype's snapshot pane — heading, caption,
 * then the detail with the standing's note, the commit coordinates, the copy
 * control, and the committed sections under their producer names.
 *
 * @module dsh-context-snapshot-bar/client/SnapshotCard
 */

import { useEffect, useState } from 'react'
import type { BarView, SectionView, SnapshotStatus, SnapshotView } from '../shared/types.ts'
import type { SummaryState, SummaryUnavailableReason } from './summary.ts'
import type { ContextSnapshotBarKey, TranslateBar } from './locales.ts'
import { SCOPE, cls, digestLines, hasSectionLabel, sectionLabel } from './display.ts'
import { commitIdentity } from './motion.ts'

/** Props for the snapshot card. */
export interface SnapshotCardProps {
  /** The current projection value, absent until the first baseline or frame carries the key. */
  view: BarView | undefined
  /** Translate a key in this plugin's namespace. */
  t: TranslateBar
  /**
   * The model-written digest of the record on screen. Absent when the Client has
   * no digest channel, which leaves the card showing the raw record alone.
   */
  summary?: SummaryState
}

/** Copy key naming why a digest is unavailable. */
const DIGEST_REASON_KEYS = {
  disabled: 'snapshot.digest.disabled',
  unconfigured: 'snapshot.digest.unconfigured',
  failed: 'snapshot.digest.failed',
} as const satisfies Record<SummaryUnavailableReason, ContextSnapshotBarKey>

/** Copy key naming each standing. */
const STATUS_KEYS = {
  none: 'snapshot.status.none',
  present: 'snapshot.status.present',
  cleared: 'snapshot.status.cleared',
  removed: 'snapshot.status.removed',
} as const satisfies Record<SnapshotStatus, ContextSnapshotBarKey>

/** Copy key explaining each standing. */
const NOTE_KEYS = {
  none: 'snapshot.note.none',
  present: 'snapshot.note.present',
  cleared: 'snapshot.note.cleared',
  removed: 'snapshot.note.removed',
} as const satisfies Record<SnapshotStatus, ContextSnapshotBarKey>

/** Modifier the stylesheet colours a standing by, as the prototype's state chip does. */
const STATUS_MODIFIERS: Record<SnapshotStatus, string | false> = {
  none: false,
  present: false,
  cleared: 'cleared',
  removed: 'removed',
}

/** The outcome of the copy action. */
type CopyState = 'idle' | 'copied' | 'failed'

/** The producer every unified runtime-context snapshot is attributed to. */
const SNAPSHOT_SOURCE = '@deepseek-ai/dsh-system-prompt'

/** The body a cleared commit carries, as the producer commits it. */
const CLEARED_BODY = 'Current runtime context: none. Earlier runtime-context snapshots no longer apply.'

/**
 * Format a commit time for display.
 * @param time - milliseconds since the epoch.
 * @returns the local time as `HH:MM:SS`.
 */
export function formatTime(time: number): string {
  return new Date(time).toLocaleTimeString()
}

/**
 * Draw the snapshot pane.
 * @param props - the projection value and the card's copy.
 * @returns the card element.
 */
export function SnapshotCard({ view, t, summary = { status: 'idle' } }: SnapshotCardProps) {
  const [copy, setCopy] = useState<CopyState>('idle')
  const snapshot = view?.snapshot
  const standing: SnapshotStatus = snapshot?.status ?? 'none'
  const recorded = snapshot !== undefined && snapshot.seq !== null
  // A first look shows the record as it stands; a later commit flashes once, as
  // the prototype's render(key, flash) does.
  const identity = commitIdentity(
    standing,
    snapshot?.seq === null || snapshot?.seq === undefined ? null : Number(snapshot.seq),
  )
  const [flash, setFlash] = useState({ id: identity, count: 0 })
  useEffect(() => {
    setFlash(previous => (previous.id === identity ? previous : { id: identity, count: previous.count + 1 }))
  }, [identity])
  return (
    <div className={SCOPE}>
      <section className={cls('snapshot-pane')} aria-label={t('snapshot.title')}>
        <h2>{t('snapshot.title')}</h2>
        <p className={cls('pane-caption')}>{t('snapshot.paneCaption')}</p>
        <div className={cls('snapshot-detail', 'open', flash.count > 0 && 'state-change')} key={flash.count}>
          <p className={cls('snapshot-note')}>{t(NOTE_KEYS[standing])}</p>
          {summary.status === 'idle' ? null : (
            <section className={cls('snapshot-digest')} aria-label={t('snapshot.digestCaption')}>
              <p className={cls('digest-caption')}>{t('snapshot.digestCaption')}</p>
              {summary.status === 'loading' ? <p className={cls('digest-note')}>{t('snapshot.digest.loading')}</p> : null}
              {summary.status === 'ready'
                ? (
                    <ul className={cls('digest-list')}>
                      {digestLines(summary.text).map((line, index) => (
                        // Each line names what it describes, so the list needs no
                        // label of its own and no pairing with the record's entries.
                        <li className={cls('digest-item')} key={`${String(index)}-${line.slice(0, 24)}`}>{line}</li>
                      ))}
                    </ul>
                  )
                : null}
              {summary.status === 'unavailable'
                ? (
                    <>
                      <p className={cls('digest-note')}>{t(DIGEST_REASON_KEYS[summary.reason])}</p>
                      {summary.detail === undefined
                        ? null
                        : <p className={cls('digest-detail')}>{summary.detail}</p>}
                    </>
                  )
                : null}
              {summary.status === 'ready'
                ? <p className={cls('digest-note')}>{t('snapshot.digest.model', { model: summary.model })}</p>
                : null}
            </section>
          )}
          <section className={cls('snapshot-raw')} aria-label={t('snapshot.rawCaption')}>
            <p className={cls('digest-caption')}>{t('snapshot.rawCaption')}</p>
          {recorded && snapshot !== undefined ? (
            <>
              <div className={cls('meta-row')}>
                {snapshot.time === null ? null : <span>{formatTime(snapshot.time)}</span>}
                <span>{`${t('snapshot.event')} #${snapshot.seq}`}</span>
                <span>{t('snapshot.metaSource')}</span>
              </div>
              <div className={cls('copy-row')}>
                <span className={cls('source')}>{SNAPSHOT_SOURCE}</span>
                <button
                  type="button"
                  className={cls('copy-button')}
                  onClick={() => { void copySnapshot(snapshot, t, setCopy) }}
                >
                  {copy === 'idle' ? t('snapshot.copy') : copy === 'copied' ? t('snapshot.copied') : t('snapshot.copyFailed')}
                </button>
              </div>
            </>
          ) : null}
          {standing === 'cleared' ? (
            <div className={cls('section-list')}>
              <div className={cls('section')}>
                <div className={cls('section-head')}>
                  <span className={cls('section-label')}>{t('snapshot.clearedLabel')}</span>
                  <span className={cls('section-name')}>runtime-context</span>
                </div>
                <pre className={cls('source-text')}>{CLEARED_BODY}</pre>
              </div>
            </div>
          ) : null}
          {snapshot === undefined || snapshot.sections.length === 0 ? null : (
            <div className={cls('section-list')}>
              {snapshot.sections.map(section => (
                <div className={cls('section')} key={section.name}>
                  <div className={cls('section-head')}>
                    <span className={cls('section-label')}>{sectionLabel(section.name, t)}</span>
                    <span className={cls('section-name')}>
                      {hasSectionLabel(section.name) ? section.name : null}
                      {section.truncated ? ` · ${t('snapshot.truncated')}` : null}
                    </span>
                  </div>
                  <pre className={cls('source-text')}>{section.text}</pre>
                </div>
              ))}
            </div>
          )}
          {snapshot === undefined || snapshot.omittedSections === 0
            ? null
            : <p className={cls('snapshot-note')}>{t('snapshot.omittedSections', { count: snapshot.omittedSections })}</p>}
          </section>
          {standing === 'none' ? null : (
            <p className={cls('snapshot-standing')}>
              <span className={cls('state', STATUS_MODIFIERS[standing])}>{t(STATUS_KEYS[standing])}</span>
            </p>
          )}
        </div>
      </section>
    </div>
  )
}

/**
 * Copy the text the card is showing, and report whether the write happened.
 *
 * Only displayed text is copied: truncated contributions are never presented as
 * the complete recorded snapshot.
 *
 * @param snapshot - the snapshot view being shown.
 * @param t - the namespace translator.
 * @param report - receives the outcome.
 */
async function copySnapshot(
  snapshot: SnapshotView,
  t: TranslateBar,
  report: (state: CopyState) => void,
): Promise<void> {
  const truncated = snapshot.sections.some((section: SectionView) => section.truncated) || snapshot.omittedSections > 0
  const body = snapshot.sections
    .map(section => `${sectionLabel(section.name, t)}\n${section.text}`)
    .join('\n\n')
  const text = truncated ? `${body}\n\n[${t('snapshot.truncated')}]` : body
  try {
    const clipboard = globalThis.navigator?.clipboard
    if (clipboard === undefined) throw new Error('clipboard unavailable')
    await clipboard.writeText(text)
    report('copied')
  } catch {
    report('failed')
  }
}
