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

  it('keeps every DSH package a peer so a profile install cannot pin the harness', () => {
    // A profile's pnpm-managed node_modules entry is authoritative over the
    // module fallback that links the running installation, so a DSH package
    // listed as a dependency would keep this plugin on its own copy of the
    // harness for the life of the profile, across harness upgrades.
    for (const dep of Object.keys(manifest.dependencies)) {
      expect(dep.startsWith('@deepseek-ai/')).toBe(false)
    }
    for (const dep of ['@deepseek-ai/cordis', '@deepseek-ai/dsh-session', '@deepseek-ai/dsh-session-projection']) {
      expect(manifest.peerDependencies[dep]).toBeDefined()
    }
    expect(manifest.dependencies.zod).toBeDefined()
  })
})

describe('Host artifact', () => {
  it('imports no harness module at runtime', () => {
    const bundle = read('lib/index.js')
    const specifiers = [...bundle.matchAll(/from\s+"([^"]+)"/g)].map(match => match[1] ?? '')
    // A specifier naming a harness module is a module a harness version can
    // move, and a bundle that cannot resolve one leaves a fiber-less loader
    // entry, which aborts `dsh` startup. The Host half therefore reads the
    // Session log itself; `zod` stays external so the schema the host parses
    // comes from one copy.
    expect([...new Set(specifiers)].sort()).toEqual(['zod'])
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

describe('Host half', () => {
  it('exports the Loader row surface without a hard service dependency', async () => {
    const plugin = await import('../src/index.js') as HostPlugin
    expect(plugin.name).toBe('context-snapshot-bar')
    expect(typeof plugin.apply).toBe('function')
    expect(plugin.inject).toBeUndefined()
  })
})
