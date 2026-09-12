# Fixtures

Session logs for the projection tests. Nothing here is hand-written JSON: every
fixture is assembled through the DSH `Session` append API
(`tests/fixtures/session-builder.ts`), so each log is one the harness itself
accepts — contiguous seqs, JSON-serializable payloads, canonical surface
metadata with complete shadowed-node coverage, and tool-result rewrites limited
to content.

## Why the append API and not a JSON file

A hand-written log can encode an event shape the runtime rejects, which would
make the test and the implementation agree on something that cannot happen. The
builder appends through `Session.append`, so a fixture that violates the surface
or envelope rules fails while the test is being written.

`logBuilder()` returns both the committed events and the session that validated
them, so each test also has the canonical oracle at hand: `foldSurface(events)`
for the current surface, and `deriveEventMessage(event)` for which events derive
a model message. The projection tests compare their own index against both.

## Producers the fixtures stand in for

| Producer | How the builder records it | Message source |
|---|---|---|
| System prompt | `systemPrompt(text)` | `{ kind: 'plugin', plugin: '@deepseek-ai/dsh-system-prompt' }`, `system/message` |
| Unified runtime-context snapshot | `snapshot(sections)` | `{ kind: 'plugin', plugin: '@deepseek-ai/dsh-system-prompt', form: 'snapshot', sections }` |
| Snapshot clearing | `clearSnapshot()` | same producer, body `Current runtime context: none. Earlier runtime-context snapshots no longer apply.` |
| Other injected context (time, tmux, skills) | `injected(plugin, text)` | `{ kind: 'plugin', plugin }` |
| Compaction summary replacement | `compact(firstNodeSeq, lastNodeSeq, summary)` | `{ kind: 'plugin', plugin: '@deepseek-ai/dsh-compaction', form: 'recall' }` |
| Model-free prune | `prune(callId, blocks)` | reuses the original tool-result message identity, changes only content |

`compact()` and `compactSummaryOnly()` take surface NODE seqs, not array indices
or a numeric interval: a replacement range is a span of current surface
positions, and after an earlier replacement those positions need not hold
increasing seqs. `observedSurface()` reads the span from `foldSurface` so the
recorded shadow set is the one the runtime computes.

## Coverage

| Fixture | Events it commits | What it pins down |
|---|---|---|
| empty session | none | `status: 'none'`, zero messages |
| system prompt only | `system/message` | a system prompt is not a snapshot record |
| normal two-section snapshot | system, snapshot | sections, seq, commit time, counts |
| unknown third-party section | snapshot | an unrecognised section name is kept by its own name |
| other producers | time-context, tmux-context, a foreign `form: 'snapshot'` | only the unified producer may record the snapshot |
| runtime-context heading | snapshot, then a same-producer body without the `snapshot` form | the producer's heading is not its clearing body |
| cleared snapshot | snapshot, clear | `cleared` keeps no previous value |
| removed snapshot | system, snapshot, compaction over the snapshot node | `removed` keeps the sections and the original seq |
| restored snapshot | two snapshots with the same text | a new seq supersedes the earlier record |
| two-turn log with parallel tools | turns, steps, assistant, `tool/call` ×2, out-of-order results | call correlation, order, per-kind classification |
| empty messages | empty `system/message`, empty `assistant/message` | a position without a model message |
| compaction | summary, end, replacement | a comparison exists only after the replacement |
| consecutive compaction | two committed compactions | a summary re-summarized counts as an ordinary replacement |
| failed compaction | summary, `compaction/end` with error | `attempt: 'failed'` without touching the surface |
| unmatched start | `compaction/start` then `session/end-seed` | `attempt: 'interrupted'` |
| prune | prune record, shortened `tool/result` | `latestChange.kind: 'prune'`, no compression |
| inter-turn compaction | `turn: null` | a manual compaction keeps a null turn |

## Wire budget

`tests/replay.spec.ts` folds a log of 10,000 short messages plus one 1 MB tool
result and records both numbers: the bounded view is 20,296 bytes of JSON, and
folding the log to a view takes about 51 ms on the development machine. Both are
recorded measurements from one run, not a latency promise; the assertion is only
that the payload stays bounded, because the view is a display value and not a
transport for the Session log.

## Expected outputs

`tests/expected/*.json` holds the full stable DTO for the two replay logs. The
snapshot `time` is normalized to a fixed value before comparison, because the
append API stamps it with `Date.now()` and a keyless replay cannot reproduce a
wall clock; every other field is compared exactly.

Regenerate them deliberately with `UPDATE_EXPECTED=1 pnpm test` and review the
diff: an expected-output change is a change in what the Client receives.
