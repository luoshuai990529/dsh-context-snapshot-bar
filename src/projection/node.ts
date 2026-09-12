/**
 * Deriving one surface node's bounded view from its committed event. Every
 * string here is cut before it is joined, so a node carrying megabytes of tool
 * output or a base64 image reference costs at most the configured excerpt.
 *
 * @module dsh-context-snapshot-bar/projection/node
 */

import type { SessionEvent } from '@deepseek-ai/dsh-session/types'
import { sessionSeq } from '../session-log.ts'
import type { ContentBlock } from '@deepseek-ai/dsh-llm'
import { isCheckpointSource } from '../compaction-events.ts'
import type { NodeKind, NodeView, SectionView, ToolCallView, ToolCallId } from '../shared/types.ts'
import type { Config } from '../shared/config.ts'
import { excerpt, excerptBlocks } from './excerpt.ts'

/** The unified runtime-context producer this plugin recognises. */
export const SNAPSHOT_PRODUCER = '@deepseek-ai/dsh-system-prompt'

/** Body of the producer's clearing message, which means no snapshot is retained. */
export const SNAPSHOT_CLEARED_BODY = 'Current runtime context: none. Earlier runtime-context snapshots no longer apply.'

/** Fallback title per node kind, used when no producer or tool names one. */
const KIND_TITLES: Record<NodeKind, string> = {
  system: 'system prompt',
  user: 'user message',
  injected: 'plugin context',
  assistant: 'assistant message',
  'tool-result': 'tool result',
  summary: 'compaction summary',
}

/** Structural labels for non-text content the plugin never reads. */
const BLOCK_LABELS: Record<string, string> = {
  image: 'image attachment',
  file: 'file attachment',
  reasoning: 'reasoning',
}

/**
 * Describe one content block the plugin does not render as text.
 * @param block - the block to describe.
 * @returns a short structural label naming the block type.
 */
function blockLabel(block: ContentBlock): string {
  return BLOCK_LABELS[block.type] ?? block.type
}

/**
 * Read one block's display text: its text, a tool result's nested text, or a
 * structural label for content the plugin never renders.
 * @param block - the block to read.
 * @returns the block's display text.
 */
function textOfBlock(block: ContentBlock): string {
  if (block.type === 'text' || block.type === 'reasoning') return block.text
  if (block.type === 'tool-result') {
    // A tool result nests its model-facing content, so its text is the nested
    // text rather than the envelope's type tag.
    return block.content.map(inner => textOfBlock(inner)).join('')
  }
  return `[${blockLabel(block)}]`
}

/**
 * Join a message's text blocks, bounded without materializing the whole body.
 * @param blocks - the message content blocks, in order.
 * @param limit - maximum characters to keep.
 * @returns the bounded text and whether anything was dropped.
 */
function textOf(blocks: readonly ContentBlock[], limit: number): { text: string, truncated: boolean } {
  const parts: string[] = []
  let remainder = limit
  for (const block of blocks) {
    const value = textOfBlock(block)
    if (value.length < remainder) {
      parts.push(value)
      remainder -= value.length
      continue
    }
    parts.push(value)
    const bounded = excerptBlocks(parts, limit)
    return { text: bounded.text, truncated: true }
  }
  return { text: parts.join(''), truncated: false }
}

/**
 * Classify one surface node by its event type and producer.
 *
 * The event type decides `system` because an empty rendered prompt is still the
 * system node; every other kind follows the message's own source.
 *
 * @param type - the committed event type.
 * @param source - the message's source fields.
 * @returns the node kind.
 */
function kindOf(type: string, source: { kind: string, plugin?: string }): NodeKind {
  if (type === 'system/message') return 'system'
  if (type === 'tool/result' || source.kind === 'tool') return 'tool-result'
  if (source.kind === 'user') return 'user'
  if (source.kind === 'plugin') {
    // A compaction checkpoint stands for the messages it replaced, so it reads
    // as the summary it is.
    return isCheckpointSource({ kind: 'plugin', plugin: source.plugin ?? '' })
      ? 'summary'
      : 'injected'
  }
  return 'assistant'
}

/** The turn and step a committed event belongs to when the event carries neither. */
export interface OwningBoundary {
  /** The turn open when the event committed, or null between turns. */
  readonly turn: number | null
  /** The step open when the event committed, or null outside a step. */
  readonly step: number | null
}

