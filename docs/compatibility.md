# Compatibility

Which DSH artifacts this bundle was actually installed and exercised against,
and which interfaces it depends on. Version numbers alone are not evidence: a
row appears here only after the tarball named in it was installed into an
isolated profile and driven through the checks in
[acceptance.md](acceptance.md).

## Development baseline

| Fact | Value |
|---|---|
| DSH source checkout | `/Users/buu99y/workspace/github/agents/deepseek-harness` |
| Commit | `c291e7961a` |
| `git describe` | `dsh-v0.1.5-rc.2-139-gc291e7961a` |
| Repository clean at read time | yes (`git status --short` empty) |

The checkout's `package.json` version is `0.1.5-rc.2`, which is also a published
npm version. That coincidence is not proof of equality: the checkout is 139
commits past the `dsh-v0.1.5-rc.2` tag. The interfaces this plugin consumes were
compared directly in both trees (below), which is the evidence that matters, not
the version string.

## Tested artifacts

| Artifact | Version | Source | How it was obtained |
|---|---|---|---|
| `@deepseek-ai/dsh` (Host + Web) | `0.1.5-rc.2` | npm registry | `npm install @deepseek-ai/dsh@0.1.5-rc.2` into `/tmp/dsh-probe-install`; `dist.shasum 2c78db39568d910868f1e4f34062a4f346d4815d`, `dist.integrity sha512-8Xc8hCQHcIWRmTCVU/xZdp6/qMsWMeAd2ObChKDEsfhUPJFXx6H0lgeb1DxUMD86HZrrVN+1bCvn1ppjZ/fOxw==` |
| `dsh-context-snapshot-bar` | `0.1.0` | local build + `pnpm pack` | `artifacts/dsh-context-snapshot-bar-0.1.0.tgz`, sha256 `b183d83bb93373cb392c5281d03726f1c9dbfa9f0e282d63c37ebd0d2e7b0af5` |

Not tested, and therefore not claimed compatible: the monorepo's own source
build of `c291e7961a`, every published DSH version other than `0.1.5-rc.2`, and
any version published after this table was written.

## Interface comparison

The plugin talks to the Host and the browser through four public surfaces. Each
was read in both trees before the first line of plugin code; only the npm tree
is exercised by the tests below, and the checkout is the authority on intended
behavior.

| Surface consumed | Published `0.1.5-rc.2` | Checkout `c291e7961a` | Drift |
|---|---|---|---|
| `ctx.sessionProjections.register(definition)` — `key`, `stateVersion`, `stateSchema`, `init`, `apply`, `wire.viewSchema`, `wire.view` | present, `@deepseek-ai/dsh-session-projection/lib/types/index.d.ts` | identical signature | none |
| `SessionProjectionStateMap` / `SessionProjectionMap` merge points (`@deepseek-ai/dsh-session-projection/types`) | present | identical | none |
| `conversation.input.dock` slot (`kind: 'list'`, `scope: 'session'`) | present, `@deepseek-ai/dsh-client-ui-conversation/lib/types/client/contract/slots.d.ts` | identical declaration | none |
| `SessionStandardProps.useProjection` (`@deepseek-ai/dsh-client-ui-session/client`) | present | identical | none |
| `window.__ModuleLoader__.load({ id, factory })` client bundle protocol | present, `@deepseek-ai/dsh-client-modules/lib/client.js` | same protocol; unrelated additions (`parseDshClient`, `exactPackageSpecifier`) | none affecting this plugin |
| `deriveEventMessage`, `foldSurface`, `SessionSeq`, `SessionEventMap` (`@deepseek-ai/dsh-session`) | present | identical; only `@deprecated` annotations added | none affecting this plugin |
| Runtime-context producer messages (`@deepseek-ai/dsh-system-prompt` via agent-loop) | `source.kind='plugin'`, `plugin='@deepseek-ai/dsh-system-prompt'`, `form='snapshot'`, `sections[]`; cleared body `Current runtime context: none. Earlier runtime-context snapshots no longer apply.` | identical strings and fields | none |
| `compaction/start` · `compaction/summary` · `compaction/end` · `compaction/prune` payloads | present | identical | none |

### Declaration-sharing caveat

`@deepseek-ai/dsh-client-ui-conversation/client` and
`@deepseek-ai/dsh-client-ui-session/client` publish declarations that import
`@deepseek-ai/dsh-client-ui-slots`. That package **is** on npm
(`0.1.5-rc.2`), but it is not a dependency of the transient packages, so a
plugin must depend on it explicitly to type-check. This plugin declares it in
`devDependencies`; nothing is imported from it at runtime, because every use is
`import type` and is erased before bundling.

## Runtime dependency policy

