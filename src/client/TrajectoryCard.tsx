/**
 * The conversation-trajectory card, as the v5 prototype draws it: a
 * **turn-first** record. The header keeps the glyph, the role strip and the
 * state; the detail is a round list holding, newest turn first, the optional
 * new-snapshot line, the attempt marker, one expandable card per turn, the
 * compaction summary once one committed, and the standing anchor lines.
 *
 * A turn card opens into its tool cycles — each cycle opens into the call's
 * arguments and the seqs that pair it with its result — and its final
 * assistant conclusion. The summary opens into the excerpts, the source seqs,
 * and the comparison with the turn it replaced.
 *
 * Token estimates are deliberately absent: the prototype's numbers are sample
 * data, and the projection carries none, so the card states what it knows —
 * how many calls a turn made — instead of inventing a figure.
 *
 * @module dsh-context-snapshot-bar/client/TrajectoryCard
 */

import { useState } from 'react'
import type { BarView, AttemptPhase, NodeView } from '../shared/types.ts'
import type { ContextSnapshotBarKey, TranslateBar } from './locales.ts'
import { KIND_KEYS, SCOPE, cls } from './display.ts'
import { chipsFor, prunedSeqOf, type ToolChip } from './trajectory.ts'

/** Props for the trajectory card. */
export interface TrajectoryCardProps {
  /** The current projection value, absent until the first baseline or frame carries the key. */
  view: BarView | undefined
  /** Translate a key in this plugin's namespace. */
  t: TranslateBar
}

/** Copy key naming each attempt phase's sentence. */
const ATTEMPT_KEYS = {
  idle: 'trajectory.attempt.idle',
  generating: 'trajectory.attempt.generating',
  'awaiting-replacement': 'trajectory.attempt.awaiting-replacement',
  completed: 'trajectory.attempt.completed',
  failed: 'trajectory.attempt.failed',
  interrupted: 'trajectory.attempt.interrupted',
} as const satisfies Record<AttemptPhase, ContextSnapshotBarKey>

/** Phases whose process the card records as one inline marker. */
const MARKED_PHASES: ReadonlySet<AttemptPhase> = new Set([
  'generating',
  'awaiting-replacement',
  'completed',
  'failed',
  'interrupted',
])

/** The role tokens the header's strip repeats, in the prototype's order. */
const STRIP_KEYS = [
  'trajectory.strip.system',
  'trajectory.strip.injected',
  'trajectory.strip.human',
  'trajectory.strip.assistantTools',
] as const satisfies readonly ContextSnapshotBarKey[]

/** One turn's own nodes, in surface order. */
interface Turn {
  /** The turn number the loop assigned. */
  readonly turn: number
  /** Every retained node this turn owns. */
  readonly nodes: readonly NodeView[]
}

/** One tool cycle inside a turn: the call, its owning assistant, and its result. */
interface Cycle {
  /** The invocation and its resolved result. */
  readonly chip: ToolChip
  /** The seq of the assistant message that requested it. */
  readonly ownerSeq: number
}

/**
 * Group the retained nodes into turns, in surface order.
 *
 * The loop stamps a system message with the turn and step it was rendered in,
 * but a system prompt is the session's anchor, not a turn's content: it stays
 * out of the grouping and reads as a leaf at the end of the list. Without that
 * it becomes a turn card whose "question" is the prompt text.
 * @param nodes - the retained nodes, in surface order.
 * @returns the turns, oldest first.
 */
function turnsOf(nodes: readonly NodeView[]): readonly Turn[] {
  const byTurn = new Map<number, NodeView[]>()
  for (const node of nodes) {
    if (node.turn === null || node.kind === 'system') continue
    const bucket = byTurn.get(node.turn)
    if (bucket === undefined) byTurn.set(node.turn, [node])
    else bucket.push(node)
  }
  return [...byTurn.entries()]
    .map(([turn, owned]) => ({ turn, nodes: owned }))
    .sort((left, right) => left.turn - right.turn)
}