/**
 * Build the node view for one committed message-bearing event.
 *
 * A `user/message` carries no turn of its own — only the loop's boundary events
 * do — so it takes the turn that was open when it committed. Without that a
 * human prompt belongs to no turn at all and reads as a session-level anchor.
 * The system prompt keeps its null boundary: it is a session anchor, not a
 * turn's content, even when a later one is rendered mid-turn.
 *
 * @param event - the committed surface event.
 * @param config - the resolved plugin configuration.
 * @param toolCalls - invocations this node requested, already bounded.
 * @param owning - the turn and step open at commit time, for events that carry neither.
 * @returns the bounded node view.
 */
export function nodeFromEvent(
  event: SessionEvent,
  config: Config,
  toolCalls: readonly ToolCallView[],
  owning: OwningBoundary = { turn: null, step: null },
): NodeView {
  const payload = event.data as unknown as {
    content?: readonly ContentBlock[]
    source?: { kind: string, plugin?: string, callId?: ToolCallId }
    message?: {
      content: readonly ContentBlock[]
      source: { kind: string, plugin?: string, callId?: ToolCallId }
    }
    turn?: number
    step?: number
  }
  // `user/message` carries the message itself; the other surface events nest it
  // under `message`.
  const embedded = payload.message
  const content = embedded?.content ?? payload.content ?? []
  const source = embedded?.source ?? payload.source ?? { kind: 'plugin' }
  const bounded = textOf(content, config.excerptChars)
  const sourceName = source.kind === 'plugin' ? source.plugin ?? null : null
  const inheritsBoundary = event.type === 'user/message'
  return {
    seq: sessionSeq(event.seq),
    kind: kindOf(event.type, source),
    turn: payload.turn ?? (inheritsBoundary ? owning.turn : null),
    step: payload.step ?? (inheritsBoundary ? owning.step : null),
    title: titleOf(kindOf(event.type, source), sourceName, toolCalls),
    excerpt: bounded.text,
    truncated: bounded.truncated,
    sourceName,
    toolCalls,
    resultFor: source.kind === 'tool' ? source.callId ?? null : null,
  }
}

/**
 * Name one node for the trajectory list.
 * @param kind - the node's classification.
 * @param sourceName - the producing plugin name for injected nodes.
 * @param toolCalls - invocations this node requested.
 * @returns the node's display title.
 */
function titleOf(kind: NodeKind, sourceName: string | null, toolCalls: readonly ToolCallView[]): string {
  if (kind === 'system') return KIND_TITLES.system
  if (sourceName !== null) return sourceName
  if (toolCalls.length > 0) return toolCalls.map(call => call.name).join(', ')
  return KIND_TITLES[kind]
}

/**
 * Bound one tool invocation for display.
 * @param callId - the provider-issued call identity.
 * @param name - the tool name.
 * @param args - the raw argument JSON string.
 * @param config - the resolved plugin configuration.
 * @returns the bounded invocation view.
 */
export function toolCallView(
  callId: ToolCallId,
  name: string,
  args: string,
  config: Config,
): ToolCallView {
  const bounded = excerpt(args, config.toolArgsChars)
  return { callId, name, argsExcerpt: bounded.text, truncated: bounded.truncated }
}

/**
 * Read the runtime-context snapshot a message records, if it records one.
 *
 * A normal snapshot must match the producer, the `snapshot` form, and carry
 * sections; the clearing message must match the producer and its exact body.
 * Any other plugin injection is an ordinary trajectory node.
 *
 * @param source - the message's source fields.
 * @param body - the message's assembled text.
 * @returns the snapshot's sections, `'cleared'`, or null for an ordinary message.
 */
export function snapshotOf(
  source: { kind: string, plugin?: string, form?: string, sections?: readonly { name: string, text: string }[] },
  body: string,
): { sections: readonly SectionView[] } | 'cleared' | null {
  if (source.kind !== 'plugin' || source.plugin !== SNAPSHOT_PRODUCER) return null
  if (source.form === 'snapshot' && Array.isArray(source.sections)) {
    return {
      sections: source.sections.map(section => ({
        name: section.name,
        text: section.text,
        truncated: false,
      })),
    }
  }
  if (body === SNAPSHOT_CLEARED_BODY) return 'cleared'
  return null
}

/**
 * Assemble the full text of a message for the snapshot clear-body comparison.
 * @param blocks - the message content blocks, in order.
 * @returns every text block joined, without an excerpt limit.
 */
export function fullTextOf(blocks: readonly ContentBlock[]): string {
  return blocks.map(block => block.type === 'text' ? block.text : '').join('')
}

/**
 * Whether a message-bearing event carries text content worth excerpting.
 * @param blocks - the message content blocks.
 * @returns true when the message has at least one block.
 */
export function hasContent(blocks: readonly ContentBlock[]): boolean {
  return blocks.length > 0
}
