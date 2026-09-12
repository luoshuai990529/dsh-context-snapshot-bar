# dsh-context-snapshot-bar

A DeepSeek Harness bundle that adds two cards above the Session composer in the
web GUI:

- **Runtime context snapshot** — the latest unified runtime-context snapshot
  recorded by `@deepseek-ai/dsh-system-prompt`, its named sections, its
  standing in the current context, and when it was committed.
- **Conversation trajectory** — the messages the Session currently retains, and
  the most recent committed compaction with the nodes it replaced.

Both cards observe committed Session events through the plugin's own Session
projection. The plugin never writes to the Session log, never calls a model,
and never changes the agent loop or the compaction policy.

**Harness version.** Built and exercised against **DeepSeek Harness
`0.1.5-rc.2`** (`dsh` Host + Web), and declared to require
`>=0.1.5-rc.2 <0.2.0-0` for the two harness packages whose services and log
format it reads. Nothing in the bundle pins a harness version, and by design it
cannot keep `dsh web` from starting on a newer `0.1.x` either — see
[Tested compatibility](#tested-compatibility) for what was verified and
[Surviving harness upgrades](#surviving-harness-upgrades) for how that guarantee
is built and how to disable the row in one line if you ever want it gone.

## Where the two views live

The two cards live in one **context column**: a single tab type of the host's
right Sidebar whose body carries the prototype's own two tabs — message
trajectory and runtime snapshot — fixed above whichever card is showing, so
either card is one click away for as long as the column is open. The column's
expand/collapse control is the host Sidebar's. The tab type registers once:

- **Message trajectory** — the retained context read **turn first**: newest turn
  on top, each turn a card that opens into its tool cycles (and each cycle into
  the call's arguments and the seqs pairing it with its result) plus its final
  conclusion. The compaction attempt appears as one inline process line; a
  committed compaction stands a **summary group** in for the turns it replaced,
  and the archived copies of those turns open inside it. Turn-token estimates
  are deliberately absent: the prototype's numbers are sample data and the
  projection carries none, so the card states what it knows — how many calls a
  turn made — instead of inventing a figure.
- **Context snapshot** (`context-snapshot-bar-snapshot`) — the latest committed
  runtime-context record, with each contribution's own text, its standing, and a
  copy action.

One **composer entry** reproduces the prototype's snapshot row — glyph, title,
summary, standing, chevron — and opens the column on the runtime-snapshot tab.
It takes the composer card's own width, read from the host's
`--dsh-composer-card-max-width`, so the row lines up with the input at every
viewport. The prototype docks that row below the composer; this build keeps it
directly above the input, on the reading path of the text about to be sent.

## Visual design

The cards implement the Open Design prototype kept in
[docs/design/](docs/design/) (`dsh-context-snapshot-prototype.html` plus its
`brand-spec.md`, the side-panel design): hairline structure, blue reserved for
selection, compact low-contrast metadata, a card head that reports its own state,
a sticky chip overview over the message track, a process marker for the
compaction attempt, an inspector under the selected message, and one arrival
animation per committed change (never on a first load or reconnect, and
suppressed under `prefers-reduced-motion`).

The stylesheet is **generated from the prototype**: `scripts/gen-card-styles.mjs`
reads `docs/design/dsh-context-snapshot-prototype-v4.html`, lifts its `<style>`
block, and writes `src/client/styles.ts` with the prototype's own class names,
palette and media queries, scoped under one root class — `:root` becomes that
class, every rule is prefixed with it, and the keyframes are renamed so the
plugin cannot collide with the host. Edit the prototype and re-run the script;
never hand-edit the generated file, so the cards cannot drift from the design
they must match.

The prototype of record is `docs/design/dsh-context-snapshot-prototype-v5.html`
(the turn-first revision); earlier revisions stay beside it as history.
`src/client/host.css.ts` is the only hand-written CSS: the seams between that
drawing and the product — the column body fills the pane the host gives it, and
the composer row takes the composer card's width. Everything else, including the
column's own `.context-tabs`, comes from the generated sheet.

The outer column chrome belongs to the host Sidebar (its tab chip and
expand/collapse), and the prototype's `#snapshotPane` id is addressed by class
instead so several instances stay valid — the two places this build departs from
the drawing.

## What the cards show

Both cards read the same projection, `contextSnapshotBar`, which the Host folds
from committed Session events. Nothing in the browser reads the Session log or
the loaded chat window, and the plugin never writes an event.

### Snapshot card

| Standing | Meaning |
|---|---|
| No record yet | no unified runtime-context snapshot was ever committed in this Session |
| In effect | the latest snapshot message is still a current surface node |
| Cleared | the producer committed its clearing message; no snapshot is retained |
| Replaced out of context | the recorded snapshot left the current surface through a replacement; its sections stay visible for reference |

Sections are shown by the name the producer gave them, including names this
plugin does not know. Text is rendered as text; over-long text is cut at
`snapshotPreviewChars` and marked as truncated, and copying always yields the
text that is on screen rather than a claim of the complete record.

### Trajectory card

One row per current model message, identified by its event seq: system prompt,
user message, plugin injection, assistant message, tool result, or compaction
summary. Tool calls hang off the assistant node that requested them and results
name the call they answer, so a parallel batch cannot be mis-counted as extra
messages. A tool result is a user-role message internally and is never shown as
human input.

A compaction checkpoint is classified by asking the compaction seam whether the
message carries its checkpoint provenance (`@deepseek-ai/dsh-compaction/checkpoint`),
so it reads as the summary it stands for instead of as one more injected
context — including the summary label, its own rail marker, and the replaced
range in the inspector.

The header states the Host's exact message count, and when the card cannot show
every retained message it says how many were left out. The latest committed
compaction appears with the summary text and the nodes it replaced, also with
its own omitted count.

### Known limitations and deferred work

- **Cold fold cost grows super-linearly.** The fold keeps the whole surface in
  one array and rebuilds it per committed event, so folding a complete log costs
  O(n²). Measured on this project's builder: 2 000 events 4 ms, 5 000 events
  12 ms, 10 000 events 65 ms, 20 000 events 576 ms. Steady-state operation is
  unaffected — the drive folds only the event that just committed, which stays
  in the tens of microseconds — but a cold drive (resume, or a cache miss after
  a configuration change) of a very long session blocks the host for seconds.
  `tests/replay.spec.ts` prints the cold fold beside the payload size so a
  regression is visible; the structural fix (chunk the retained surface, which
  changes the state layout and its `stateVersion`) is deferred until a session
  long enough to need it exists.


- The inspector covers message nodes and both halves of a tool invocation.
  Selecting a call shows the arguments it was given; selecting its result shows
  the committed excerpt, or the waiting state while none has committed.
- The trajectory card reproduces the prototype's shell (toggle with glyph, role
  strip and state; detail with the intro and status pill, the track of turn
  segments, the attempt marker, the comparison and the replay note), and drops
  the prototype's own dead `overviewMarkup` strip, which the design file defines
  but never renders.
- Motion follows the brief: a first look shows the record as it stands, and a
  later commit flashes the snapshot detail once (`state-change`, the
  prototype's `render(key, flash)`). The prototype's *contracting* animation for
  a replaced turn is not implemented: by the time the replacement commits those
  messages are gone from the surface, so the summary group states the swap
  instead of animating nodes the projection no longer carries.
- The column is the host Sidebar's, not the prototype's own `.context-sidebar`:
  one column per product, so its width, dock, split, and collapse behaviour are
  the host's rather than the prototype's 360px drawing.
- Section text longer than the projection's display bound is truncated and the
  card says so; the copy action copies only what is on screen.

### Unverified claims

This README states only what the recorded checks support. The compatibility
table in [docs/compatibility.md](docs/compatibility.md) lists exactly which
artifacts were installed and exercised, and
[docs/acceptance.md](docs/acceptance.md) separates test-command evidence from
browser and real-API evidence; the real-API row records the model-backed turn
and real `/compact` that were run.

## See the cards without booting the app

`npx vitest run tests/preview.spec.tsx` renders both cards, the composer entry,
and their stylesheet into `artifacts/preview.html`: every snapshot standing
(none, in effect, cleared, replaced out of context), every trajectory phase
(idle, generating, failed, committed), and the composer entry's standings. Each
block says in its caption whether it came from a recorded replay projection or
from a constructed view for a standing the fixtures do not reach. Open the file
in a browser to read the same markup the bundle ships — useful for a design pass
— and the spec's own assertions keep the preview from becoming a picture of
nothing.

`npm run check:render` renders that file in headless Chrome and checks the
shipped stylesheet actually applies — computed layout, the sticky overview, the
monospace chip step, the closed comparison, the motion keyframes, and horizontal
overflow at 1440px — then writes `artifacts/preview.png`. jsdom, where the
component specs run, parses no stylesheets, so this is the check that covers
presentation; it needs Chrome and never runs in CI.

## Install

```sh
dsh plugin --profile <profile> add ./dsh-context-snapshot-bar-0.1.1.tgz
dsh --profile <profile> --dump-config   # the "# == dsh-context-snapshot-bar" layer
dsh --profile <profile>
```

Remove it with:

```sh
dsh plugin --profile <profile> remove dsh-context-snapshot-bar
```

Removing the bundle takes the row out of the composed tree and leaves your
Session data untouched; adding it back projects the same Sessions again from
their logs.

### A newly installed bundle needs a restart

The browser boot graph is composed once while the app starts, and a live
patch-layer reload only mounts new Host rows — it does not add their browser
half. So after `dsh plugin add`, restart the app before expecting the cards:

```sh
# stop the process listening on the port, then start it again
scripts/restart-resident-web.sh 3080
```

The web URL carries a token minted from a per-activation secret, so a restart
also invalidates the previous URL: reopen the address the launcher prints.

## Tested compatibility

| Component | Version this bundle was built, installed, and exercised against |
|---|---|
| `@deepseek-ai/dsh` (Host and Web) | `0.1.5-rc.2` from npm |
| Declared range in `peerDependencies` | `@deepseek-ai/dsh-session`, `@deepseek-ai/dsh-session-projection`: `>=0.1.5-rc.2 <0.2.0-0`; `@deepseek-ai/cordis`: `^4.0.2` |
| Claimed compatible | `0.1.5-rc.2` and every later `0.1.x`, for **starting and running** `dsh`; the card content itself is only verified on `0.1.5-rc.2` |

No other version is claimed compatible. Development used the checkout at
`c291e7961a` (`dsh-v0.1.5-rc.2-139-gc291e7961a`) as the reference for intended
behavior; its interfaces were compared field by field with the published
artifact, but that checkout was never installed and driven. See
[docs/compatibility.md](docs/compatibility.md) for the comparison and for the
list of things that were **not** verified.

The range above is what the plugin asks for, not what it needs to stay out of the
way: the two peers are consumed as types and service names, and the built Host
bundle imports no `@deepseek-ai/*` module at all, so a newer harness cannot fail
to resolve it.

## Surviving harness upgrades

This bundle must never be the reason `dsh` fails to start, or the reason a turn
already in progress breaks. A Loader row that cannot be resolved, that rejects
while activating, or that waits on a service the harness no longer provides makes
the launcher refuse to start at all, so each of those paths is closed here:

- **DSH packages are peers, never dependencies.** A profile's pnpm-managed
  `node_modules` entry takes precedence over the module fallback that links the
  running installation, so a `dependencies` entry would pin this plugin — and
  every other row resolving that name from the same hoisted directory — to the
  copy it was built against, for the life of the profile. Declared as peers, the
  Host half follows whichever `dsh` is running.
- **No harness import at runtime.** The Host bundle imports `zod` and no
  `@deepseek-ai/*` module at all; `scripts/check-pack.mjs` and
  `tests/build.spec.ts` both fail on any such specifier. The two Session-log
  readings the fold needs — sequence branding and whether an event produces a
  message — and the compaction checkpoint marker are implemented in this
  package, with `tests/session-log.spec.ts` and `tests/compaction.spec.ts`
  holding each of them equal to the harness implementation it mirrors. An
  unresolvable row is impossible while the only external module is a plain
  dependency the package manager installs.
- **Soft service binding.** `apply` binds `sessionProjections` through
  `ctx.inject`, so an absent or renamed registry leaves the plugin inactive
  instead of leaving the row pending, and it swallows its own failures: an
  unusable configuration or a changed projection API costs one log line instead
  of the harness. `tests/load-safety.spec.ts` drives all of that against the real
  Cordis lifecycle.
- **The same containment in the browser.** The Web Client kernel rejects its
  whole boot on a Loader entry that fails or stays pending
  (`assertEntriesActive`), so the Client half binds its slot, locale, and sidebar
  services through `ctx.inject` as well: a renamed service costs the cards, not
  the GUI.
- **A total projection.** The registry drives a projection's fold and view with
  no guard of its own, inside the Session append that committed the event, so a
  fault there would escape into a running turn. Both are total: a fault returns
  the state it was given, or the empty view, which are the references the
  registry compares, and it is reported once instead of per event.
  `tests/load-safety.spec.ts` faults both and asserts the reference and the
  report.

What is left is this package's own presence in the tree: the row stops startup
only if the bundle's files are removed while its name stays in
`dsh.profile.bundles`, which is a hand-edited profile rather than a harness
upgrade. To turn the cards off, remove the bundle:

```sh
dsh plugin --profile <profile> remove dsh-context-snapshot-bar
```

Or keep it installed and disable only its row, in the profile's own patch layer
(`$DSH_HOME/profiles/<profile>/cordis.patch.yml`), which applies after every
bundle layer:

```yaml
- id: context-snapshot-bar
  disabled: true
```

## What "real time" means here

The cards show **committed Session events**. A value appears once the event is in
the Session log, which is what the model would see on its next request — not when
the browser receives a streaming token, and not when you edit the configuration.
Editing the plugin's configuration takes effect at the next Host start, because
the projection cache is keyed by the configuration fingerprint.

The snapshot card's latest record is the newest committed one, and it is kept
even after it stops being part of the current model context: the standing says
which of those two states it is in. "Latest record" is therefore not a promise
that the text is still in the request the model receives.

## Troubleshooting

| Symptom | What it means |
|---|---|
| No cards appear in the right column | The bundle is not in the composed tree: check `dsh --profile <profile> --dump-config` for the `# == dsh-context-snapshot-bar` layer, and that `lib/client.js` exists in the installed package. A newly installed bundle needs the restart below. |
| The Host row is in the tree but the browser half never loads | The Web server serves built Client bundles; a bundle that was never built fails activation loudly with a build instruction. Run the package build before installing from a checkout. |
| Cards appear but stay on "No record yet" / "0 messages" | No committed event has reached the projection yet in this Session, or another plugin's Session is selected. |
| Configuration change had no effect | Configuration is read at Host start. Restart the profile; a changed bound also invalidates the projection cache so the Session is replayed at the new bound. |
| A card says text was truncated | `excerptChars` / `snapshotPreviewChars` / `snapshotSectionLimit` cut it. The counts next to the truncation notice state how much was left out; raising the bound requires a restart. |
| Only the newest part of a long trajectory is listed | `visibleNodeLimit` bounds what reaches the browser. The header always reports the Host's exact total and how many rows were omitted. |

## Configuration

Every bound is validated while the plugin loads; a value outside its range fails
the load instead of being clamped. Set them in the profile's
`cordis.patch.yml`:

```yaml
- id: context-snapshot-bar
  config:
    visibleNodeLimit: 120
    excerptChars: 200
    toolArgsChars: 160
    comparisonNodeLimit: 120
    snapshotPreviewChars: 2000
    snapshotSectionLimit: 32
```

| Field | Default | Range | Meaning |
|---|---|---|---|
| `visibleNodeLimit` | 120 | 20–500 | Surface nodes sent to the Client |
| `excerptChars` | 200 | 40–1000 | Characters kept per node excerpt |
| `toolArgsChars` | 160 | 40–500 | Characters kept per tool call's arguments |
| `comparisonNodeLimit` | 120 | 20–500 | Replaced nodes kept in the compaction comparison |
| `snapshotPreviewChars` | 2000 | 200–8000 | Characters kept per snapshot section |
| `snapshotSectionLimit` | 32 | 1–128 | Snapshot sections sent to the Client |

A configuration change applies at the next Host start; the projection cache is
keyed by the configuration fingerprint, so a changed bound replays the Session
log instead of resuming text the previous bound truncated.

## Related

[OpenDesign integration](docs/opendesign-integration.md) records how this
machine's Open Design app drives DeepSeek Harness through the `open-design`
profile that Open Design installs with the user's own `dsh`.

## Development

```sh
pnpm install
pnpm run typecheck   # both compile faces, strict
pnpm run build       # declarations + Host ESM bundle + Client loader factory
pnpm test            # unit, artifact, and loader-protocol tests
pnpm run check:pack  # published file list and artifact contract
pnpm run pack        # artifacts/dsh-context-snapshot-bar-0.1.1.tgz
```

`pnpm test` builds first, because `tests/client-registration.spec.tsx` and
`pnpm run check:pack` load the emitted `lib/client.js` and `lib/index.js`: the
suite checks the artifact the loader resolves, not only the sources. Running a
single spec through `npx vitest run tests/cards.spec.tsx` skips that build, so
build once before the first such run.

The build is self-contained: `scripts/build.mjs` drives `tsc` for declarations
and `esbuild` for both runtime artifacts, and consumes no harness monorepo build
helper.

Tests live in `tests/`; `tests/fixtures/README.md` documents the keyless Session
logs and which producer each stands in for, and `tests/expected/` holds the
committed replay outputs (`UPDATE_EXPECTED=1 pnpm test` regenerates them, and the
diff is the review).
