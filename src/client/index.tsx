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

/** Required services: the slot registry, copy, and the right column's faces. */
export const inject = ['slots', 'locale', 'sidebarRight', 'sidebarRightTabs']

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

/** The context column's body: the two fixed tabs over the selected card. */
function ContextBody({ useProjection, useTabInfo, t }: ContextBodyProps) {
  const { tab } = useTabInfo()
  return (
    <ContextPanel
      view={useProjection('contextSnapshotBar')}
      requested={requestedPane(tab.navigation.params)}
      navigationRevision={tab.navigation.revision}
      t={t}
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
 * Register the context column, its body and chip title, its dictionaries, its
 * two stylesheets, and the composer entry.
 *
 * @param ctx - the browser plugin's Cordis context.
 */
export function apply(ctx: ClientContext): void {
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
      yield ctx.slots.register({ name: 'sidebar.right.pane.tab', key: CONTEXT_ID, locale: NS }, ContextBody)
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
