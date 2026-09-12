// @vitest-environment node
/**
 * Host registration against the real Cordis lifecycle: the plugin mounts its
 * projection on the live registry, the registry drives committed events, and
 * unloading the plugin takes the key out of both the drive and the snapshots.
 */

import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { Session, SessionId, SessionStore, type SessionEvent } from '@deepseek-ai/dsh-session'
import SessionProjectionRegistry from '@deepseek-ai/dsh-session-projection'
import * as plugin from '../src/index.ts'
import type { BarView } from '../src/shared/types.ts'
import { initialState } from '../src/projection/state.ts'
import { configFingerprint, resolveConfig } from '../src/shared/config.ts'
import { stateSchemaFor } from '../src/shared/schema.ts'
import { createSystemMessage, createUserMessage } from '@deepseek-ai/dsh-llm'
import { text } from './fixtures/session-builder.ts'

const CONFIG = resolveConfig({})

/** A mounted plugin, its own context, and the live session it projects. */
interface Harness {
  ctx: Context
  scope: Context
  session: Session
  /** Commit one event to the live session through the DSH append API. */
  append: (
    type: SessionEvent['type'],
    data: unknown,
    metadata?: { surfaceOp?: unknown, sourceEventSeqs?: readonly number[] },
  ) => SessionEvent
  /** Commit a human prompt to the live session. */
  userMessage: (value: string, turn?: number, step?: number) => SessionEvent
  /** Commit an assistant message to the live session. */
  assistantMessage: (value: string, turn?: number, step?: number) => SessionEvent
  /** Commit the unified runtime-context snapshot to the live session. */
  snapshot: (sections: readonly { name: string, text: string }[]) => SessionEvent
}

/**
 * Boot the real registry, mount the plugin on its own fiber, and create a
 * session the registry drives.
 *
 * @param config - the configuration to load the plugin with.
 * @param id - session identity, so one test's log cannot collide with another's.
 * @returns the harness.
 */
async function harness(config: unknown = {}, id = 'session-host-registration'): Promise<Harness> {
  const ctx = new Context()
  await ctx.plugin(SessionStore)
  await ctx.plugin(SessionProjectionRegistry)
  const scope = scopeFor(ctx, `harness-${id}`)
  await scope.plugin(plugin, config)
  const session = ctx.sessions.create(SessionId(id))
  const append: Harness['append'] = (type, data, metadata) => {
    return (session.append as unknown as (
      type: SessionEvent['type'],
      data: unknown,
      metadata?: unknown,
    ) => SessionEvent)(type, data, {
      ...metadata?.surfaceOp === undefined ? {} : { surfaceOp: metadata.surfaceOp },
      ...metadata?.sourceEventSeqs === undefined ? {} : { sourceEventSeqs: metadata.sourceEventSeqs },
    })
  }
  return {
    ctx,
    scope,
    session,
    append,
    userMessage: value => append(
      'user/message',
      createUserMessage({ content: [text(value)], source: { kind: 'user' } }),
      { surfaceOp: 'append' },
    ),
    assistantMessage: (value, turn = 1, step = 1) => append(
      'assistant/message',
      {
        turn,
        step,
        message: {
          content: [text(value)],
          source: { kind: 'model', provider: 'deepseek', model: 'deepseek-chat' },
          role: 'assistant',
        },
        stream: [],
      },
      { surfaceOp: 'append' },
    ),
    snapshot: sections => append(
      'user/message',
      createUserMessage({
        content: [text(sections.map(section => section.text).join('\n'))],
        source: { kind: 'plugin', plugin: '@deepseek-ai/dsh-system-prompt', form: 'snapshot', sections },
      }),
      { surfaceOp: 'append' },
    ),
  }
}

/**
 * The context one plugin mount registers through, isolated by plugin name so a
 * second mount shares the same unit the way a preset re-mount does.
 *
 * @param ctx - the root context.
 * @param label - the isolation label identifying this mount.
 * @returns the scoped context.
 */
function scopeFor(ctx: Context, label: string): Context {
  return ctx.isolate('context-snapshot-bar', Symbol.for(label))
}

/** Read the plugin's current client value for one session. */
function barOf(ctx: Context, session: Session): BarView {
  return ctx.sessionProjections.snapshot(session, ['contextSnapshotBar']).values.contextSnapshotBar as BarView
}

