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
import { registerSnapshotSummary } from './summary/index.js'

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

/**
 * Report one diagnostic, preferring the host logger.
 *
 * A diagnostic must not become the failure it reports, so the fallback names the
 * plugin on the host's own console when no logger service is reachable.
 *
 * @param ctx - a context whose `logger` service may or may not be available.
 * @param message - the diagnostic line.
 */
function report(ctx: Context, message: string): void {
  try {
    ctx.logger.warn(message)
  } catch {
    // Accessing an unavailable service throws; the host console is the only
    // channel left, and it cannot throw.
    console.warn(`dsh: ${message}`)
  }
}

/**
 * Report why this plugin stayed inactive.
 *
 * @param ctx - a context whose `logger` service may or may not be available.
 * @param error - the failure this plugin swallowed.
 */
function reportInactive(ctx: Context, error: unknown): void {
  report(ctx, `${name}: inactive (${error instanceof Error ? error.message : String(error)})`)
}

/**
 * Register the projection for this deployment's configuration.
 *
 * The registration is bound softly and its failures are swallowed: `dsh` refuses
 * to start on a loader entry whose module cannot be resolved, whose activation
 * rejects, or that stays pending on an unavailable service. A context card must
 * never cost a user the harness, so an absent `sessionProjections` service, an
 * unusable configuration, or a changed projection API leaves this plugin
 * inactive with one diagnostic instead of a dead `dsh`. The registered fold and
 * view are total for the same reason: the registry drives them without a guard
 * of its own, inside the Session append that committed the event. The snapshot
 * digest binds on its own soft path, so its own dependencies cannot disable the
 * cards.
 *
 * @param ctx - the plugin's Cordis context.
 * @param config - untrusted configuration from the composition; validated here at load.
 */
export function apply(ctx: Context, config: unknown): void {
  try {
    const resolved = resolveConfig(config)
    ctx.inject(['sessionProjections'], (projections) => {
      try {
        const projection = createProjection(resolved, (error) => {
          report(projections, error instanceof Error ? error.message : String(error))
        })
        projections.effect(
          () => projections.sessionProjections.register(projection),
          `${PROJECTION_KEY}: session projection`,
        )
        projections.logger.info('projection %s registered', PROJECTION_KEY)
      } catch (error) {
        reportInactive(projections, error)
      }
    })
    // The digest needs services the projection does not, so it binds on its own
    // soft path: without `connection` or `llm` the cards render without it.
    registerSnapshotSummary(ctx, resolved)
  } catch (error) {
    reportInactive(ctx, error)
  }
}
