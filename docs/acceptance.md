# Acceptance record

What was actually executed, on which artifact, and what it proved. Every row
below was run in this session; anything not run is listed as not executed rather
than assumed. Unless a row says otherwise, the artifact under test is
`artifacts/dsh-context-snapshot-bar-0.1.0.tgz` (sha256
`b183d83bb93373cb392c5281d03726f1c9dbfa9f0e282d63c37ebd0d2e7b0af5`), installed
into an isolated DSH home and served through the published `dsh` `0.1.5-rc.2`.

## Test commands (source tree)

| Command | Result |
|---|---|
| `pnpm run typecheck` (`tsc -p tsconfig.host.json && tsc -p tsconfig.client.json`) | pass — both compile faces, strict, with `exactOptionalPropertyTypes` and `noUncheckedIndexedAccess` |
| `pnpm test` (`vitest run`) | pass — 127 tests in 10 files |
| `pnpm run build` | pass — `lib/index.js`, `lib/client.js`, `lib/client.js.map`, declarations under `lib/types/` |
| `pnpm run check:pack` | pass — published file list, every declared export entry, layer declaration by package name, Client factory handoff and source map, no workspace/link/file ranges in any section, no inlined host dependency, and the production dependencies present in the manifest |
| `pnpm pack` | pass — `artifacts/dsh-context-snapshot-bar-0.1.0.tgz` |

| File | Tests | What they cover |
|---|---|---|
| `tests/build.spec.ts` | 12 | Manifest contract, patch layer, Host `apply` registering its projection as an effect, configuration refusal at load, and the Client bundle executed in a Node VM whose only global is `window.__ModuleLoader__` |
| `tests/config.spec.ts` | 9 | Documented defaults, both ends of every range, refusal of negative/fractional/non-numeric/out-of-range values, fingerprint sensitivity, Standard Schema surface |
| `tests/excerpt.spec.ts` | 6 | Empty text, Unicode, multiple blocks, limits, and never publishing half of a surrogate pair |
| `tests/snapshot.spec.ts` | 17 | Every snapshot standing, unknown producers and sections, restored snapshots, truncation and section limits, state-reference identity, oracle agreement |
| `tests/surface.spec.ts` | 16 | Oracle agreement for every prefix, per-kind classification, parallel tool correlation, positional replacement, tail bounds and the system anchor |
| `tests/compaction.spec.ts` | 14 | Attempt phases, failure without rollback, committed comparison, consecutive compaction, prune vs summary, manual turn |
| `tests/host-registration.spec.ts` | 8 | Real Cordis `Context`, `SessionStore`, and `SessionProjectionRegistry`: registration, live drive, unchanged publishes, unload/remount, shared-key refcount, config-fingerprint rejection |
| `tests/motion.spec.ts` | 14 | Every animation refusal path and the replay decision |
| `tests/client.spec.tsx` | 18 | Both cards in jsdom with real React: collapse defaults, all standings, unknown section, text-only rendering, copy success/failure/absent clipboard, truncation, row identity, selection, compression comparison, reduced motion, replay |
| `tests/replay.spec.ts` | 11 | Whole-log vs. checkpoint agreement against committed expected files, recovery cut points, wire bounds, interleaved sessions |

### Pack check rejects invalid packages

Each guard was proved to fail, from a copy of the tree with one defect injected:

| Injected defect | Reported |
|---|---|
| `@deepseek-ai/dsh-session` set to `workspace:^` in `dependencies` | `package.json/dependencies: @deepseek-ai/dsh-session uses the non-publishable range workspace:^` |
| `lib/types/client/` deleted | `lib/types/client/index.d.ts is not in the published tarball` and `package.json/exports: ./client.types points at … which is not packed` |
| `require("node:fs")` appended to `lib/client.js` | `lib/client.js: the browser bundle requires a node: builtin` |
| patch row name changed to `./src/index.ts` | `cordis.patch.yml: the layer references a file path instead of the installed package name` |

### Wire bounds measurement

Folding a log of 10,000 short messages plus one 1 MB tool result and producing
the bounded view yields a 20,296-byte JSON payload in about 51 ms on the
development machine. Both numbers are measurements from one run, not a latency
promise; the gate is that the payload stays bounded.

## Isolated install of the tarball (no checkout in reach)

The tarball was copied to `/tmp/plugin-isolated` and installed there with a
separate pnpm store, so nothing in the dependency graph could resolve to this
checkout:

