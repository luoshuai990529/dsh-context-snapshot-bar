// @vitest-environment node
/**
 * Configuration boundaries: the plugin accepts exactly the documented ranges,
 * fills in the documented defaults, and refuses everything else while loading.
 */

import { describe, expect, it } from 'vitest'
import { resolveConfig, configFingerprint, ConfigSchema } from '../src/shared/config.ts'

/** The documented default for every field. */
const DEFAULTS = {
  visibleNodeLimit: 120,
  excerptChars: 200,
  toolArgsChars: 160,
  comparisonNodeLimit: 120,
  snapshotPreviewChars: 2000,
  snapshotSectionLimit: 32,
  snapshotSummaryEnabled: true,
  snapshotSummaryProvider: '',
  snapshotSummaryModel: '',
  snapshotSummaryMaxTokens: 400,
  snapshotSummaryTimeoutMs: 30000,
}

/** Inclusive range each field accepts. */
const RANGES = {
  visibleNodeLimit: [20, 500],
  excerptChars: [40, 1000],
  toolArgsChars: [40, 500],
  comparisonNodeLimit: [20, 500],
  snapshotPreviewChars: [200, 8000],
  snapshotSectionLimit: [1, 128],
  snapshotSummaryMaxTokens: [64, 4000],
  snapshotSummaryTimeoutMs: [1000, 120000],
} as const

describe('resolveConfig', () => {
  it('resolves every documented default when no configuration is supplied', () => {
    expect(resolveConfig(undefined)).toEqual(DEFAULTS)
    expect(resolveConfig({})).toEqual(DEFAULTS)
  })

  it('accepts both ends of every documented range', () => {
    for (const [field, [min, max]] of Object.entries(RANGES)) {
      expect(resolveConfig({ [field]: min })).toMatchObject({ [field]: min })
      expect(resolveConfig({ [field]: max })).toMatchObject({ [field]: max })
    }
  })

  it('refuses a value outside a range instead of clamping it', () => {
    for (const [field, [min, max]] of Object.entries(RANGES)) {
      expect(() => resolveConfig({ [field]: min - 1 })).toThrow(/invalid config/)
      expect(() => resolveConfig({ [field]: max + 1 })).toThrow(/invalid config/)
    }
  })

  it('refuses a negative, fractional, or non-numeric value', () => {
    expect(() => resolveConfig({ visibleNodeLimit: -1 })).toThrow(/invalid config/)
    expect(() => resolveConfig({ excerptChars: 200.5 })).toThrow(/invalid config/)
    expect(() => resolveConfig({ toolArgsChars: '160' })).toThrow(/invalid config/)
    expect(() => resolveConfig({ snapshotSectionLimit: null })).toThrow(/invalid config/)
  })

  it('refuses a non-object configuration', () => {
    expect(() => resolveConfig('nope')).toThrow(/invalid config/)
    expect(() => resolveConfig(7)).toThrow(/invalid config/)
  })

  it('names the offending field in the failure message', () => {
    expect(() => resolveConfig({ excerptChars: 4 })).toThrow(/excerptChars/)
  })
})

describe('configFingerprint', () => {
  it('changes whenever a fold bound changes', () => {
    const base = resolveConfig({})
    const bounds = ['visibleNodeLimit', 'excerptChars', 'toolArgsChars', 'comparisonNodeLimit', 'snapshotPreviewChars', 'snapshotSectionLimit'] as const
    const fingerprints = new Set<string>()
    for (const field of bounds) {
      const [min, max] = RANGES[field]
      fingerprints.add(configFingerprint({ ...base, [field]: min }))
      fingerprints.add(configFingerprint({ ...base, [field]: max }))
    }
    fingerprints.add(configFingerprint(base))
    expect(fingerprints.size).toBe(bounds.length * 2 + 1)
  })

  it('ignores the digest settings, which annotate rather than fold', () => {
    // The digest chooses how the card is described, not how the log is read, so
    // reconfiguring it must not throw away a reusable projection cache row.
    const base = resolveConfig({})
    expect(configFingerprint({
      ...base,
      snapshotSummaryEnabled: false,
      snapshotSummaryProvider: 'deepseek-official',
      snapshotSummaryModel: 'deepseek-chat',
      snapshotSummaryMaxTokens: 900,
      snapshotSummaryTimeoutMs: 5000,
    })).toBe(configFingerprint(base))
  })

  it('is stable for equal configurations', () => {
    expect(configFingerprint(resolveConfig({ excerptChars: 100 })))
      .toBe(configFingerprint(resolveConfig({ excerptChars: 100 })))
  })
})

describe('ConfigSchema', () => {
  it('is a Standard Schema the Cordis loader can validate with', async () => {
    const standard = ConfigSchema['~standard']
    expect(typeof standard.validate).toBe('function')
    const rejected = await standard.validate({ excerptChars: 4 })
    expect('issues' in rejected ? rejected.issues?.[0]?.message : undefined).toBeDefined()
    const accepted = await standard.validate({ excerptChars: 40 })
    expect('value' in accepted ? accepted.value : undefined).toMatchObject({ excerptChars: 40 })
  })
})
