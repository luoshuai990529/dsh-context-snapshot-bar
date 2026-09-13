// @vitest-environment jsdom
/**
 * The packaged Client bundle loaded the way the browser kernel loads it: the
 * file may only register a factory, materializing it resolves every external
 * through the injected `require`, and the module body registers the two
 * main-column panels with the matching sidebar rows.
 */

import { createContext as createReactContext } from 'react'
import { existsSync, readFileSync } from 'node:fs'
import { createContext, runInContext } from 'node:vm'
import { describe, expect, it, vi } from 'vitest'

const ROOT = `${process.cwd()}/`

/**
 * Read one project file relative to the plugin root.
 *
 * @param relative - project-relative path.
 * @returns the file's text.
 * @throws when a `lib/` artifact is absent, naming the build step that emits it.
 */
function read(relative: string): string {
  const path = `${ROOT}${relative}`
  if (!existsSync(path)) {
    throw new Error(`${relative} is missing; \`npm test\` builds it, and \`npx vitest run\` does not`)
  }
  return readFileSync(path, 'utf8')
}

/** One registered loader factory. */
interface Registration {
  id: string
  factory: (require: (specifier: string) => unknown) => unknown
}

/** One `require` request the browser bundle made, with its resolved exports. */
interface RequireCall {
  specifier: string
  exports: unknown
}

/**
 * Execute a Client bundle exactly the way the browser kernel does: in a context
 * whose only global is the loader facade. Running the file may register a
 * factory; it must not execute any module body.
 *
 * @param source - the built bundle's text.
 * @returns the factories the bundle registered.
 */
function loadBundle(source: string): Registration[] {
  const registrations: Registration[] = []
  // The style effect appends to the document, so the loader context gets the
  // real jsdom document rather than a stub.
  const context = createContext({
    window: { __ModuleLoader__: { load: (registration: Registration) => {
      registrations.push(registration)
    } } },
    console,
    document,
  })
  runInContext(source, context, { filename: 'lib/client.js' })
  return registrations
}

/**
 * Materialize a loaded factory against a module table, the way the browser
 * kernel does on first import.
 *
 * @param registration - the factory the bundle registered.
 * @param modules - the module table answering the factory's `require` calls.
 * @returns the module exports and every `require` the factory made, in order.
 */
function materialize(
  registration: Registration,
  modules: Record<string, unknown>,
): { exports: unknown, requires: RequireCall[] } {
  const requires: RequireCall[] = []
  const exports = registration.factory((specifier: string) => {
    if (!Object.hasOwn(modules, specifier)) {
      throw new Error(`undisclosed module request: ${specifier}`)
    }
    const answer = modules[specifier]
    requires.push({ specifier, exports: answer })
    return answer
  })
  return { exports, requires }
}

/** The client plugin surface the browser module loader mounts. */
interface ClientPlugin {
  inject?: string[]
  apply: (ctx: unknown) => void
}

/** One recorded slot registration with its options. */
interface SlotRegistration {
  name: string
  options: Record<string, unknown>
  component: unknown
}

/** One recorded tab-type registration. */
interface TabTypeRegistration {
  id: string
  kind: string
}

/** The client context surface this plugin consumes, with every registration recorded. */
interface FakeClientContext {
  /** Registrations into the keyed right-column seats. */
  slotRegistrations: SlotRegistration[]
  /** Names the plugin asked to inject into. */
  slotInjections: string[]
  /** Tab types the plugin contributed to the right column. */
  tabTypes: TabTypeRegistration[]
  /** Opens the plugin asked the column for, with their parameters. */
  opened: { kind: string, params: unknown }[]
  /** Registered locale namespaces. */
  localeRegistrations: { namespace: string, dictionaries: Record<string, unknown> }[]
  /** Plugin-owned style tags currently in the document. */
  styleTags: () => number
  /** Run every registered effect's disposer, as a fiber disposal would. */
  disposeEffects: () => void
}