```sh
mkdir -p /tmp/plugin-isolated && cp artifacts/dsh-context-snapshot-bar-0.1.0.tgz /tmp/plugin-isolated/
cd /tmp/plugin-isolated && printf '{"name":"isolated-install-probe","private":true,"version":"0.0.0","type":"module","dependencies":{"dsh-context-snapshot-bar":"file:./dsh-context-snapshot-bar-0.1.0.tgz"}}' > package.json
pnpm install --store-dir /tmp/pnpm-store-isolated
node -e "import('dsh-context-snapshot-bar').then(m => console.log(Object.keys(m).sort().join(', ')))"
```

| Check | Result |
|---|---|
| Every declared production dependency resolved from the registry | pass — 21 packages, no overrides |
| The Host entry point loads and exports its plugin surface | pass — `PROJECTION_KEY, apply, name, resolveConfig` |
| The internal type-only module links resolve | pass — `PROJECTION_KEY` resolved through `./projection/index.js` |
| `resolveConfig` accepts and defaults a configuration | pass — all six documented defaults |

Later revisions moved every DSH package to `peerDependencies`, so an install no
longer materializes them: the profile resolves `@deepseek-ai/dsh-session` and
`@deepseek-ai/dsh-session-projection` through the module fallback that links the
running installation, and only `zod` and `@deepseek-ai/cordis` are resolved from
the plugin's own tree. `docs/compatibility.md` records the policy and
`tests/build.spec.ts` fails if a DSH package reappears under `dependencies`.

## Isolated-profile install (packaged artifact)

```sh
dsh_test_home=$(mktemp -d)
DSH_HOME="$dsh_test_home" dsh --profile context-bar-test --from-default-profile web --dump-config
DSH_HOME="$dsh_test_home" dsh plugin --profile context-bar-test add "$PWD/artifacts/dsh-context-snapshot-bar-0.1.0.tgz"
DSH_HOME="$dsh_test_home" dsh --profile context-bar-test --dump-config
DSH_HOME="$dsh_test_home" dsh --profile context-bar-test --no-open --host 127.0.0.1 --port <free port>
```

The numbers in this section and the two below were re-measured against the
tarball whose hash is recorded above, in a DSH home created for that purpose.
`dsh plugin add` keeps its own copy of an already-installed tarball path, so a
rebuilt artifact must be installed into a fresh profile (or the profile's
`node_modules` cleared) before its contents are read back.

| Check | Result |
|---|---|
| Profile created from the shipped web template without hand-writing a manifest | pass |
| `dsh plugin add` installs the tarball and appends the bundle | pass — `["@deepseek-ai/dsh-base","@deepseek-ai/dsh-web-app","dsh-context-snapshot-bar"]` |
| `--dump-config` shows the bundle's layer | pass — `# == dsh-context-snapshot-bar` then `- id: context-snapshot-bar` |
| Host plugin loads with no error output | pass — the row activated against the real `sessionProjections` service |
| Web serves the packaged Client bundle | pass — `dsh-context-snapshot-bar/client.js` rode the `/plugins/??…` combo request and the response was the built artifact |
| Dock entry renders inside a Session | pass — one `.dsh-context-snapshot-bar` element with both cards and one plugin style tag |
| Uninstall removes the bundle and the layer | pass — `dsh plugin remove` dropped it from `dsh.profile.bundles`, and the composed tree no longer mentions it; reinstalling restored the layer |
| Persisted Session data survives uninstall | pass — the same Session reopened after reinstalling and its events replayed into the projections |
| No second React or Cordis in the page | not measured directly; the bundle requests `react`, `react/jsx-runtime`, and the DSH client packages through the loader table (asserted in `tests/build.spec.ts`) and inlines nothing from them |

## Live projection (the installed artifact, in a browser)

A Session was created in the isolated profile and a prompt was sent from the
composer. The model call failed with `MISSING_CREDENTIAL` because the profile has
no API key, which is the expected keyless shape; the committed events were still
recorded, and the cards projected them.

