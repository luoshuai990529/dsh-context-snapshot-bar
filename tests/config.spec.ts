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
}

/** Inclusive range each field accepts. */
const RANGES = {
  visibleNodeLimit: [20, 500],
  excerptChars: [40, 1000],
  toolArgsChars: [40, 500],
  comparisonNodeLimit: [20, 500],
  snapshotPreviewChars: [200, 8000],
  snapshotSectionLimit: [1, 128],
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
  it('changes whenever any bound changes', () => {
    const base = resolveConfig({})
    const fingerprints = new Set<string>()
    for (const field of Object.keys(DEFAULTS) as (keyof typeof DEFAULTS)[]) {
      const [min, max] = RANGES[field]
      fingerprints.add(configFingerprint({ ...base, [field]: min }))
      fingerprints.add(configFingerprint({ ...base, [field]: max }))
    }
    fingerprints.add(configFingerprint(base))
    expect(fingerprints.size).toBe(Object.keys(DEFAULTS).length * 2 + 1)
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
