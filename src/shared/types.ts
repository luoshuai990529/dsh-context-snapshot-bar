/**
 * The plugin's data objects: the wire view the Host publishes, the durable
 * projection state that produces it, and the merge of this plugin's key into
 * the Session projection tables. Both halves of the plugin import this module,
 * so it references host packages by type only and stays free of runtime
 * dependencies on them.
 *
 * @module dsh-context-snapshot-bar/shared/types
 */

import type { SessionSeq } from '@deepseek-ai/dsh-session/types'
import type { ToolCallId } from '@deepseek-ai/dsh-llm'

export type { ToolCallId }

/** Which producer shaped one surface node, used for grouping and labelling. */
export type NodeKind =
  | 'system'
  | 'user'
  | 'injected'
  | 'assistant'
  | 'tool-result'
  | 'summary'

/** One tool invocation attached to the assistant node that requested it. */
export interface ToolCallView {
  /** The provider-facing call identity that correlates the call with its result. */
  callId: ToolCallId
  /** The tool name as the assistant requested it. */
  name: string
  /** Bounded excerpt of the serialized arguments. */
  argsExcerpt: string
  /** Whether {@link argsExcerpt} dropped characters from the serialized arguments. */
  truncated: boolean
}

/** One current surface node as the Client needs it: identity, classification, bounded text. */
export interface NodeView {
  /** The committed event seq identifying this node in the Session log. */
  seq: SessionSeq
  /** Which producer shaped this node. */
  kind: NodeKind
  /** Turn number owning this node, or null outside a turn. */
  turn: number | null
  /** Step number owning this node, or null outside a step. */
  step: number | null
  /** Short label naming the node's role or tool. */
  title: string
  /** Bounded excerpt of the node's text, or a structural summary for non-text content. */
  excerpt: string
  /** Whether {@link excerpt} dropped characters from the node's full text. */
  truncated: boolean
  /** Producing plugin name for injected nodes, else null. */
  sourceName: string | null
  /** Tool invocations this node requested; empty for non-assistant nodes. */
  toolCalls: readonly ToolCallView[]
  /** The call this node answers, for tool results; null otherwise. */
  resultFor: ToolCallId | null
}

/** One named contribution of the unified runtime-context snapshot. */
export interface SectionView {
  /** The contributing subsystem's name, as the producer declared it. */
  name: string
  /** Bounded snapshot text for this contribution. */
  text: string
  /** Whether {@link text} dropped characters from the recorded contribution. */
  truncated: boolean
}

/** Whether a snapshot is retained in the current context, superseded, or explicitly cleared. */
export type SnapshotStatus = 'none' | 'present' | 'cleared' | 'removed'

/** The most recent unified runtime-context snapshot and its standing in the current context. */
export interface SnapshotView {
  /** Standing of the latest snapshot record: never recorded, retained, cleared, or replaced out of the surface. */
  status: SnapshotStatus
  /** Seq of the latest snapshot message, or null when none was ever recorded. */
  seq: SessionSeq | null
  /** Commit time of the latest snapshot message, or null when none was ever recorded. */
  time: number | null
  /** Bounded per-contribution views of the latest snapshot. */
  sections: readonly SectionView[]
  /** Number of contributions the latest snapshot recorded, before display limits. */
  totalSections: number
  /** Contributions omitted from {@link sections} by the display limit. */
  omittedSections: number
}

/** The submitted compaction's replacement and the nodes it replaced. */
export interface CompressionView {
  /** Seq of the committed replacement message that carries the summary. */
  replacementSeq: SessionSeq
  /** Bounded excerpt of the summary text the replacement message carries. */
  generatedExcerpt: string
  /** The replacement node that now stands for the replaced range. */
  checkpoint: NodeView
  /** Bounded views of the nodes the replacement removed, in surface order. */
  before: readonly NodeView[]
  /** Number of nodes the replacement removed, before display limits. */
  beforeCount: number
  /** Replaced nodes omitted from {@link before} by the display limit. */
  omittedBeforeCount: number
  /** First turn the replacement removed a message from, or null when none carried one. */
  beforeFirstTurn: number | null
  /** Last turn the replacement removed a message from, or null when none carried one. */
  beforeLastTurn: number | null
}

/** The most recent committed surface change the Client may animate. */
export interface ChangeView {
  /** Which surface operation produced this change. */
  kind: 'append' | 'replace' | 'prune'
  /** Seq of the committed event that performed the change. */
  seq: SessionSeq
  /** Bounded views of the nodes the change removed or shortened. */
  before: readonly NodeView[]
  /** Bounded views of the nodes the change installed. */
  after: readonly NodeView[]
  /** Removed nodes omitted from {@link before} by the display limit. */
  omittedBeforeCount: number
}

/** One compaction attempt's current phase, derived from committed events only. */
export type AttemptPhase =
  | 'idle'
  | 'generating'
  | 'awaiting-replacement'
  | 'completed'
  | 'failed'
  | 'interrupted'