| Package | Section | Range | Used for |
|---|---|---|---|
| `@deepseek-ai/dsh-session` | `peerDependencies` | `>=0.1.5-rc.2 <0.2.0-0` | `SessionSeq` brand construction, the `SessionEvent` type, and `deriveEventMessage` |
| `@deepseek-ai/dsh-session-projection` | `peerDependencies` | `>=0.1.5-rc.2 <0.2.0-0` | the `ProjectionDefinition` type and the two projection tables the plugin merges into |
| `@deepseek-ai/dsh-compaction` | `devDependencies` | `0.1.5-rc.2` | type-only: it declares the `compaction/*` members of `SessionEventMap`, and `tests/compaction.spec.ts` compares the checkpoint predicate with the package's own |
| `zod` | `dependencies` | `^4.4.3` | configuration validation and the wire state/view schemas |
| `@deepseek-ai/cordis` | `peerDependencies` | `^4.0.2` | the `Context` type; the Host already mounts exactly one Cordis instance |

Every DSH package is a peer, which is a startup requirement rather than a
packaging preference: a profile's pnpm-managed `node_modules` entry takes
precedence over the module fallback that links the running installation, so a
DSH package listed as a dependency would keep this plugin — and any other row
hoisted beside it — on the copy it was built against for the life of the profile,
across harness upgrades. `zod` stays a plain dependency because it is a leaf
library with no harness identity, and the Host consumes the projection state
schema through its `parse` method rather than by brand.

`dsh-session` is the only DSH package the built Host bundle imports at runtime
(`./types` and `./surface`); the compaction checkpoint marker is read off the
Session log instead, and `tests/build.spec.ts` fails on any further specifier in
`lib/index.js`. The remaining DSH entries are type-only and erased before
bundling.

`@deepseek-ai/dsh-client-ui-conversation` and `@deepseek-ai/dsh-client-ui-session`
are development dependencies: the Client bundle imports them type-only and
requests the browser modules through the loader table, as `dsh.client.inject`
declares. Nothing from them is packaged.

## Visual basis

The Client half implements the Open Design prototype stored under
`docs/design/` in this repository (copies verified byte-identical by sha256 to
the prototype hand-off). The prototype page shell, its sample data, and its demo
controls are not part of the plugin; only the two cards and their internal
contents were carried over, with the prototype's selectors translated onto this
plugin's scoped classes.

## Package export surface

The manifest exposes three subpaths:

| Subpath | Target | Read by |
|---|---|---|
| `.` | `lib/index.js` (+ `lib/types/index.d.ts`) | the Loader row that mounts the Host plugin |
| `./client` | `lib/client.js` (+ `lib/types/client/index.d.ts`) | the browser boot graph |
| `./package.json` | `package.json` | the Loader, which reads each row's manifest through the package's export map |

The third entry is not optional: without it the Loader cannot read this row's
manifest and the row never mounts, even though the files and the row itself are
correct. It was added after a direct resolution probe from the profile base
directory failed with `ERR_PACKAGE_PATH_NOT_EXPORTED`, and the packaging check
now verifies that every declared export target is present in the tarball.

## Install completeness

The published manifest names exactly the packages a profile must materialize.
Two independent installs resolved them without any override or local link:

| Check | Result |
|---|---|
| `pnpm install` of the tarball in a directory with no DSH checkout in reach | pass — 21 packages from the registry; the Host entry point then loaded and exported its plugin surface |
| `dsh plugin add` into an isolated profile | pass — every production dependency materialized at the profile root: `zod` 4.6.2, `dsh-session`, `dsh-session-projection`, and `dsh-compaction` at `0.1.5-rc.2`, plus the hoisted `@deepseek-ai/cordis` 4.0.2 that satisfies the peer range |
| Client half | requests the browser modules through the loader table only; nothing from `dsh-client-ui-conversation`, `dsh-client-ui-session`, `dsh-client-ui-slots`, or `dsh-client-ui-renderer` is packaged |

## Not verified

- The monorepo's own source build at `c291e7961a` was never installed and
  driven. Its interfaces were compared against the published tree; that
  comparison is not a substitute for running it.
- No DSH version other than `0.1.5-rc.2` was exercised, so no other version is
  claimed compatible. The older global `dsh` `0.1.1-rc.2` did install the bundle
  and print its layer, but the profile never bound its port, so nothing was
  verified on it. That version predates the `dsh-client-ui-session` browser
  package that carries the `useProjection` seat this plugin's Client half reads,
  so it is not a candidate baseline.
- npm publication was not attempted, and no npm name availability was checked.

`@deepseek-ai/cordis` stays a peer dependency because the Host already mounts
one Cordis instance from its own bundle; the plugin imports the Context type
only. The browser half requests React, `react/jsx-runtime`, and the locale,
conversation, session, renderer, and slots packages through the loader's module
table, so the page never receives a second React or Cordis.