/**
 * The standing anchors: the session's system prompt and anything committed
 * outside a turn.
 * @param nodes - the retained nodes, in surface order.
 * @returns the anchor nodes, in surface order.
 */
function anchorsOf(nodes: readonly NodeView[]): readonly NodeView[] {
  return nodes.filter(node => node.turn === null || node.kind === 'system')
}

/**
 * A turn's question: its human-authored message. A turn may open with injected
 * context, which is not what the reader asked, and a turn whose human prompt
 * was replaced has none left — that turn states its number alone rather than
 * presenting some other message as the question.
 * @param turn - the turn to read.
 * @returns the question line, or an empty string when the turn has none.
 */
function questionOf(turn: Turn): string {
  const asked = turn.nodes.find(node => node.kind === 'user' && node.sourceName === null)
  return asked?.excerpt ?? ''
}

/**
 * The context a turn carried in: everything injected on its behalf, which the
 * card lists as lines rather than dropping.
 * @param turn - the turn to read.
 * @returns the injected nodes, in surface order.
 */
function injectedOf(turn: Turn): readonly NodeView[] {
  return turn.nodes.filter(node => node.kind === 'injected'
    || (node.kind === 'user' && node.sourceName !== null))
}

/** A turn's final conclusion: its last assistant message that requested nothing. */
function finalOf(turn: Turn): string | null {
  const answers = turn.nodes.filter(node => node.kind === 'assistant' && node.toolCalls.length === 0)
  return answers.at(-1)?.excerpt ?? null
}

/** Every tool cycle one turn ran, in surface order. */
function cyclesOf(turn: Turn, all: readonly NodeView[], prunedSeq: number | null): readonly Cycle[] {
  return turn.nodes.flatMap(node => (node.kind === 'assistant'
    ? chipsFor(node, all, prunedSeq).map(chip => ({ chip, ownerSeq: Number(node.seq) }))
    : []))
}

/** One cycle's result line, as the prototype words each state. */
function cycleResult(cycle: Cycle, t: TranslateBar): string {
  const { chip } = cycle
  if (chip.pruned) return t('trajectory.cycle.pruned')
  if (chip.resultExcerpt === null) return t('trajectory.cycle.waiting')
  return chip.resultExcerpt
}

/**
 * Draw the trajectory card.
 * @param props - the projection value and the card's copy.
 * @returns the card element.
 */
