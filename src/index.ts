/**
 * Host half of the snapshot bar bundle: registers the plugin's Session
 * projection, whose bounded view the Web Client reads by the same key. The
 * plugin owns no Session state of its own and never writes to the log.
 *
 * @module dsh-context-snapshot-bar
 */

import type { Context } from '@deepseek-ai/cordis'
import { resolveConfig } from './shared/config.js'
import { createProjection, PROJECTION_KEY } from './projection/index.js'

export { PROJECTION_KEY } from './projection/index.js'
export { resolveConfig, type Config } from './shared/config.js'
export type {
  AttemptPhase,
  BarState,
  BarView,
  ChangeView,
  CompressionView,
  NodeKind,
  NodeView,
  SectionView,
  SnapshotStatus,
  SnapshotView,
  SurfaceEntry,
  ToolCallView,
} from './shared/types.js'

/** Cordis plugin name used in loader diagnostics. */
export const name = 'context-snapshot-bar'

/** Services this plugin needs before it activates. */
export const inject = ['sessionProjections']

/**
 * Register the projection for this deployment's configuration.
 *
 * @param ctx - the plugin's Cordis context.
 * @param config - untrusted configuration from the composition; validated here at load.
 */
export function apply(ctx: Context, config: unknown): void {
  const resolved = resolveConfig(config)
  ctx.effect(
    () => ctx.sessionProjections.register(createProjection(resolved)),
    `${PROJECTION_KEY}: session projection`,
  )
  ctx.logger.info('projection %s registered', PROJECTION_KEY)
}