describe('host registration', () => {
  it('registers the projection on the live registry with the declared key and version', async () => {
    const { ctx, session } = await harness()
    expect(ctx.sessionProjections.stateOf(session, 'contextSnapshotBar')).toEqual(initialState(CONFIG))
  })

  it('publishes a bounded value the client can read by key', async () => {
    const { ctx, session, snapshot } = await harness()
    snapshot([{ name: 'sandbox:policy', text: 'workspace-write' }])
    const view = barOf(ctx, session)
    expect(view.schemaVersion).toBe(1)
    expect(view.snapshot.status).toBe('present')
    expect(view.snapshot.sections[0]?.text).toBe('workspace-write')
  })

  it('drives the fold from committed events only', async () => {
    const { ctx, session, userMessage, assistantMessage } = await harness()
    expect(barOf(ctx, session).totalMessages).toBe(0)
    userMessage('hello')
    expect(barOf(ctx, session).totalMessages).toBe(1)
    assistantMessage('hi')
    const view = barOf(ctx, session)
    expect(view.totalMessages).toBe(2)
    expect(view.nodes.map(node => node.kind)).toEqual(['user', 'assistant'])
  })

  it('projects the system prompt the producer commits', async () => {
    const { ctx, session, append } = await harness()
    append(
      'system/message',
      { turn: 1, step: 1, message: createSystemMessage('you are a coding agent', '@deepseek-ai/dsh-system-prompt') },
      { surfaceOp: 'append' },
    )
    const view = barOf(ctx, session)
    expect(view.nodes[0]?.kind).toBe('system')
    expect(view.nodes[0]?.excerpt).toBe('you are a coding agent')
  })

  it('leaves the published value unchanged on unrelated events', async () => {
    const { ctx, session, userMessage, append } = await harness()
    userMessage('hello')
    const first = barOf(ctx, session)
    const firstState = ctx.sessionProjections.stateOf(session, 'contextSnapshotBar')
    append('request/context', {
      route: { provider: 'deepseek', model: 'deepseek-chat' },
      systemPromptUpdate: 'per-step',
    })
    const second = barOf(ctx, session)
    expect(second).toEqual(first)
    // The drive's publish check compares these raw view results by identity, so
    // the fold must hand back the same state for an event it does not model.
    expect(second.revision).toBe(first.revision)
    expect(ctx.sessionProjections.stateOf(session, 'contextSnapshotBar')?.revision)
      .toBe(firstState?.revision)
  })

  it('releases the key when the plugin unloads and rebuilds it when remounted', async () => {
    const ctx = new Context()
    await ctx.plugin(SessionStore)
    await ctx.plugin(SessionProjectionRegistry)
    const session = ctx.sessions.create(SessionId('session-lifecycle'))
    session.append(
      'user/message',
      createUserMessage({ content: [text('hello')], source: { kind: 'user' } }),
      { surfaceOp: 'append' },
    )
    const scope = ctx.isolate('context-snapshot-bar')
    const fiber = await scope.plugin(plugin, {})
    expect(ctx.sessionProjections.stateOf(session, 'contextSnapshotBar')).toBeDefined()
    await fiber.dispose()
    expect(ctx.sessionProjections.stateOf(session, 'contextSnapshotBar')).toBeUndefined()
    await scope.plugin(plugin, {})
    expect(ctx.sessionProjections.stateOf(session, 'contextSnapshotBar')).toBeDefined()
    // The rebuilt unit folds the whole log again, without process memory.
    expect(barOf(ctx, session).totalMessages).toBe(1)
  })

  it('keeps one shared unit registered while any registrant remains', async () => {
    const ctx = new Context()
    await ctx.plugin(SessionStore)
    await ctx.plugin(SessionProjectionRegistry)
    const first = scopeFor(ctx, 'context-snapshot-bar-first')
    const firstFiber = await first.plugin(plugin, {})
    const secondFiber = await ctx.plugin(plugin, {})
    const probe = ctx.sessions.create(SessionId('share-check'))
    expect(ctx.sessionProjections.stateOf(probe, 'contextSnapshotBar')).toBeDefined()
    await firstFiber.dispose()
    // The second registrant still holds the key, so it must survive.
    expect(ctx.sessionProjections.stateOf(probe, 'contextSnapshotBar')).toBeDefined()
    await secondFiber.dispose()
    expect(ctx.sessionProjections.stateOf(probe, 'contextSnapshotBar')).toBeUndefined()
  })

  it('rejects a state row written under a different configuration and replays the log', async () => {
    const ctx = new Context()
    await ctx.plugin(SessionStore)
    await ctx.plugin(SessionProjectionRegistry)
    const session = ctx.sessions.create(SessionId('session-config-change'))
    session.append(
      'user/message',
      createUserMessage({ content: [text('hello')], source: { kind: 'user' } }),
      { surfaceOp: 'append' },
    )
    session.append(
      'user/message',
      createUserMessage({
        content: [text('x'.repeat(400))],
        source: {
          kind: 'plugin',
          plugin: '@deepseek-ai/dsh-system-prompt',
          form: 'snapshot',
          sections: [{ name: 'sandbox:policy', text: 'x'.repeat(400) }],
        },
      }),
      { surfaceOp: 'append' },
    )
    const narrowFiber = await scopeFor(ctx, 'context-snapshot-bar-narrow').plugin(plugin, { snapshotPreviewChars: 200 })
    const narrowView = barOf(ctx, session)
    expect(narrowView.snapshot.sections[0]?.text).toHaveLength(200)
    expect(narrowView.snapshot.sections[0]?.truncated).toBe(true)
    const rows = ctx.sessionProjections.checkpoint(session)
    // The registry discards a persisted row whose configuration fingerprint
    // does not match the live unit, so the same row must fail the wide unit's
    // schema and pass the narrow one's.
    const stored = rows.contextSnapshotBar?.val
    expect(stateSchemaFor(configFingerprint(resolveConfig({ snapshotPreviewChars: 8000 }))).safeParse(stored).success)
      .toBe(false)
    expect(stateSchemaFor(configFingerprint(resolveConfig({ snapshotPreviewChars: 200 }))).safeParse(stored).success)
      .toBe(true)
    await narrowFiber.dispose()
    await scopeFor(ctx, 'context-snapshot-bar-wide').plugin(plugin, { snapshotPreviewChars: 8000 })
    // The wide unit therefore folds the log from the start at its own bound.
    expect(barOf(ctx, session).snapshot.sections[0]?.text).toHaveLength(400)
    expect(barOf(ctx, session).snapshot.sections[0]?.truncated).toBe(false)
  })
})