| Observed | Value |
|---|---|
| Snapshot card standing | `In effect · 2 sections · Recorded at 03:02:10` |
| Section names | `sandbox:policy`, `approval:policy` — the real unified runtime-context contributions, with the session's own workspace path in the text |
| Trajectory message count | `4 messages` after one prompt |
| Node kinds and identity, in order | `[["7","system"],["8","user"],["9","injected"],["10","assistant"]]` |
| Node titles | `system prompt`, `user message`, `@deepseek-ai/dsh-system-prompt`, `assistant message` |
| Selecting a row | opened `.dsh-context-snapshot-bar__details` at that seq showing the node text |
| Console and page errors | none |

Screenshots: `docs/evidence/task3-live-projection.png` (cards with live data)
and `docs/evidence/task4-cards-desktop-dock.png` (both cards, one row selected).

## Reconnect / reload

A full page reload is the client-side half of a reconnect: the page loses every
in-memory value and must rebuild from the Host baseline.

| Check | Result |
|---|---|
| Card values after reload | identical — the same two section names, the same node identities `[[7,system],[8,user],[9,injected],[10,assistant]]`, and the same snapshot standing with its original commit time `Recorded at 3:02:10 AM` |
| Animation claimed for restored history | none — after the reload the root carried no `data-change-seq`, no `data-change-kind`, no `data-replaying`, and no leaving-node overlay |
| Console and page errors | none |

That is the plan's "baseline, reconnect, and session switch restore state without
replaying" requirement, measured on the installed artifact.

## Visual implementation against the Open Design prototype

The two cards were reimplemented from the prototype stored in
[docs/design/](design/) (`dsh-context-snapshot-prototype.html`, `brand-spec.md`,
`README.md`, byte-identical copies verified by sha256). The prototype's own class
names are not reused, because the prototype styles its whole shell page: the
cards keep this plugin's `dsh-context-snapshot-bar__*` classes and the
prototype's selectors are translated onto them (`.trajectory-toggle` →
`__trajectory-toggle`, `.overview-chip` → `__chip`, `.context-node` → `__node`,
`.tool-pair` → `__pair`, `.inspect-panel` → `__inspect`, and so on).

| Prototype element | Implemented as |
|---|---|
| design tokens (`--bg`, `--surface`, `--fg`, `--muted`, `--border`, `--accent`, fonts) | declared on the plugin root as `--csb-*`, so the tokens cannot leak into the host page |
| card frame: 12px radius, 1px hairline, 2px/7px shadow | `.dsh-context-snapshot-bar__card` |
| trajectory card above the snapshot card, trajectory open by default | dock order and per-card disclosure state |
| toggle header: glyph, title, compact strip, state, chevron that rotates | `__trajectory-toggle` / `__snapshot-toggle`, `__glyph`, `__strip`/`__token`, `__state`, `__chevron` |
| sticky overview rail with chips and a dashed group for the replaced range | `__overview`, `__overview-flow`, `__chip`, `__group`, `__chip--summary` |
| inspector with title, metadata, and copy line | `__inspect`, `__inspect-head`, `__inspect-title`, `__inspect-meta`, `__inspect-copy` |
| per-turn segments with a rule line | `__segment`, `__turn` (`::after` rule) |
| message rows: kind label, title, excerpt, right-hand metadata, kind colours | `__node` plus `--system/--human/--injected/--summary`, `__kind`, `__node-title`, `__excerpt`, `__node-meta` |
| tool call and result side by side, result prefixed `↳`, pruned result highlighted | `__pairs`, `__pair`, `__call`, `__result`, `__result--pruned` |
| collapsed archive line for the replaced range | `__archive` (`<details>`), `__archive-nodes`, `__archive-summary` |
| bounded dock module so composer and headers stay visible | `max-height: min(556px, 62dvh)` on the root, `min(342px, 34dvh)` per body |
| node enter, chip enter, prune, and replay motion; `prefers-reduced-motion` disables them | `--entering`, `--pruned`, `data-replaying`, and the reduced-motion block |

Not copied from the prototype, deliberately: the fake chat, the page shell, the
sidebar, the demo control panel, its sample event numbers and messages, and its
`mock` section text. All data still comes from the projection.

### Measured on the restyled build