/**
 * Build the client context this plugin consumes, running each registered effect
 * (which is what the framework does), including generator effects, and recording
 * every registration so a test can assert what the module body actually did.
 *
 * @returns the fake context plus its recording buckets.
 */
function fakeClientContext(): FakeClientContext & { ctx: unknown } {
  const slotRegistrations: SlotRegistration[] = []
  const slotInjections: string[] = []
  const tabTypes: TabTypeRegistration[] = []
  const opened: { kind: string, params: unknown }[] = []
  const localeRegistrations: FakeClientContext['localeRegistrations'] = []
  const disposers: (() => void)[] = []

  const materializeEffect = (callback: () => unknown): void => {
    const produced = callback()
    if (produced === undefined || produced === null) return
    if (typeof (produced as { next?: unknown }).next === 'function') {
      for (const yielded of produced as Generator<unknown>) {
        if (typeof yielded === 'function') disposers.push(yielded as () => void)
      }
      return
    }
    if (typeof produced === 'function') disposers.push(produced as () => void)
  }
  const ctx = {
    // The kernel's own soft service binding: the callback runs with the
    // requested services available, and an entry that would otherwise stay
    // pending never becomes one.
    inject: (services: string[], callback: (ctx: unknown) => void) => {
      for (const service of services) {
        if ((ctx as Record<string, unknown>)[service] === undefined) return
      }
      callback(ctx)
    },
    effect: (callback: () => unknown) => {
      materializeEffect(callback)
      return () => undefined
    },
    locale: {
      register: (namespace: string, dictionaries: Record<string, unknown>) => {
        localeRegistrations.push({ namespace, dictionaries })
        return () => undefined
      },
      bind: (namespace: string) => (key: string) => {
        for (const entry of localeRegistrations) {
          if (entry.namespace !== namespace) continue
          for (const dictionary of Object.values(entry.dictionaries)) {
            const value = (dictionary as Record<string, string>)[key]
            if (value !== undefined) return value
          }
        }
        return key
      },
    },
    sidebarRight: { openTab: (kind: string, options?: { params?: unknown }) => { opened.push({ kind, params: options?.params }) } },
    sidebarRightTabs: {
      register: (definition: TabTypeRegistration) => {
        tabTypes.push({ id: definition.id, kind: definition.kind })
        return () => undefined
      },
    },
    slots: {
      inject: (name: string, register: () => unknown) => {
        slotInjections.push(name)
        materializeEffect(register)
      },
      register: (options: Record<string, unknown>, component: unknown) => {
        slotRegistrations.push({ name: String(options['name']), options, component })
        return () => undefined
      },
    },
  }
  return {
    ctx,
    slotRegistrations,
    slotInjections,
    tabTypes,
    opened,
    localeRegistrations,
    styleTags: () => document.querySelectorAll('style[data-plugin="dsh-context-snapshot-bar"]').length,
    disposeEffects: () => { for (const dispose of disposers.reverse()) dispose() },
  }
}

