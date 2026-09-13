/**
 * The read side: turn durable projection state into the bounded value the
 * Client receives. Every limit in the configuration is applied here, and a
 * state whose visible result did not change reuses the previous view reference
 * so the projection drive publishes nothing.
 *
 * @module dsh-context-snapshot-bar/projection/view
 */

import type { BarState, BarView, NodeView, SnapshotView } from '../shared/types.ts'
import type { Config } from '../shared/config.ts'
import { excerpt } from './excerpt.ts'
import { snapshotStillOnSurface } from './state.ts'

/** The wire format version stamped on every view. */
const SCHEMA_VERSION = 1

/**
 * One view per state identity, keyed weakly so a replaced state is collectable
 * and the projection drive can compare consecutive results with `Object.is`.
 */
const viewCache = new WeakMap<BarState, BarView>()

/**
 * Reduce the durable state to the bounded Client view.
 *
 * The result reference is stable while the state is: the projection drive
 * compares consecutive view results with `Object.is`, so a fresh object per
 * call would publish on every event.
 *
 * @param state - the current fold state.
 * @param config - the resolved plugin configuration.
 * @returns the bounded view for this state.
 */
export function toView(state: BarState, config: Config): BarView {
  const cached = viewCache.get(state)
  if (cached !== undefined) return cached
  const view = buildView(state, config)
  viewCache.set(state, view)
  return view
}

/**
 * Build the bounded view for one state.
 * @param state - the current fold state.
 * @param config - the resolved plugin configuration.
 * @returns a freshly built view.
 */
function buildView(state: BarState, config: Config): BarView {
  const messages = state.surface.flatMap(entry => entry.message === null ? [] : [entry.message])
  return {
    schemaVersion: SCHEMA_VERSION,
    revision: state.revision,
    snapshot: boundSnapshot(state, config),
    nodes: boundNodes(messages, config),
    totalMessages: messages.length,
    omittedMessages: messages.length - boundNodes(messages, config).length,
    latestCompression: state.latestCompression === null
      ? null
      : {
          ...state.latestCompression,
          before: state.latestCompression.before.slice(
            Math.max(0, state.latestCompression.before.length - config.comparisonNodeLimit),
          ),
        },
    attempt: state.attempt,
    latestChange: state.latestChange === null
      ? null
      : boundChange(state.latestChange, config),
  }
}

/**
 * Select the nodes the Client receives.
 *
 * Two nodes are kept as anchors even when a long Session's tail window no longer
 * reaches them: the system prompt, which is the request's standing
 * instructions, and the newest runtime-context record, which is the other input
 * every request carries. Without the second, a Session long enough to drop it
 * would show a trajectory with no runtime-context node at all — and no sign that
 * one exists. The remaining budget holds the newest nodes, and nothing outside
 * the window is presented as if it were visible.
 *
 * @param nodes - every current message view, oldest first.
 * @param config - the resolved plugin configuration.
 * @returns the nodes to publish, in surface order.
 */
function boundNodes(nodes: readonly NodeView[], config: Config): readonly NodeView[] {
  if (nodes.length <= config.visibleNodeLimit) return nodes
  const system = nodes[0]?.kind === 'system' ? nodes[0] : undefined
  const runtime = nodes.findLast(node => node.runtimeSnapshot !== undefined)
  const anchors = [system, runtime].filter((node): node is NodeView => node !== undefined)
  const budget = Math.max(1, config.visibleNodeLimit - anchors.length)
  const tail = nodes.slice(nodes.length - budget)
  const kept = new Set([...anchors, ...tail])
  return nodes.filter(node => kept.has(node))
}

/**
 * Bound a committed change's removed and installed nodes.
 * @param change - the committed change view.
 * @param config - the resolved plugin configuration.
 * @returns the change with both node lists trimmed to the comparison limit.
 */
function boundChange(change: NonNullable<BarView['latestChange']>, config: Config): NonNullable<BarView['latestChange']> {
  const before = change.before.slice(Math.max(0, change.before.length - config.comparisonNodeLimit))
  return {
    ...change,
    before,
    omittedBeforeCount: change.before.length - before.length,
  }
}

/**
 * Bound a snapshot record to the configured preview and contribution limits.
 *
 * A retained record whose message a replacement pushed out of the surface is
 * reported as removed: the sections stay visible for traceability, and the
 * status distinguishes "replaced out of the current context" from "cleared".
 *
 * @param state - the current fold state.
 * @param config - the resolved plugin configuration.
 * @returns the bounded snapshot view.
 */
function boundSnapshot(state: BarState, config: Config): SnapshotView {
  const snapshot = state.snapshot
  const kept = snapshot.sections.slice(0, config.snapshotSectionLimit)
  return {
    status: snapshot.status === 'present' && !snapshotStillOnSurface(state) ? 'removed' : snapshot.status,
    seq: snapshot.seq,
    time: snapshot.time,
    sections: kept.map(section => {
      const bounded = excerpt(section.text, config.snapshotPreviewChars)
      return { name: section.name, text: bounded.text, truncated: bounded.truncated || section.truncated }
    }),
    totalSections: snapshot.sections.length,
    omittedSections: snapshot.sections.length - kept.length,
  }
}
