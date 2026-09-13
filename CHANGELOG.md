# Changelog

Versions describe the bundle's own contract. An installed copy is identified by
the content hash `dsh plugin add` writes into its vendor file name, so two builds
of one version never share an identity; only the versions below were published.

## 0.3.0

**Runtime snapshot nodes in the trajectory.** Each retained runtime-context
record is now its own node in the message trajectory, in the turn it was
committed in, so the transcript shows where the context changed instead of only
what the newest record says.

- Amber, distinct from the blue turns, the green compaction summary, and the grey
  system anchors; the icon and title carry the meaning, the colour is secondary.
- A snapshot stays visible while its turn is collapsed, and sits between the tool
  cycles it actually fell between when the turn is expanded — never moved to the
  turn's start or end.
- Each node asks for the digest of **its own** bounded sections, so a historical
  record never borrows the newest record's summary; without a digest it labels
  the text as a source excerpt. A clear record shows its own cleared state.
- The newest valid record is marked latest; older records still in context are
  marked history, and a record leaves the trajectory only when a committed
  replacement removes it — never at `compaction/start`.
- A newly observed record fades in once (650ms, 5px, amber edge), and hydration,
  reconnection, and tab switches do not play it; `prefers-reduced-motion` is
  honoured.
- `STATE_VERSION` moves to 3: the per-record metadata is derived from the log, so
  existing caches rebuild it.

The reference is `docs/design/dsh-context-snapshot-prototype-v6.html`, and its
`.runtime-node*` rules are transcribed into the hand-written stylesheet because
the generated sheet still tracks the visually-verified v5 prototype. A browser
pass over the v6 prototype was not completed.

## 0.2.0

Everything since the first bundle: the runtime-context card gained a model-written
digest, and the plugin stopped being able to pin or break the harness it runs on.
`0.1.1` existed only as interim local installs and was never tagged or published.

**Snapshot digest.** The runtime-snapshot card now answers "what is in this
snapshot" twice, in two separated blocks: a content digest written by a model —
one line per stored record, in the language the card is speaking — above the raw
DSH state text, which keeps its own headings, standing, and copy action.

- The route is deployment-configured (`snapshotSummaryProvider`,
  `snapshotSummaryModel`, `snapshotSummaryMaxTokens`, `snapshotSummaryTimeoutMs`)
  with no default: without one, the card says so instead of guessing.
  `snapshotSummaryEnabled: false` turns the section off.
- One answer is cached per record content and language, so reopening the card
  costs nothing and two Sessions that recorded the same text share one answer.
  The card asks only while the snapshot tab is on screen.
- The call sends the section text the card displays, which DSH already includes
  in every request, so it discloses nothing new. It is the plugin's only model
  call, and it carries no `purpose`, because `GenerateOptions.purpose` accepts
  only `compaction` and `session-title`.
- The digest reaches the Client over the plugin's own authenticated channel
  (`/context-snapshot-bar`, endpoint `snapshot-summary`), mounted on `webServer`
  and fenced by Connection's `requestRejection`.

**Nothing this plugin does can block `dsh` startup or a running turn.**

- Every DSH package is a peer, so a profile install cannot pin a harness copy
  beside the running installation; `check:pack` and the tests reject a DSH
  package under `dependencies`.
- The Host bundle imports no `@deepseek-ai/*` module at runtime: the Session-log
  readings it needs, and the compaction checkpoint marker, are implemented in this
  package and held equal to the harness implementations by tests.
- Services bind softly through `ctx.inject`, so an absent or renamed service
  leaves the plugin inert instead of leaving a Loader entry pending, and `apply`
  swallows its own failures.
- The projection's fold and view are total: a fault returns the state it was
  given, or the schema-valid empty view, because the registry drives them inside
  the Session append that committed the event.
- The Client half binds softly too, so the browser kernel cannot reject its whole
  boot over this plugin.

**Compactions are recorded again.** The replaced-span match compared the
harness's shadow set with derived nodes instead of surface entries, so one
position whose message an empty-content record projects to null left every
compaction unrecorded: the trajectory card showed neither the summary nor the
turns it replaced, hiding 1092 replaced messages in a real Session.
`STATE_VERSION` moved to 2 (the registry skips rows from another version and
refolds), the summary group is drawn where the replacement landed rather than
last, and it states the span and count it actually replaced.

**Fixes.** The digest route is mounted on `webServer`, because Connection's
`rpc.handle` reaches `webServer` through the Connection service's own context —
which never injects it — so a registration from another fiber threw and served
nothing, and the browser saw the static handler's 405. The digest reads the
harness's terminal failure chunk instead of reporting every cause as an empty
answer, and carries what it observed to the card. The snapshot card's empty
records no longer break the compaction match.

## 0.1.0

First bundle: the context column with its two fixed tabs, the runtime-context
snapshot card, and the turn-first conversation trajectory, following
`docs/design/dsh-context-snapshot-prototype-v5.html`. The Host registers one
Session projection, never writes to the Session log, and never changes the agent
loop or the compaction policy.
