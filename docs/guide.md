# Configuration and development

[简体中文](../README.md) · [English](../README.en.md) · [日本語](../README.ja.md)

This reference covers the current implementation. The README files provide the quick start; [compatibility](compatibility.md) and [acceptance](acceptance.md) record verification scope. The acceptance document is a historical run, not a fresh test of every later change.

## Configuration

Add this override to your profile's `cordis.patch.yml`, after the bundle layer. Configuration changes require a Host restart.

```yaml
- id: context-snapshot-bar
  config:
    visibleNodeLimit: 120
    excerptChars: 200
    toolArgsChars: 160
    comparisonNodeLimit: 120
    snapshotPreviewChars: 2000
    snapshotSectionLimit: 32
    snapshotSummaryEnabled: false
```

| Field | Default | Valid range | Meaning |
| --- | --- | --- | --- |
| `visibleNodeLimit` | 120 | 20–500 | Current surface nodes sent to the Client |
| `excerptChars` | 200 | 40–1000 | Characters per message excerpt |
| `toolArgsChars` | 160 | 40–500 | Characters per tool call's arguments |
| `comparisonNodeLimit` | 120 | 20–500 | Replaced nodes retained for comparison |
| `snapshotPreviewChars` | 2000 | 200–8000 | Characters per snapshot section |
| `snapshotSectionLimit` | 32 | 1–128 | Snapshot sections sent to the Client |
| `snapshotSummaryEnabled` | `true` | boolean | Allow the optional model-written digest |
| `snapshotSummaryProvider` | empty | provider route | Digest provider; required to make requests |
| `snapshotSummaryModel` | empty | model ID | Digest model; required to make requests |
| `snapshotSummaryMaxTokens` | 400 | 64–4000 | Digest output-token cap |
| `snapshotSummaryTimeoutMs` | 30000 | 1000–120000 | Digest request deadline |

Invalid values are rejected rather than clamped. Check the Host log if the plugin cannot activate. Display-bound changes invalidate the projection cache and rebuild it from Session events.

### Optional snapshot digest

To enable the digest, configure a provider and model supported by your deployment. For example, use the following only if these route names exist in your DSH setup:

```yaml
- id: context-snapshot-bar
  config:
    snapshotSummaryEnabled: true
    snapshotSummaryProvider: deepseek-official
    snapshotSummaryModel: deepseek-flash
    snapshotSummaryMaxTokens: 400
    snapshotSummaryTimeoutMs: 30000
```

The digest is requested while the snapshot tab is visible and cached in the Host process by content, language, and digest configuration. It sends the section text held by the card, which may already be truncated, to the configured provider. This is an additional model request and may incur usage charges. The selected provider may differ from the conversation's provider.

With no route, an explicit disable, or a failed request, the raw snapshot remains readable. The digest is auxiliary; it does not replace the recorded text or write to the Session log.

## Reading the cards

Snapshot standing distinguishes no record, in effect, cleared, and replaced out of context. Unknown producer section names remain visible. Copying returns the displayed text, including display limits, rather than claiming to copy the full underlying record.

The trajectory follows retained Session messages, grouped by turn. Tool calls belong to their assistant messages, and tool results are paired by call ID. The latest committed compaction includes its summary and a bounded comparison of replaced messages. An uncommitted attempt appears as a process marker.

“Real time” means committed-event updates. The latest snapshot can remain visible for reference after it has left the current model context. First load and reconnect restore the current view rather than replaying historical transitions.

## Limits

- Message excerpts and comparisons are bounded; the UI reports omissions.
- The current implementation shows a compaction comparison but does not animate replaced message groups contracting into a summary.
- Cold reconstruction of very long sessions has a known super-linear cost. See the replay benchmark before raising limits for large logs; past measurements are not a latency guarantee.
- Sidebar sizing and collapse behavior belong to the DSH host. The plugin does not reproduce the prototype's whole page shell.

## Troubleshooting

| Symptom | Action |
| --- | --- |
| No entry or sidebar cards | Check `dsh --profile web --dump-config` for the plugin layer; restart the Web service after installation. |
| The Host row exists but the Client does not load | Confirm the installed package contains `lib/client.js`; build before packing a source checkout. Check Host and browser errors. |
| No snapshot or zero messages | Confirm the selected Session has committed events. If it does, inspect projection errors in the Host log. |
| Configuration appears unchanged | Restart the corresponding profile and reopen the launcher URL. |
| Text or older messages are missing | Check the displayed omission count and the relevant configuration limit. |
| Digest is unavailable | Configure both provider and model, or intentionally disable it. Raw records remain available. |

Replace `web` with your actual Web profile name. A restart can invalidate the previous launch URL; use the newly printed one. To disable the row without uninstalling:

```yaml
- id: context-snapshot-bar
  disabled: true
```

## Development

```sh
pnpm install
pnpm run typecheck
pnpm run build
pnpm test
pnpm run check:pack
pnpm run pack
```

`pnpm test` builds first because some tests inspect the emitted Host and Client artifacts. Running an individual Vitest spec bypasses that step; build before artifact-dependent tests.

The Open Design references live in the repository's `docs/design/` directory. The turn-first prototype of record is `dsh-context-snapshot-prototype-v5.html`. The current style generator reads `dsh-context-snapshot-prototype-v4.html`; inspect `scripts/gen-card-styles.mjs` before regeneration. Do not hand-edit generated `src/client/styles.ts`; host-specific layout adaptations live in `src/client/host.css.ts`.

To inspect the rendered cards without starting DSH, after a build:

```sh
pnpm exec vitest run tests/preview.spec.tsx
pnpm run check:render
```

The first command writes `artifacts/preview.html`; the second checks browser layout and writes a screenshot, requiring Chrome. These checks do not replace live DSH installation and Session verification.
