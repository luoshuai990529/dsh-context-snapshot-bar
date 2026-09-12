/**
 * Display mapping shared by the two panels: the scoped class name builder, the
 * label each node kind gets, and the friendly name shown for a known snapshot
 * contribution. An unknown name keeps its own spelling, because section names
 * are extensible and a plugin this one has never seen still has to be readable.
 *
 * @module dsh-context-snapshot-bar/client/display
 */

import type { ContextSnapshotBarKey } from './locales.ts'
import type { NodeKind } from '../shared/types.ts'

/**
 * The scope root the stylesheet's every rule hangs off. The generated sheet
 * carries the prototype's own class names verbatim, so the components emit
 * those names and this class goes on the one wrapper that provides the
 * palette.
 */
export const SCOPE = 'dsh-context-snapshot-bar'

/**
 * Join the prototype's class names for one element.
 * @param names - class names; falsy entries are dropped so a state class can be conditional.
 * @returns the class attribute value.
 */
export function cls(...names: readonly (string | false | undefined)[]): string {
  return names.filter((name): name is string => typeof name === 'string' && name.length > 0).join(' ')
}

/** Copy key naming each node kind in a row and in the inspector. */
export const KIND_KEYS = {
  system: 'trajectory.kind.system',
  user: 'trajectory.kind.user',
  injected: 'trajectory.kind.injected',
  assistant: 'trajectory.kind.assistant',
  'tool-result': 'trajectory.kind.tool-result',
  summary: 'trajectory.kind.summary',
} as const satisfies Record<NodeKind, ContextSnapshotBarKey>

/** Friendly names for the contributions this plugin knows by name. */
const SECTION_LABELS: Record<string, ContextSnapshotBarKey | undefined> = {
  'sandbox:policy': 'snapshot.label.sandbox',
  'approval:policy': 'snapshot.label.approval',
  'subagent:delegation': 'snapshot.label.subagent',
}

/**
 * Name one snapshot contribution for display.
 * @param name - the name the producer declared.
 * @param t - the namespace translator.
 * @returns the friendly name when one is known, otherwise the declared name.
 */
export function sectionLabel(name: string, t: (key: ContextSnapshotBarKey) => string): string {
  const key = SECTION_LABELS[name]
  return key === undefined ? name : t(key)
}

/**
 * Whether a snapshot contribution has a friendly name.
 * @param name - the name the producer declared.
 * @returns true when a friendly name exists.
 */
export function hasSectionLabel(name: string): boolean {
  return SECTION_LABELS[name] !== undefined
}