| Check | Result |
|---|---|
| Rendered tokens | `--csb-surface: oklch(1 0 0)`, `--csb-fg: oklch(0.255 0.012 260)`, `--csb-muted: oklch(0.62 0.012 255)`, `--csb-border: oklch(0.89 0.007 255)`, `--csb-accent: oklch(0.61 0.17 256)` — the spec values |
| Card frame | background `oklch(1 0 0)`, border `1px oklch(0.89 0.007 255)`, radius `12px` |
| Typography | row kind and turn labels resolve to the mono stack at 11px; excerpts at 12px |
| Overview chips | 4 chips for the 4 messages of the probe Session, in surface order |
| Selection | a chip click set `aria-pressed="true"` and rendered that node's text in the inspector; the row shows the same selection |
| Segments | `Session anchor`, then the turn segments in surface order |
| Snapshot sections | `Sandbox file scope` / `Approval policy` friendly labels over `sandbox:policy` / `approval:policy` |
| Both cards expanded at 1280×720 | dock 365.8px tall, fully inside the viewport, composer visible, both card headers visible, no horizontal overflow |
| Reduced motion | the DOM suite asserts the replay control is disabled while the comparison stays visible |
| Console and page errors | none |

## Sidebar panels (the v3 design)

The two views were moved out of the composer dock and into the main column,
selected from the sidebar, following `docs/design/dsh-context-snapshot-prototype-v3.html`
(the design was produced through Open Design's own API: `POST /api/artifacts/lint`
returned no findings, and `POST /api/artifacts/save` stored it in the app).

| Check | Result |
|---|---|
| Plugin registers two `main` panel keys and two `sidebar.panellist` rows | pass — keys `context-snapshot-bar-trajectory` and `context-snapshot-bar-snapshot`, rows at orders 10 and 20 with matching ids |
| Sidebar rows appear with their labels | pass — "Context trajectory" and "Context snapshot" resolve from the plugin's own dictionaries through a label thunk |
| Selecting a row opens the panel in the centre column | pass — `.dsh-context-snapshot-bar__panel` replaces the conversation; the composer is unmounted while a panel is open and returns after "Back to conversation" |
| Trajectory renders the linear line from real data | pass — 4 rows for a 4-message session, in surface order with kinds `system, user, injected, assistant`, grouped under "Session anchor" and "Unattributed", and the rail element spans the group |
| Snapshot panel opens and reports its sections | pass — the second row renders the snapshot title and its section list (empty for the probe session, whose snapshot was never committed) |
| Console and page errors | none, after the two defects below were fixed |

Defects found and fixed while verifying:

| Symptom | Cause | Fix |
|---|---|---|
| Sidebar rows rendered as `panel.trajectory` / `panel.snapshot` | A raw label key is not resolved by the sidebar's own translator | The label is now a thunk that binds this plugin's namespace |
| Clicking a row selected it but the centre column stayed crashed | The panel read `ctx.sessions`, which is not part of a root-scoped panel's inject face (`TypeError: Cannot read properties of undefined (reading 'binding')`) | The panel reads the value from the session-list row's `projectionValues` through the standing `useSessions` hook |
| Panel content did not appear after the registration fix | `slots.register` returns a disposer, and the effect callback returned `void` | All registrations are yielded from one generator effect, so fiber disposal removes them |

## Browser visual check

| Viewport | Result | Screenshot |
|---|---|---|
| 1280×720 | both cards present; snapshot collapsed by default, trajectory expanded; sections, rows, and the selected-row details all render; no horizontal overflow (`scrollWidth === clientWidth === 1280`) | `docs/evidence/task4-cards-1280x720.png` |
| 390×844 | both cards present; no horizontal overflow (`scrollWidth === clientWidth === 390`) | `docs/evidence/task4-cards-390x844.png` |

Animation was exercised through the DOM suite (replay attribute, disabled
control, reduced-motion suppression, and the decision table) rather than capture;
no recorded animation frames are claimed.

## Resident Web profile (the maintainer's own GUI)

Installed into the profile that serves `http://127.0.0.1:3080/` — a `dsh web`
launched from this checkout with the default `~/.dsh` home and the `web` profile
(`patchReload: live`).