/** The complete Client-facing value of the `contextSnapshotBar` projection. */
export interface BarView {
  /** Wire format version for this view; bumped when the DTO changes incompatibly. */
  schemaVersion: 1
  /** Increments on every change the Client can observe; unchanged values reuse their reference. */
  revision: number
  /** The latest unified runtime-context snapshot. */
  snapshot: SnapshotView
  /** Bounded views of the current surface nodes, oldest first. */
  nodes: readonly NodeView[]
  /** Number of model messages in the current surface, before display limits. */
  totalMessages: number
  /** Messages omitted from {@link nodes} by the display limit. */
  omittedMessages: number
  /** The most recent committed compaction, or null when none has committed. */
  latestCompression: CompressionView | null
  /** The current compaction attempt's phase. */
  attempt: AttemptPhase
  /** The most recent committed surface change, or null when none was observed. */
  latestChange: ChangeView | null
}

/** One snapshot contribution as the digest request carries it. */
export interface SnapshotSummarySection {
  /** The producer's section name, verbatim. */
  readonly name: string
  /** The section text the card shows. */
  readonly text: string
}

/**
 * One digest request from the snapshot card.
 *
 * The card sends the contributions it already displays rather than a session
 * identity, so the digest needs no session lookup and one identical record
 * reuses the same answer everywhere it appears.
 */
export interface SnapshotSummaryRequest {
  /** Seq of the snapshot record the digest describes. */
  readonly snapshotSeq: number
  /** Language the digest is written in, matching the card's copy. */
  readonly locale: 'zh' | 'en'
  /** The contributions to describe, in surface order. */
  readonly sections: readonly SnapshotSummarySection[]
}

/** What the Host answers for one digest request. */
export type SnapshotSummaryResponse =
  | {
    /** The digest is available. */
    readonly status: 'ready'
    /** The model-written digest. */
    readonly text: string
    /** The route that wrote it, for the card's provenance line. */
    readonly model: string
  }
  | {
    /** The digest is not available. */
    readonly status: 'unavailable'
    /** Why, as a short machine-readable reason the card localizes. */
    readonly reason: 'disabled' | 'unconfigured' | 'failed'
    /**
     * What the Host observed, for the `failed` reason.
     *
     * The card shows it under the localized line: a silent "failed" tells a
     * reader nothing about whether the route, the key, or the request was the
     * problem.
     */
    readonly detail?: string
  }

/** One indexed surface position: a derived node view, or a position a later replacement may fill. */
export interface SurfaceEntry {
  /** The committed event seq at this surface position. */
  seq: SessionSeq
  /** The derived message view, or null when the event derives no model message. */
  message: NodeView | null
}

/** The snapshot record as folded from committed events, before display limits. */
export interface SnapshotState {
  /** Standing of the latest snapshot record. */
  status: SnapshotStatus
  /** Seq of the latest snapshot message. */
  seq: SessionSeq | null
  /** Commit time of the latest snapshot message. */
  time: number | null
  /** Every contribution the latest snapshot recorded, in assembly order. */
  sections: readonly SectionView[]
}

/** A compaction whose summary committed but whose replacement has not arrived yet. */
export interface PendingCompaction {
  /** The summary event's own seq. */
  summarySeq: SessionSeq
  /** The requested replacement range's first surface-node seq. */
  startSeq: SessionSeq
  /** The requested replacement range's last surface-node seq. */
  endSeq: SessionSeq
  /** The nodes the summary reported as replaced, in surface order. */
  shadowedSeqs: readonly SessionSeq[]
  /** Bounded excerpt of the summary text awaiting its replacement. */
  summaryExcerpt: string
}

/** The durable, JSON-serializable fold state for this plugin's projection. */
export interface BarState {
  /** Shadow price of a prune replacement, awaiting the replacement event that consumes it. */
  pendingPrune: {
    /** The pruned range's first surface-node seq. */
    startSeq: SessionSeq
    /** The pruned range's last surface-node seq. */
    endSeq: SessionSeq
  } | null
  /** Every surface position in model-visible order, including positions that derive no message. */
  surface: readonly SurfaceEntry[]
  /** The latest unified runtime-context snapshot. */
  snapshot: SnapshotState
  /** Compaction summaries awaiting their replacement message. */
  pending: readonly PendingCompaction[]
  /** The most recent committed compaction. */
  latestCompression: CompressionView | null
  /** The current compaction attempt's phase. */
  attempt: AttemptPhase
  /** The most recent committed surface change. */
  latestChange: ChangeView | null
  /** Turn number owning the newest boundary event, or null outside a turn. */
  turn: number | null
  /** Step number owning the newest boundary event, or null outside a step. */
  step: number | null
  /** Monotonic revision of values the Client can observe. */
  revision: number
  /** Fingerprint of the config that produced this state, isolating caches across config changes. */
  configFingerprint: string
}

declare module '@deepseek-ai/dsh-session-projection/types' {
  interface SessionProjectionStateMap {
    /** The snapshot bar's fold state. */
    contextSnapshotBar: BarState
  }

  interface SessionProjectionMap {
    /** The snapshot bar's bounded Client view. */
    contextSnapshotBar: BarView
  }
}
