/**
 * Plugin configuration: the deployment-varying bounds on how much context the
 * two cards carry, plus the fingerprint that isolates the projection cache
 * across config changes. Every field is validated here at plugin load; a value
 * outside its range fails the load rather than silently clamping.
 *
 * @module dsh-context-snapshot-bar/shared/config
 */

import { z } from 'zod'

/** The complete plugin configuration with every default resolved. */
export interface Config {
  /** Maximum number of surface nodes the Client receives. */
  visibleNodeLimit: number
  /** Maximum characters of one node's text excerpt. */
  excerptChars: number
  /** Maximum characters of one tool call's serialized arguments. */
  toolArgsChars: number
  /** Maximum number of replaced nodes kept in the compression comparison. */
  comparisonNodeLimit: number
  /** Maximum characters of snapshot text kept per contribution. */
  snapshotPreviewChars: number
  /** Maximum number of snapshot contributions the Client receives. */
  snapshotSectionLimit: number
}

/** The JSON-compatible form callers supply; every field is optional and defaulted. */
const configInputSchema = z.object({
  visibleNodeLimit: z.number().int().min(20).max(500).default(120),
  excerptChars: z.number().int().min(40).max(1000).default(200),
  toolArgsChars: z.number().int().min(40).max(500).default(160),
  comparisonNodeLimit: z.number().int().min(20).max(500).default(120),
  snapshotPreviewChars: z.number().int().min(200).max(8000).default(2000),
  snapshotSectionLimit: z.number().int().min(1).max(128).default(32),
})

/**
 * Validate untrusted configuration against the declared ranges.
 *
 * Called only while the plugin loads; the plugin never re-validates config it
 * has already resolved.
 *
 * @param input - the `config` object Cordis read from the composition, or undefined for all defaults.
 * @returns the configuration with every default filled in.
 * @throws {Error} when a supplied field is out of range or not an integer.
 */
export function resolveConfig(input: unknown): Config {
  const result = configInputSchema.safeParse(input ?? {})
  if (!result.success) {
    const detail = result.error.issues
      .map(issue => `${issue.path.join('.') || '(config)'}: ${issue.message}`)
      .join('; ')
    throw new Error(`dsh-context-snapshot-bar: invalid config: ${detail}`)
  }
  return result.data
}

/**
 * Fingerprint the resolved configuration for cache isolation.
 *
 * The projection's persisted state is only reusable while it was folded under
 * the same bounds: a changed excerpt length would otherwise resume computing
 * from text truncated by the previous configuration.
 *
 * @param config - the resolved configuration.
 * @returns a stable string that differs whenever any bound differs.
 */
export function configFingerprint(config: Config): string {
  return [
    config.visibleNodeLimit,
    config.excerptChars,
    config.toolArgsChars,
    config.comparisonNodeLimit,
    config.snapshotPreviewChars,
    config.snapshotSectionLimit,
  ].join(':')
}

/** Schema for the Cordis `config` field; validation errors fail the plugin load. */
export const ConfigSchema = configInputSchema
