/**
 * Client half of the snapshot bar bundle: one right-column tab type holding the
 * prototype's two fixed tabs — the message trajectory and the runtime snapshot
 * — plus the composer entry that opens the column on the snapshot.
 *
 * The column's cards read the `contextSnapshotBar` projection through the
 * framework's projection seat, so neither reads the Session log or the loaded
 * chat window, and the conversation stays visible while the context changes
 * beside it.
 *
 * @module dsh-context-snapshot-bar/client
 */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
// Type-only: pulls the slots service merge and the locale/slot key tables.
import type {} from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: pulls the renderer-owned Context.slots merge.
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
// Type-only: pulls the locale plugin's Context merge.
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: pulls the composer dock row this entry sits in.
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
// Type-only: pulls the session standard kit (useProjection) and the projection key merge.
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
// Type-only: pulls the sidebar's tab registry, navigation faces, and the params map this type augments.
import type {} from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { ContextSnapshotBarKey } from './locales.ts'
import { ComposerEntry, type ComposerEntryInjected } from './ComposerEntry.tsx'
import { ContextPanel, type ContextPane } from './ContextPanel.tsx'
import type { SummaryCaller } from './summary.ts'
import { en, zh } from './locales.ts'
import { cardCss } from './styles.ts'
import { hostCss } from './host.css.ts'

/** Dictionary namespace owned by this plugin. */
const NS = 'contextSnapshotBar'

/** Implementation identity and tab kind of the context column. */
const CONTEXT_ID = 'dsh-context-snapshot-bar-context'
const CONTEXT_KIND = 'context-snapshot-bar-context'

/** Position of the composer entry among the input dock's rows: last, directly above the input. */
const ENTRY_ORDER = 30

/** Plugin identity used in the browser kernel's diagnostics. */
const PLUGIN_ID = 'context-snapshot-bar'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The context cards' copy. */
    contextSnapshotBar: ContextSnapshotBarKey
  }
}

declare module '@deepseek-ai/dsh-client-ui-sidebar-right/client' {
  interface SidebarRightTabParamsMap {
    /** The pane the opener wants the context column to show. */
    'context-snapshot-bar-context': { pane: ContextPane }
  }
}

/** The runtime a card body receives: the projection seat, the tab's own facts, and copy. */
type ContextBodyProps =
  & PropsRuntime<'sidebar.right.pane.tab'>
  & PropsLocale<'contextSnapshotBar'>

/** The composer entry's runtime: the composer row, the column opener, and copy. */
type EntryBodyProps =
  & PropsRuntime<'conversation.input.dock'>
  & ComposerEntryInjected
  & PropsLocale<'contextSnapshotBar'>

/** The pane the opener asked for, when the navigation carried one. */
function requestedPane(params: unknown): ContextPane | undefined {
  if (typeof params !== 'object' || params === null || !('pane' in params)) return undefined
  const pane = (params as { pane?: unknown }).pane
  return pane === 'trajectory' || pane === 'snapshot' ? pane : undefined
}

/**
 * The context column's body: the two fixed tabs over the selected card.
 *
 * The digest caller and the translator both arrive per render, so the body takes
 * the caller getter as a prop rather than reading a service itself.
 */
function ContextBody({ useProjection, useTabInfo, t, summaryCaller }: ContextBodyProps & { summaryCaller: () => SummaryCaller | undefined }) {
  const { tab } = useTabInfo()
  return (
    <ContextPanel
      view={useProjection('contextSnapshotBar')}
      requested={requestedPane(tab.navigation.params)}
      navigationRevision={tab.navigation.revision}
      t={t}
      summaryCaller={summaryCaller}
    />
  )
}

/** The composer entry's body. */
function EntryBody({ useProjection, open, t }: EntryBodyProps) {
  return <ComposerEntry view={useProjection('contextSnapshotBar')} open={open} t={t} />
}

/** The tab chip title: the glyph followed by the column's title. */
function ContextTitle({ useTabInfo }: PropsRuntime<'sidebar.right.pane.tab.title'>) {
  const { tab } = useTabInfo()
  return <>{`≋ ${tab.title}`}</>
}

/**
 * Report why this plugin stayed inactive, preferring the kernel logger.
 *
 * A diagnostic must not become the failure it reports, so the browser console
 * carries it when no logger service is reachable.
 *
 * @param ctx - a context whose `logger` service may or may not be available.
 * @param error - the failure this plugin swallowed.
 */
