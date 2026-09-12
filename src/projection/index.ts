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
const STATE_VERSION = 1

/**
 * Assemble the projection definition for one resolved configuration.
 *
 * @param config - the resolved plugin configuration.
 * @returns the definition to register with the session-projection registry.
 */
/** The definition shape this plugin registers: the wire view is always present. */
export type BarProjectionDefinition = ProjectionDefinition<'contextSnapshotBar', BarState> & {
  wire: NonNullable<ProjectionDefinition<'contextSnapshotBar', BarState>['wire']>
}

export function createProjection(config: Config): BarProjectionDefinition {
  const definition: BarProjectionDefinition = {
    key: PROJECTION_KEY,
    stateVersion: STATE_VERSION,
    stateSchema: stateSchemaFor(configFingerprint(config)),
    init: () => initialState(config),
    apply: (state: BarState, event): BarState => reduceEvent(state, event, config),
    wire: {
      viewSchema: barViewSchema,
      view: (state: BarState): BarView => toView(state, config),
    },
  }
  return definition
}