describe('Client half', () => {
  const reactStub = { createContext: createReactContext, useState: (initial: unknown) => [initial, () => undefined] }
  const jsxRuntimeStub = {
    jsx: (type: unknown, props: unknown) => ({ type, props }),
    jsxs: (type: unknown, props: unknown) => ({ type, props }),
    Fragment: Symbol.for('react.fragment'),
  }
  /** External requests the bundle is allowed to make through the loader table. */
  const moduleTable = { react: reactStub, 'react/jsx-runtime': jsxRuntimeStub }

  it('registers a factory without executing any module body', () => {
    const registrations = loadBundle(read('lib/client.js'))
    expect(registrations).toHaveLength(1)
    expect(registrations[0]?.id).toBe('dsh-context-snapshot-bar')
  })

  it('resolves its externals through the injected require when materialized', () => {
    const [registration] = loadBundle(read('lib/client.js'))
    const { requires } = materialize(registration as Registration, moduleTable)
    expect([...new Set(requires.map(entry => entry.specifier))].sort()).toEqual(['react', 'react/jsx-runtime'])
  })

  it('fails loudly on a module request the loader table cannot answer', () => {
    const [registration] = loadBundle(read('lib/client.js'))
    expect(() => materialize(registration as Registration, {})).toThrow(/undisclosed module request/)
  })

  it('registers one context column with its body and chip title', () => {
    const [registration] = loadBundle(read('lib/client.js'))
    const plugin = materialize(registration as Registration, moduleTable).exports as ClientPlugin
    // A declared `inject` would hold this entry pending, and the browser kernel
    // rejects the whole boot on a pending entry, so the plugin binds softly.
    expect(plugin.inject).toBeUndefined()
    const fake = fakeClientContext()
    plugin.apply(fake.ctx)
    // One column, whose own two tabs carry both cards.
    expect(fake.tabTypes).toEqual([{ id: 'dsh-context-snapshot-bar-context', kind: 'context-snapshot-bar-context' }])
    // Bodies and chip titles are keyed by the same identity, in both seats.
    const bodies = fake.slotRegistrations.filter(entry => entry.name === 'sidebar.right.pane.tab')
    const titles = fake.slotRegistrations.filter(entry => entry.name === 'sidebar.right.pane.tab.title')
    expect(bodies.map(entry => entry.options.key)).toEqual(['dsh-context-snapshot-bar-context'])
    expect(titles.map(entry => entry.options.key)).toEqual(['dsh-context-snapshot-bar-context'])
    expect(bodies.every(entry => entry.options.locale === 'contextSnapshotBar')).toBe(true)
    // Both cards are addressed through their declared slot injections.
    expect([...new Set(fake.slotInjections)].sort())
      .toEqual(['conversation.input.dock', 'sidebar.right.pane.tab', 'sidebar.right.pane.tab.title'])
    expect(fake.localeRegistrations).toHaveLength(1)
    expect(fake.localeRegistrations[0]?.namespace).toBe('contextSnapshotBar')
    expect(Object.keys(fake.localeRegistrations[0]?.dictionaries ?? {}).sort()).toEqual(['en', 'zh'])
    // The style element is contributed once and released with the effect.
    expect(fake.styleTags()).toBe(1)
    fake.disposeEffects()
    expect(fake.styleTags()).toBe(0)
  })

  it('contributes one composer entry that opens the column on the snapshot', () => {
    const [registration] = loadBundle(read('lib/client.js'))
    const plugin = materialize(registration as Registration, moduleTable).exports as ClientPlugin
    const fake = fakeClientContext()
    plugin.apply(fake.ctx)
    const entry = fake.slotRegistrations.find(record => record.name === 'conversation.input.dock')
    expect(entry).toBeDefined()
    expect(entry?.options['id']).toBe('context-snapshot-bar')
    expect(entry?.options['order']).toBe(30)
    const inject = entry?.options['inject'] as () => { open: () => void }
    inject().open()
    expect(fake.opened).toEqual([
      { kind: 'context-snapshot-bar-context', params: { pane: 'snapshot' } },
    ])
  })

  it('contributes nothing and does not throw when a service is missing', () => {
    // The browser kernel rejects the whole boot on an entry that stays pending,
    // so a renamed client service must cost the cards and nothing else.
    const [registration] = loadBundle(read('lib/client.js'))
    const plugin = materialize(registration as Registration, moduleTable).exports as ClientPlugin
    const fake = fakeClientContext()
    delete (fake.ctx as Record<string, unknown>)['sidebarRightTabs']
    // Earlier tests in this file share one jsdom document, so the sheet count is
    // compared with itself rather than with zero.
    const sheets = fake.styleTags()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    try {
      expect(() => { plugin.apply(fake.ctx) }).not.toThrow()
    } finally {
      warn.mockRestore()
    }
    expect(fake.tabTypes).toEqual([])
    expect(fake.slotRegistrations).toEqual([])
    expect(fake.styleTags()).toBe(sheets)
  })
})
