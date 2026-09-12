/**
 * The context column: the prototype's own two tabs, fixed above whichever card
 * is showing, so either card is one click away for as long as the column is
 * open.
 *
 * The composer entry opens this column with the snapshot tab selected, which
 * arrives as the tab's navigation parameters; a later navigation to the same
 * tab re-applies them.
 *
 * @module dsh-context-snapshot-bar/client/ContextPanel
 */

import { useEffect, useState } from 'react'
import type { BarView } from '../shared/types.ts'
import type { ContextSnapshotBarKey, TranslateBar } from './locales.ts'
import { SCOPE, cls } from './display.ts'
import { SnapshotCard } from './SnapshotCard.tsx'
import { TrajectoryCard } from './TrajectoryCard.tsx'

/** Which card the column is showing. */
export type ContextPane = 'trajectory' | 'snapshot'

/** Props for the column. */
export interface ContextPanelProps {
  /** The current projection value, absent until the first baseline or frame carries the key. */
  view: BarView | undefined
  /** The pane the opener asked for, or undefined when nobody asked. */
  requested: ContextPane | undefined
  /** Bumped by every navigation to this tab, so a repeat open re-applies the request. */
  navigationRevision: number
  /** Translate a key in this plugin's namespace. */
  t: TranslateBar
}

/** The two tabs, in the order the prototype draws them. */
const TABS = [
  { pane: 'trajectory', label: 'panel.trajectory' },
  { pane: 'snapshot', label: 'panel.snapshot' },
] as const satisfies readonly { pane: ContextPane; label: ContextSnapshotBarKey }[]

/**
 * Draw the column with its tabs and the selected card.
 * @param props - the projection value, the opener's request, and the copy.
 * @returns the column element.
 */
export function ContextPanel({ view, requested, navigationRevision, t }: ContextPanelProps) {
  const [pane, setPane] = useState<ContextPane>(requested ?? 'trajectory')
  // A navigation is a request, not a mode: honour it whenever the opener asks
  // again, and otherwise leave the reader's own choice alone.
  useEffect(() => {
    if (requested !== undefined) setPane(requested)
  }, [requested, navigationRevision])

  return (
    <div className={cls(SCOPE, 'csb-column')}>
      <div className={cls('context-sidebar-body')}>
        <div className={cls('context-tabs')} role="tablist" aria-label={t('panel.context')}>
          {TABS.map(tab => (
            <button
              type="button"
              key={tab.pane}
              role="tab"
              aria-pressed={pane === tab.pane}
              onClick={() => { setPane(tab.pane) }}
            >
              {t(tab.label)}
            </button>
          ))}
        </div>
        {pane === 'trajectory' ? <TrajectoryCard view={view} t={t} /> : <SnapshotCard view={view} t={t} />}
      </div>
    </div>
  )
}