function reportInactive(ctx: ClientContext, error: unknown): void {
  const detail = error instanceof Error ? error.message : String(error)
  const message = `${PLUGIN_ID}: inactive (${detail})`
  try {
    ctx.logger.warn(message)
  } catch {
    // Accessing an unavailable service throws; the browser console is the only
    // channel left, and it cannot throw.
    console.warn(`dsh: ${message}`)
  }
}

/**
 * Register the context column, its body and chip title, its dictionaries, its
 * two stylesheets, and the composer entry.
 *
 * @param ctx - a context whose slot, locale, and sidebar services are bound.
 */
/**
 * The digest caller holder.
 *
 * The kernel's connection service activates asynchronously, so the seat is
 * registered before the caller exists; the card re-checks through this getter
 * until it is there. Without a connection service the holder stays empty and the
 * cards render without the digest section.
 */
const caller: { current: SummaryCaller | undefined } = { current: undefined }

/** Read the digest caller, if the connection service has activated. */
function readSummaryCaller(): SummaryCaller | undefined {
  return caller.current
}

function register(ctx: ClientContext): void {
  // The digest is optional for the cards, so it binds on its own soft path:
  // a kernel without Connection still gets both cards, just without a digest.
  ctx.inject(['connection'], (scoped) => {
    const connection = scoped.get('connection') as { rpc?: { call?: SummaryCaller } } | undefined
    const call = connection?.rpc?.call
    if (typeof call === 'function' && connection?.rpc !== undefined) {
      caller.current = call.bind(connection.rpc)
    }
  })
  const t = ctx.locale.bind(NS)
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'context-snapshot-bar: dictionaries')
  ctx.effect(() => {
    const id = 'dsh-context-snapshot-bar-css'
    if (document.querySelector(`style[data-plugin-css="${id}"]`) !== null) return () => undefined
    const tag = document.createElement('style')
    tag.dataset.plugin = 'dsh-context-snapshot-bar'
    tag.dataset.pluginCss = id
    // The generated sheet first, the host seams after it, so a seam can win.
    tag.textContent = `${cardCss}\n${hostCss}`
    document.head.appendChild(tag)
    return () => { tag.remove() }
  }, 'context-snapshot-bar: styles')

  ctx.effect(function* () {
    yield ctx.sidebarRightTabs.register({
      id: CONTEXT_ID,
      kind: CONTEXT_KIND,
      priority: 'builtin',
      title: () => t('panel.context'),
      guide: [{
        order: 10,
        title: () => t('panel.context'),
        description: () => t('panel.contextNote'),
      }],
    })
  }, 'context-snapshot-bar: tab type')

  // The body is injected on the seat's own declaration, so a sidebar that
  // redeclares its holes picks the column up again and unloading the plugin
  // removes it with the fiber.
  ctx.effect(function* () {
    yield ctx.slots.inject('sidebar.right.pane.tab', function* () {
      yield ctx.slots.register(
        { name: 'sidebar.right.pane.tab', key: CONTEXT_ID, locale: NS },
        (props: ContextBodyProps) => <ContextBody {...props} summaryCaller={readSummaryCaller} />,
      )
    })
    yield ctx.slots.inject('sidebar.right.pane.tab.title', function* () {
      yield ctx.slots.register({ name: 'sidebar.right.pane.tab.title', key: CONTEXT_ID }, ContextTitle)
    })
  }, 'context-snapshot-bar: column body')

  ctx.effect(() => ctx.slots.inject('conversation.input.dock', () => ctx.slots.register({
    name: 'conversation.input.dock',
    id: 'context-snapshot-bar',
    order: ENTRY_ORDER,
    locale: NS,
    inject: (): ComposerEntryInjected => ({
      open: () => { ctx.sidebarRight.openTab(CONTEXT_KIND, { params: { pane: 'snapshot' } }) },
    }),
  }, EntryBody)), 'context-snapshot-bar: composer entry')
}

/**
 * Register everything this plugin contributes to the Web Client.
 *
 * The services are bound softly and the registrations swallow their own
 * failures. The browser kernel rejects the whole boot on a Loader entry that
 * stays pending on a missing service or that fails while activating, so a card
 * must never be able to keep the GUI from mounting: a renamed service or a
 * changed slot API costs one console line and no cards instead.
 *
 * @param ctx - the browser plugin's Cordis context.
 */
export function apply(ctx: ClientContext): void {
  try {
    ctx.inject(['slots', 'locale', 'sidebarRight', 'sidebarRightTabs'], (scoped) => {
      try {
        register(scoped)
      } catch (error) {
        reportInactive(scoped, error)
      }
    })
  } catch (error) {
    reportInactive(ctx, error)
  }
}
