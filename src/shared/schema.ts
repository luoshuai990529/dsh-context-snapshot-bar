/**
 * Wire validation for the `contextSnapshotBar` view: the Host validates the
 * view before it leaves the process, and the Client validates what it receives
 * over the transport. Branded ids are checked structurally here — a brand has
 * no runtime representation, so `z.custom` is the only validator that both
 * accepts a legitimately branded value and infers the branded type.
 *
 * @module dsh-context-snapshot-bar/shared/schema
 */

import { z } from 'zod'
import type { SessionSeq } from '@deepseek-ai/dsh-session/types'
import type { ToolCallId } from '@deepseek-ai/dsh-llm'
import type {
  BarState,
  BarView,
  ChangeView,
  CompressionView,
  NodeKind,
  NodeView,
  PendingCompaction,
  SectionView,
  SnapshotState,
  SnapshotView,
  SurfaceEntry,
  ToolCallView,
} from './types.js'

/**
 * A non-negative safe-integer event sequence, branded.
 * @returns a schema accepting a value the caller already holds as a {@link SessionSeq}.
 */
export function sessionSeqSchema(): z.ZodType<SessionSeq> {
  return z.custom<SessionSeq>((value): value is SessionSeq => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0)
}

/**
 * A tool-call identifier string, branded.
 * @returns a schema accepting a value the caller already holds as a {@link ToolCallId}.
 */
export function toolCallIdSchema(): z.ZodType<ToolCallId> {
  return z.custom<ToolCallId>((value): value is ToolCallId => typeof value === 'string' && value.length > 0)
}

/** Runtime all-members check for {@link NodeKind}, which the schema requires as a literal union. */
const NODE_KINDS = ['system', 'user', 'injected', 'assistant', 'tool-result', 'summary'] as const

/** Runtime all-members check for the snapshot standing union. */
const SNAPSHOT_STATUSES = ['none', 'present', 'cleared', 'removed'] as const

/** Runtime all-members check for the compaction attempt union. */
const ATTEMPT_PHASES = [
  'idle', 'generating', 'awaiting-replacement', 'completed', 'failed', 'interrupted',
] as const

/** Runtime all-members check for the surface operation union. */
const CHANGE_KINDS = ['append', 'replace', 'prune'] as const

/**
 * Derive a Zod literal-union schema from a readonly tuple of string literals.
 * @param values - every member of the union, in its declared order.
 * @returns a schema accepting exactly those literals.
 */
function literalUnion<T extends string>(values: readonly T[]): z.ZodType<T> {
  return z.custom<T>((value): value is T => typeof value === 'string' && (values as readonly string[]).includes(value))
}

/** Schema for {@link ToolCallView}. */
export const toolCallViewSchema: z.ZodType<ToolCallView> = z.object({
  callId: toolCallIdSchema(),
  name: z.string(),
  argsExcerpt: z.string(),
  truncated: z.boolean(),
})

/** Schema for {@link NodeView}. */
export const nodeViewSchema: z.ZodType<NodeView> = z.object({
  seq: sessionSeqSchema(),
  kind: literalUnion<NodeKind>(NODE_KINDS),
  turn: z.number().nullable(),
  step: z.number().nullable(),
  title: z.string(),
  excerpt: z.string(),
  truncated: z.boolean(),
  sourceName: z.string().nullable(),
  toolCalls: z.array(toolCallViewSchema),
  resultFor: toolCallIdSchema().nullable(),
})

/** Schema for {@link SectionView}. */
export const sectionViewSchema: z.ZodType<SectionView> = z.object({
  name: z.string(),
  text: z.string(),
  truncated: z.boolean(),
})

/** Schema for {@link SnapshotView}. */
export const snapshotViewSchema: z.ZodType<SnapshotView> = z.object({
  status: literalUnion(SNAPSHOT_STATUSES),
  seq: sessionSeqSchema().nullable(),
  time: z.number().nullable(),
  sections: z.array(sectionViewSchema),
  totalSections: z.number(),
  omittedSections: z.number(),
})

/** Schema for {@link CompressionView}. */
export const compressionViewSchema: z.ZodType<CompressionView> = z.object({
  replacementSeq: sessionSeqSchema(),
  generatedExcerpt: z.string(),
  checkpoint: nodeViewSchema,
  before: z.array(nodeViewSchema),
  beforeCount: z.number(),
  omittedBeforeCount: z.number(),
  beforeFirstTurn: z.number().nullable(),
  beforeLastTurn: z.number().nullable(),
})

/** Schema for {@link ChangeView}. */
export const changeViewSchema: z.ZodType<ChangeView> = z.object({
  kind: literalUnion(CHANGE_KINDS),
  seq: sessionSeqSchema(),
  before: z.array(nodeViewSchema),
  after: z.array(nodeViewSchema),
  omittedBeforeCount: z.number(),
})

/** Schema for the complete {@link BarView} wire payload. */
export const barViewSchema: z.ZodType<BarView> = z.object({
  schemaVersion: z.literal(1),
  revision: z.number(),
  snapshot: snapshotViewSchema,
  nodes: z.array(nodeViewSchema),
  totalMessages: z.number(),
  omittedMessages: z.number(),
  latestCompression: compressionViewSchema.nullable(),
  attempt: literalUnion(ATTEMPT_PHASES),
  latestChange: changeViewSchema.nullable(),
})

/** Schema for one indexed surface position. */
const surfaceEntrySchema: z.ZodType<SurfaceEntry> = z.object({
  seq: sessionSeqSchema(),
  message: nodeViewSchema.nullable(),
})

/** Schema for the folded snapshot record. */
const snapshotStateSchema: z.ZodType<SnapshotState> = z.object({
  status: literalUnion(SNAPSHOT_STATUSES),
  seq: sessionSeqSchema().nullable(),
  time: z.number().nullable(),
  sections: z.array(sectionViewSchema),
})

/** Schema for a compaction awaiting its replacement. */
const pendingCompactionSchema: z.ZodType<PendingCompaction> = z.object({
  summarySeq: sessionSeqSchema(),
  startSeq: sessionSeqSchema(),
  endSeq: sessionSeqSchema(),
  shadowedSeqs: z.array(sessionSeqSchema()),
  summaryExcerpt: z.string(),
})

/** Schema for the shadow price of a prune replacement. */
const pendingPruneSchema = z.object({
  startSeq: sessionSeqSchema(),
  endSeq: sessionSeqSchema(),
})

/**
 * Validate persisted fold state before it seeds a fold.
 *
 * A cache row written under a different configuration fingerprint is rejected
 * here, which makes the registry discard it and replay the log instead of
 * extending text that the previous bounds truncated.
 *
 * @param fingerprint - the fingerprint of the configuration now loaded.
 * @returns a schema accepting exactly the state this configuration may resume.
 */
export function stateSchemaFor(fingerprint: string): z.ZodType<BarState> {
  return z.object({
    pendingPrune: pendingPruneSchema.nullable(),
    surface: z.array(surfaceEntrySchema),
    snapshot: snapshotStateSchema,
    pending: z.array(pendingCompactionSchema),
    latestCompression: compressionViewSchema.nullable(),
    attempt: literalUnion(ATTEMPT_PHASES),
    latestChange: changeViewSchema.nullable(),
    turn: z.number().nullable(),
    step: z.number().nullable(),
    revision: z.number(),
    configFingerprint: z.literal(fingerprint),
  })
}
