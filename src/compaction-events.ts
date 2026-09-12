/**
 * Type-only load of the compaction vocabulary this plugin folds, plus the
 * checkpoint marker it recognises at runtime.
 *
 * `compaction/*` members are declaration-merged into `SessionEventMap` by
 * `@deepseek-ai/dsh-compaction/types`, so the fold can only narrow them once
 * that module is part of the program. This plugin reads the events and never
 * imports the compaction implementation.
 *
 * @module dsh-context-snapshot-bar/compaction-events
 */

import type {} from '@deepseek-ai/dsh-compaction/types'

/** Plugin name a compaction checkpoint's message source carries. */
export const COMPACT_CHECKPOINT_PLUGIN = 'compact'

/**
 * Recognize the message source a compaction checkpoint carries.
 *
 * The marker is Session-format data the durable log already spells, so reading
 * it here needs no import of the compaction package. That matters for startup,
 * not for style: a bundle layer importing a harness subpath a later harness
 * version moves fails to resolve, and `dsh` refuses to start on a fiber-less
 * entry, which would cost a user their whole harness for a context card.
 * `tests/compaction.spec.ts` holds this predicate equal to the harness's own
 * `isCompactCheckpointSource`, so a marker change fails a test instead of
 * silently demoting every summary to generic injected context.
 *
 * @param source - a message event's source fields.
 * @returns whether the source marks a compaction checkpoint.
 */
export function isCheckpointSource(source: { readonly kind: string, readonly plugin?: string }): boolean {
  return source.kind === 'plugin' && source.plugin === COMPACT_CHECKPOINT_PLUGIN
}
