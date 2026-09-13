/**
 * Projection assembly: binds the plugin's configuration to the pure fold and
 * view functions and publishes them under the plugin's projection key.
 *
 * @module dsh-context-snapshot-bar/projection
 */

import type { ProjectionDefinition } from '@deepseek-ai/dsh-session-projection'
import type { BarState, BarView } from '../shared/types.js'
import { barViewSchema, stateSchemaFor } from '../shared/schema.js'
import { configFingerprint, type Config } from '../shared/config.js'
import { initialState, reduceEvent } from './state.js'
import { toView } from './view.js'

/** The projection key this plugin owns; the Client reads the same key. */
export const PROJECTION_KEY = 'contextSnapshotBar'

/** Bumped whenever the persisted state fields or the fold semantics change. */
const STATE_VERSION = 3

/**
 * Assemble the projection definition for one resolved configuration.
 *
 * Every callback the registry drives is total, because the registry's eager
 * `drive` calls `apply` and `wire.view` without a guard of its own: a fold that
 * threw would escape into the Session append that committed the event and
 * disturb a running turn. A fault therefore returns the state it was given, or
 * the empty view, and reports once rather than on every event.
 *
 * @param config - the resolved plugin configuration.
 * @param report - sink for the first fault; defaults to the host console.
 * @returns the definition to register with the session-projection registry.
 */
/** The definition shape this plugin registers: the wire view is always present. */
export type BarProjectionDefinition = ProjectionDefinition<'contextSnapshotBar', BarState> & {
  wire: NonNullable<ProjectionDefinition<'contextSnapshotBar', BarState>['wire']>
}

/** Sink for the first fault a projection reports. */
export type ProjectionFaultReporter = (error: unknown) => void

/** Default fault sink: the projection has no context, so the host console carries it. */
function reportToConsole(error: unknown): void {
  const message = error instanceof Error ? error.message : String(error)
  console.warn(`dsh: ${message}`)
}

export function createProjection(
  config: Config,
  report: ProjectionFaultReporter = reportToConsole,
): BarProjectionDefinition {
  const empty = initialState(config)
  const emptyView = toView(empty, config)
  let reported = false
  const fault = (error: unknown, stage: string): void => {
    if (reported) return
    reported = true
    report(new Error(
      `${PROJECTION_KEY}: ${stage} failed, so the cards keep the last good state`,
      { cause: error },
    ))
  }
  return {
    key: PROJECTION_KEY,
    stateVersion: STATE_VERSION,
    stateSchema: stateSchemaFor(configFingerprint(config)),
    init: () => {
      try {
        return initialState(config)
      } catch (error) {
        fault(error, 'init')
        return empty
      }
    },
    apply: (state: BarState, event): BarState => {
      try {
        return reduceEvent(state, event, config)
      } catch (error) {
        fault(error, 'fold')
        return state
      }
    },
    wire: {
      viewSchema: barViewSchema,
      view: (state: BarState): BarView => {
        try {
          return toView(state, config)
        } catch (error) {
          fault(error, 'view')
          return emptyView
        }
      },
    },
  }
}