| Check | Result |
|---|---|
| Profile backed up before the change | pass — `package.json.bak-dsh-context-snapshot-bar` and `cordis.patch.yml.bak-dsh-context-snapshot-bar` next to the originals |
| Tarball staged inside the profile (`vendor/`) | pass — the profile does not depend on the plugin checkout staying in place |
| Dependency installed and resolvable | pass — `require.resolve('dsh-context-snapshot-bar')` and `…/client` both resolve from the profile base, and the manifest is readable through the export map |
| Bundle registered so a restart keeps it | pass — `dsh.profile.bundles` now ends with `dsh-context-snapshot-bar` |
| Composed tree | pass — `--dump-config` from this checkout prints the `# == dsh-context-snapshot-bar` layer with exactly one `- id: context-snapshot-bar` row |
| Live mount in the already-running GUI | **does not happen** — after the patch-layer reload the cards were still absent, because the browser boot graph is composed once at startup and a live reload only mounts Host rows |
| Mount verified in a second process of the *same* profile | pass — booting the resident `web` profile on another port rendered both cards (`Runtime context snapshot`, `Conversation trajectory`) with no console errors, against the same `~/.dsh` workspace list, while the bundle stayed registered in the resident profile |
| Restart required | yes — restart the app that serves the port; the URL's token is minted from a per-activation secret, so the previous URL is invalid afterwards |
| A duplicate row from a first attempt | removed — the profile patch file was returned to `[]`, because the bundle layer already contributes the row |

## Real API

Executed against the published artifact in the isolated profile, with
`DEEPSEEK_API_KEY` supplied to the launching process from the repository's
ignored `.env` (the key's value was never read, printed, or copied into any
artifact).

Task sent from the composer:

> Create a file named api-check.txt in the working directory containing exactly
> the text: real api check ok. Then read it back and tell me its contents in one
> short sentence.

| Check | Result |
|---|---|
| Model-backed turn completed | pass — the trajectory reached `11 messages` with three tool calls (`write`, `read`, `present`) and their results |
| Tool really ran | pass — `/private/tmp/dsh-final-workspace/api-check.txt` exists on disk and holds exactly `real api check ok` (17 bytes) |
| Real `/compact` | pass — the command ran and the trajectory fell to `3 messages` with `Compaction completed` |
| Real provider summary reached the card | pass — `Latest compaction · replaced 9`, and the excerpt is the model's own summary ("Primary Request and Intent…") rather than a fixture string |
| The 9 replaced nodes are listed | pass — the comparison's `before` list shows the replaced `user`, `injected`, `assistant`, and `tool-result` nodes with their tool names |
| Snapshot standing after the real compaction | `Replaced out of context · 2 sections` — the unified snapshot was inside the compacted range, so the card kept its sections and reported the removal, which is the documented distinction from `Cleared` |
| Replay control | enabled with a committed comparison; clicking it set `data-replaying="true"` and disabled the control for the run, then restored the same data with no console error |
| Console and page errors | none |

Screenshots: `docs/evidence/task5-realapi-dock.png` (the dock with the real
compaction) and `docs/evidence/task5-realapi-page.png` (the page around it).

This section is the only real-API evidence in this record; everything in the
keyless sections above remains fixture-based.

## Source baseline run

Not executed. The checkout at `c291e7961a` was never installed and driven; its
interfaces were compared field by field with the published artifact (see
[compatibility.md](compatibility.md)), which is a comparison, not a run. No row
above should be read as baseline-acceptance evidence.

The keyless fixture suite does use that checkout's `@deepseek-ai/dsh-session`
and `@deepseek-ai/dsh-llm` **published** packages to build and validate every
fixture, so the fold is checked against the harness's own append-time
validation; that is still not a run of the checkout's build.

## Release-artifact compatibility

Executed against the published `@deepseek-ai/dsh@0.1.5-rc.2` artifact, which is
the row every check above used: install, layer composition, Client bundle
serving, live projection, reload, uninstall, and reinstall.

The plugin also installs and composes into a profile on the older global
`dsh` `0.1.1-rc.2` (`dsh plugin add` resolved all 14 packages and
`--dump-config` printed the layer), but that profile never bound its port, so
nothing was verified on that version and no compatibility is claimed for it.
That version predates the `dsh-client-ui-session` browser package that carries
the `useProjection` seat this plugin's Client half reads.

## Task status

| Task | State |
|---|---|
| 1. Standalone Host/Client install chain | done and recorded above |
| 2. Snapshot projection, configuration, and recovery | done, except the README state table (Task 6) |
| 3. Current surface and latest compaction | done, including the projection-update proof deferred from Task 1 |
| 4. Cards and animation | superseded by the v3 sidebar panels; the timeline's animation set is the rail/row styling, and reduced motion still disables it |
| 5. Replay, recovery, regression acceptance | done — keyless replay and wire bounds, plus the real model turn with a real `/compact` recorded above |
| 6. Packaging, compatibility, and usage docs | in progress — see the coverage table in the plan |