export function TrajectoryCard({ view, t }: TrajectoryCardProps) {
  const [expanded, setExpanded] = useState(true)
  const [openTurns, setOpenTurns] = useState<ReadonlySet<string>>(NO_STRINGS)
  const [openCalls, setOpenCalls] = useState<ReadonlySet<string>>(NO_STRINGS)
  const [summaryOpen, setSummaryOpen] = useState(false)
  const [archiveOpen, setArchiveOpen] = useState(false)
  const nodes = view?.nodes ?? []

  const phase: AttemptPhase = view?.attempt ?? 'idle'
  const compression = view?.latestCompression ?? null
  const prunedSeq = prunedSeqOf(view)
  const turns = turnsOf(nodes)
  const anchors = anchorsOf(nodes)
  // A committed replacement took its turns out of the surface: the summary
  // stands for them, and the archived copies live inside it.
  // A replaced turn is gone from the surface by the time the replacement
  // commits, so the archived copy is grouped from the nodes the compaction
  // reported replacing — the only place those messages still exist.
  const archived = compression === null ? [] : turnsOf(compression.before)
  const replacedSeqs = new Set((compression?.before ?? []).map(node => Number(node.seq)))
  const retained = turns.filter(turn => !turn.nodes.some(node => replacedSeqs.has(Number(node.seq))))
  // The list reads newest first: the round list is ordered by recency, not by
  // the model's own message order, and the prototype says so in its footnote.
  const ordered = [...retained].reverse()
  const newest = ordered[0]
  const oldest = ordered.at(-1)
  const stateLine = compression === null
    ? t('trajectory.state.turns', { to: String(newest?.turn ?? '—'), from: String(oldest?.turn ?? '—') })
    : t('trajectory.state.summary', { turn: String(newest?.turn ?? '—') })

  const toggle = (set: (next: (current: ReadonlySet<string>) => ReadonlySet<string>) => void, key: string): void => {
    set(current => {
      const next = new Set(current)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  return (
    <div className={SCOPE}>
      <section className={cls('trajectory-card')} aria-label={t('trajectory.title')}>
        <button
          type="button"
          className={cls('trajectory-toggle')}
          aria-expanded={expanded}
          onClick={() => { setExpanded(open => !open) }}
        >
          <span className={cls('trajectory-glyph')} aria-hidden="true">≋</span>
          <span className={cls('trajectory-label')}>
            <span className={cls('trajectory-title')}>{t('trajectory.title')}</span>
            <span className={cls('trajectory-strip')} aria-hidden="true">
              {STRIP_KEYS.map(key => <span className={cls('strip-token')} key={key}>{t(key)}</span>)}
            </span>
          </span>
          <span className={cls('trajectory-state')}>{stateLine}</span>
          <svg className={cls('chevron')} viewBox="0 0 24 24" aria-hidden="true">
            <path d="m7 10 5 5 5-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <div className={cls('trajectory-detail', expanded && 'open')}>
          <div className={cls('round-intro')}>
            <span>{t('trajectory.roundIntro.left')}</span>
            <span>{t('trajectory.roundIntro.right')}</span>
          </div>
          <div className={cls('round-list')}>
            {MARKED_PHASES.has(phase)
              ? <LeafRow first={t('trajectory.marker.inline')} second={t(ATTEMPT_KEYS[phase])} kind={cls('compression-event', phase === 'failed' && 'failed')} />
              : null}
            {ordered.map(turn => (
              <TurnCard
                key={turn.turn}
                turn={turn}
                nodes={nodes}
                prunedSeq={prunedSeq}
                archived={false}
                open={openTurns.has(String(turn.turn))}
                openCalls={openCalls}
                onToggleTurn={() => { toggle(setOpenTurns, String(turn.turn)) }}
                onToggleCycle={key => { toggle(setOpenCalls, key) }}
                t={t}
              />
            ))}
            {compression === null ? null : (
              <SummaryGroup
                compression={compression}
                archived={archived}
                prunedSeq={prunedSeq}
                open={summaryOpen}
                archiveOpen={archiveOpen}
                openTurns={openTurns}
                openCalls={openCalls}
                onToggleSummary={() => { setSummaryOpen(open => !open) }}
                onToggleArchive={() => { setArchiveOpen(open => !open) }}
                onToggleTurn={key => { toggle(setOpenTurns, key) }}
                onToggleCycle={key => { toggle(setOpenCalls, key) }}
                t={t}
              />
            )}
            {anchors.map(node => (
              <LeafRow
                key={node.seq}
                first={`${t(KIND_KEYS[node.kind])} · ${node.title}`}
                second={node.excerpt}
                kind={node.kind === 'system' ? 'system-anchor' : ''}
              />
            ))}
          </div>
          <p className={cls('round-footnote')}>{t('trajectory.roundFootnote')}</p>
        </div>
      </section>
    </div>
  )
}

/** No keys, shared so an untouched toggle set keeps its identity. */
const NO_STRINGS: ReadonlySet<string> = new Set()

/** Props for one inline leaf of the round list. */
interface LeafRowProps {
  /** The line in full ink. */
  first: string
  /** The line under it. */
  second: string
  /** Extra classes the leaf carries. */
  kind: string
}

/** Draw one inline leaf: two ellipsized lines inside a bordered row. */
function LeafRow({ first, second, kind }: LeafRowProps) {
  return (
    <div className={cls('trace-leaf', kind)}>
      <span className={cls('trace-line')}>{first}</span>
      <span className={cls('trace-line', 'secondary')}>{second}</span>
    </div>
  )
}

/** Props for one turn card. */
interface TurnCardProps {
  /** The turn to draw. */
  turn: Turn
  /** Every retained node, for pairing calls with their results. */
  nodes: readonly NodeView[]
  /** The seq a committed prune shortened, or null. */
  prunedSeq: number | null
  /** Whether this card is the archived copy inside the summary. */
  archived: boolean
  /** Whether the turn's cycles are showing. */
  open: boolean
  /** The cycle keys currently expanded. */
  openCalls: ReadonlySet<string>
  /** Toggle this turn's cycles. */
  onToggleTurn: () => void
  /** Toggle one cycle's detail. */
  onToggleCycle: (key: string) => void
  /** Translate a key in this plugin's namespace. */
  t: TranslateBar
}

/** Draw one turn: its question, its cycles, and its conclusion. */
function TurnCard({
  turn, nodes, prunedSeq, archived, open, openCalls, onToggleTurn, onToggleCycle, t,
}: TurnCardProps) {
  const key = archived ? `archive-${turn.turn}` : String(turn.turn)
  const cycles = cyclesOf(turn, nodes, prunedSeq)
  const injected = injectedOf(turn)
  const final = finalOf(turn)
  return (
    <section className={cls('turn-card', archived && 'archived')}>
      <button
        type="button"
        className={cls('turn-entry')}
        data-turn={key}
        aria-expanded={open}
        onClick={onToggleTurn}
      >
        <span className={cls('trace-line', 'turn-question')}>
          <span className={cls('turn-number')}>{t('trajectory.turn.number', { turn: String(turn.turn) })}</span>
          {questionOf(turn)}
        </span>
        <span className={cls('trace-line', 'turn-facts')}>
          {t('trajectory.turn.facts', { count: cycles.length })}
          <span className={cls('turn-chevron')}>
            {open ? t('trajectory.turn.collapse') : t('trajectory.turn.expand')}
          </span>
        </span>
      </button>
      {open ? (
        <div className={cls('turn-cycles')}>
          {injected.map(node => (
            <LeafRow
              key={node.seq}
              first={`${t(KIND_KEYS[node.kind])} · ${node.title}`}
              second={node.excerpt}
              kind=""
            />
          ))}
          {cycles.map((cycle, index) => {
            const pair = `${key}-${index}`
            const cycleOpen = openCalls.has(pair)
            const result = cycleResult(cycle, t)
            return (
              <div className={cls('cycle-group')} key={pair}>
                <button
                  type="button"
                  className={cls('trace-leaf', 'cycle-node')}
                  aria-expanded={cycleOpen}
                  onClick={() => { onToggleCycle(pair) }}
                >
                  <span className={cls('trace-line')}>
                    <span className={cls('cycle-index')}>{String(index + 1).padStart(2, '0')}</span>
                    {t('trajectory.cycle.call', { name: cycle.chip.name })}
                  </span>
                  <span className={cls('trace-line', 'secondary')}>{result}</span>
                </button>
                {cycleOpen ? (
                  <div className={cls('cycle-info')}>
                    <LeafRow
                      first={t('trajectory.cycle.args', { args: cycle.chip.argsExcerpt })}
                      second={t('trajectory.cycle.pair', {
                        assistant: String(cycle.ownerSeq),
                        result: cycle.chip.resultSeq === null ? '—' : String(cycle.chip.resultSeq),
                      })}
                      kind=""
                    />
                    <LeafRow
                      first={cycle.chip.resultExcerpt === null
                        ? t('trajectory.cycle.resultWaiting')
                        : t('trajectory.cycle.resultOk')}
                      second={result}
                      kind=""
                    />
                  </div>
                ) : null}
              </div>
            )
          })}
          {final === null ? null : <LeafRow first={t('trajectory.final')} second={final} kind="final-leaf" />}
        </div>
      ) : null}
    </section>
  )
}

/** Props for the compaction summary group. */
interface SummaryGroupProps {
  /** The latest committed compaction. */
  compression: NonNullable<BarView['latestCompression']>
  /** The turns that compaction replaced, grouped from its own report. */
  archived: readonly Turn[]
  /** The seq a committed prune shortened, or null. */
  prunedSeq: number | null
  /** Whether the summary's excerpts are showing. */
  open: boolean
  /** Whether the archived turn is showing. */
  archiveOpen: boolean
  /** The cycle keys currently expanded. */
  openTurns: ReadonlySet<string>
  /** The cycle keys currently expanded. */
  openCalls: ReadonlySet<string>
  /** Toggle the summary's excerpts. */
  onToggleSummary: () => void
  /** Toggle the archived turn. */
  onToggleArchive: () => void
  /** Toggle one archived turn's cycles. */
  onToggleTurn: (key: string) => void
  /** Toggle one cycle's detail. */
  onToggleCycle: (key: string) => void
  /** Translate a key in this plugin's namespace. */
  t: TranslateBar
}

/** Draw the summary that stands for the turns a replacement removed. */
function SummaryGroup({
  compression, archived, prunedSeq, open, archiveOpen, openTurns, openCalls,
  onToggleSummary, onToggleArchive, onToggleTurn, onToggleCycle, t,
}: SummaryGroupProps) {
  const seqs = compression.before.map(node => Number(node.seq))
  const first = archived[0]?.turn
  const last = archived.at(-1)?.turn
  const span = first === undefined || last === undefined
    ? t('trajectory.summary.entry', { turns: '—' })
    : t('trajectory.summary.entry', { turns: first === last ? String(first) : `${first}–${last}` })
  return (
    <section className={cls('summary-group')}>
      <button
        type="button"
        className={cls('trace-leaf', 'summary-entry')}
        aria-expanded={open}
        onClick={onToggleSummary}
      >
        <span className={cls('trace-line')}>{span}</span>
        <span className={cls('trace-line', 'secondary')}>
          {t('trajectory.summary.facts', { count: compression.beforeCount })}
        </span>
      </button>
      {open ? (
        <div className={cls('summary-content')}>
          <LeafRow first={t('trajectory.summary.excerpt', { index: '1' })} second={compression.generatedExcerpt} kind="summary-excerpt" />
          <LeafRow
            first={t('trajectory.summary.source', { seqs: seqs.map(seq => `#${seq}`).join('、') })}
            second={t('trajectory.summary.checkpoint', { seq: String(compression.checkpoint.seq) })}
            kind=""
          />
          <button type="button" className={cls('trace-leaf', 'archive-toggle')} aria-expanded={archiveOpen} onClick={onToggleArchive}>
            <span className={cls('trace-line')}>
              {archiveOpen
                ? t('trajectory.archive.hide', { turn: first === undefined ? '—' : String(first) })
                : t('trajectory.archive.show', { turn: first === undefined ? '—' : String(first) })}
            </span>
            <span className={cls('trace-line', 'secondary')}>{t('trajectory.archive.keep')}</span>
          </button>
          {archiveOpen
            ? archived.map(turn => (
              <TurnCard
                key={`archive-${turn.turn}`}
                turn={turn}
                nodes={compression.before}
                prunedSeq={prunedSeq}
                archived
                open={openTurns.has(`archive-${turn.turn}`)}
                openCalls={openCalls}
                onToggleTurn={() => { onToggleTurn(`archive-${turn.turn}`) }}
                onToggleCycle={onToggleCycle}
                t={t}
              />
            ))
            : null}
        </div>
      ) : null}
    </section>
  )
}
