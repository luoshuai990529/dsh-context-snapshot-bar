// @vitest-environment node
/**
 * The independent install chain: the manifest contract a profile reads, the
 * bundle layer that mounts the Host plugin, and the lazy loader factory the
 * browser executes for the Client bundle.
 *
 * These are the guarantees no unit test of the fold can prove: that the
 * published artifact is shaped so `dsh plugin add` activates a Host row and the
 * web boot graph materializes a browser module without running any of it early.
 */

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const ROOT = `${process.cwd()}/`

/** Read one project file relative to the plugin root. */
function read(relative: string): string {
  return readFileSync(`${ROOT}${relative}`, 'utf8')
}

describe('bundle manifest', () => {
  const manifest = JSON.parse(read('package.json')) as {
    name: string
    version: string
    type: string
    exports: Record<string, Record<string, string> | string>
    engines: Record<string, string>
    dsh: { bundle: { patch: string }, client: { platform: string, inject: string[] } }
    dependencies: Record<string, string>
    peerDependencies: Record<string, string>
  }

  it('declares both faces through the package exports the loader resolves', () => {
    expect(manifest.name).toBe('dsh-context-snapshot-bar')
    expect(manifest.type).toBe('module')
    const entry = manifest.exports['.'] as Record<string, string>
    const client = manifest.exports['./client'] as Record<string, string>
    expect(entry.default).toBe('./lib/index.js')
    expect(client.default).toBe('./lib/client.js')
    // The Loader reads a row's manifest through the package exports map.
    expect(manifest.exports['./package.json']).toBe('./package.json')
  })

  it('declares the bundle patch and the browser half', () => {
    expect(manifest.dsh.bundle.patch).toBe('./cordis.patch.yml')
    expect(manifest.dsh.client.platform).toBe('web')
    expect(manifest.dsh.client.inject).toContain('@deepseek-ai/dsh-client-locale')
  })

  it('states the supported Node range', () => {
    expect(manifest.engines.node).toBe('^22.19.0 || >=24.0.0')
  })

  it('carries no workspace or local-link range into the published manifest', () => {
    for (const [dep, range] of Object.entries({ ...manifest.dependencies, ...manifest.peerDependencies })) {
      expect(`${dep}@${range}`).not.toMatch(/workspace:|link:|file:/)
    }
  })
})

describe('bundle layer', () => {
  it('inserts this package by name so Node resolution finds the installed code', () => {
    const patch = read('cordis.patch.yml')
    expect(patch).toContain('id: context-snapshot-bar')
    expect(patch).toContain('name: dsh-context-snapshot-bar')
    expect(patch).not.toContain('./src/')
  })
})

/** The host plugin surface the Loader row mounts. */
interface HostPlugin {
  name: string
  inject?: string[]
  apply: (ctx: unknown, config: unknown) => void
}

/** A recorded `ctx.effect` call: the callback and the label the plugin gave it. */
interface EffectCall {
  label: string | undefined
  callback: () => unknown
}

describe('Host half', () => {
  it('exports an apply that needs the projection registry before activating', async () => {
    const plugin = await import('../src/index.js') as HostPlugin
    expect(plugin.name).toBe('context-snapshot-bar')
    expect(plugin.inject).toEqual(['sessionProjections'])
    expect(typeof plugin.apply).toBe('function')
  })

  it('registers the projection as an effect so unloading releases it', async () => {
    const plugin = await import('../src/index.js') as HostPlugin
    const effects: EffectCall[] = []
    let registered: { key: string, stateVersion: number } | undefined
    const ctx = {
      effect: (callback: () => unknown, label?: string) => {
        effects.push({ label, callback })
        return () => undefined
      },
      logger: { info: () => undefined },
      sessionProjections: {
        register: (definition: { key: string, stateVersion: number }) => {
          registered = definition
          return () => undefined
        },
      },
    }
    plugin.apply(ctx, undefined)
    expect(effects).toHaveLength(1)
    expect(registered).toBeUndefined()
    effects[0]?.callback()
    expect(registered?.key).toBe('contextSnapshotBar')
    expect(registered?.stateVersion).toBe(1)
  })

  it('refuses an out-of-range configuration while loading', async () => {
    const plugin = await import('../src/index.js') as HostPlugin
    const ctx = {
      effect: () => () => undefined,
      logger: { info: () => undefined },
      sessionProjections: { register: () => () => undefined },
    }
    expect(() => plugin.apply(ctx, { excerptChars: 4 })).toThrow(/invalid config/)
  })
})
