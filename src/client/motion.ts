/**
 * Which parts of a card are new since the last observation.
 *
 * The design brief is explicit: a first load or a reconnect shows the final
 * state directly, and only a newly committed event plays its animation once.
 * These helpers hold that rule as pure functions over seq sets, so the cards
 * carry no animation bookkeeping of their own and the rule is testable without
 * a DOM.
 *
 * @module dsh-context-snapshot-bar/client/motion
 */

/** What one observation saw, and what arrived since the previous one. */
export interface MotionDelta {
  /** Seqs present in this observation that the previous one did not have; empty on the first observation. */
  readonly entering: ReadonlySet<number>
  /** The observation itself, to hand back as the next call's `previous`. */
  readonly seen: ReadonlySet<number>
}

/**
 * Diff one observation against the previous one.
 * @param previous - seqs the previous observation saw, or null when this is the first.
 * @param seqs - the seqs of the current observation, in presentation order.
 * @returns the entering seqs and the set to remember.
 */
export function observeSeqs(
  previous: ReadonlySet<number> | null,
  seqs: readonly number[],
): MotionDelta {
  const seen = new Set(seqs)
  if (previous === null) return { entering: new Set(), seen }
  const entering = new Set<number>()
  for (const seq of seen) {
    if (!previous.has(seq)) entering.add(seq)
  }
  return { entering, seen }
}

/**
 * The identity of one committed snapshot commit, as the arrival animation keys
 * on it. A different identity after the first observation means the producer
 * committed again, or the record's standing moved.
 * @param status - the record's standing.
 * @param seq - the committing event's seq, or null when nothing was committed.
 * @returns a stable identity string.
 */
export function commitIdentity(status: string, seq: number | null): string {
  return `${status}:${seq === null ? 'none' : String(seq)}`
}

/**
 * Whether two observations saw the same seqs. State updates use this to hand
 * back the identical reference, so remembering an unchanged observation does
 * not schedule another render.
 * @param left - one observation, or null for none.
 * @param right - the other observation.
 * @returns true when both hold the same seqs.
 */
export function sameSeqs(
  left: ReadonlySet<number> | null,
  right: ReadonlySet<number>,
): boolean {
  if (left === null || left.size !== right.size) return false
  for (const seq of right) {
    if (!left.has(seq)) return false
  }
  return true
}
