// @vitest-environment node
/**
 * Load safety: this bundle row must never turn `dsh` startup into a failure.
 *
 * `assertEntriesLoaded` and `assertEntriesActivated` (`packages/boot/app-boot`)
 * reject the launching process for a loader entry with no fiber, for one that
 * rejected during activation, and for one that stays pending on a service the
 * harness does not provide. These tests hold the plugin to the containment that
 * keeps a context card from costing a user the rest of the harness.
 */

import { describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { SessionId, SessionStore } from '@deepseek-ai/dsh-session'
import SessionProjectionRegistry from '@deepseek-ai/dsh-session-projection'
import * as plugin from '../src/index.ts'
import { PROJECTION_KEY } from '../src/projection/index.ts'

/** Cordis fiber state, mirrored because the enum has no runtime object to import. */
const FIBER_ACTIVE = 2

/** Session identity per test, so one test's log cannot collide with another's. */
function sessionIn(ctx: Context, id: string) {
  return ctx.sessions.create(SessionId(id))
}

/** Boot the services a mounted plugin uses, without mounting the plugin. */
async function services(): Promise<Context> {
  const ctx = new Context()
  await ctx.plugin(SessionStore)
  await ctx.plugin(SessionProjectionRegistry)
  return ctx
}

describe('load safety', () => {
  it('declares no service it cannot survive losing', () => {
    // A declared `inject` holds the entry's own fiber pending until that service
    // exists, and a pending entry aborts startup exactly like a failed one, so
    // the plugin binds the registry softly instead.
    expect(typeof plugin.apply).toBe('function')
    expect('inject' in plugin).toBe(false)
  })

  it('activates and stays inert when the projection registry is absent', async () => {
    const ctx = new Context()
    const fiber = ctx.plugin(plugin, {})
    await fiber
    expect(fiber.state).toBe(FIBER_ACTIVE)
  })

  it('activates, registers nothing, and reports why when the configuration is unusable', async () => {
    const ctx = await services()
    const session = sessionIn(ctx, 'session-load-safety-config')
    const fiber = ctx.plugin(plugin, { excerptChars: 4 })
    // The logger facade is per fiber, so the diagnostic is observed on the
    // plugin's own fiber rather than on the parent context.
    const warn = vi.spyOn(fiber.ctx.logger, 'warn').mockImplementation(() => undefined)
    await fiber
    expect(fiber.state).toBe(FIBER_ACTIVE)
    expect(warn).toHaveBeenCalledTimes(1)
    expect(String(warn.mock.calls[0]?.[0])).toContain('context-snapshot-bar: inactive')
    expect(ctx.sessionProjections.stateOf(session, PROJECTION_KEY)).toBeUndefined()
  })

  it('registers and drives the projection when the configuration is usable', async () => {
    const ctx = await services()
    const session = sessionIn(ctx, 'session-load-safety-usable')
    const fiber = ctx.plugin(plugin, {})
    await fiber
    expect(fiber.state).toBe(FIBER_ACTIVE)
    expect(ctx.sessionProjections.stateOf(session, PROJECTION_KEY)).toBeDefined()
  })
})
