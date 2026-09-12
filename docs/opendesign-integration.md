# OpenDesign integration

How this machine's Open Design app drives DeepSeek Harness, and what was
verified when the connection component was installed.

## What Open Design installs

Open Design does not ship or install `dsh`. It carries one integrity-checked
tarball of its own profile bundle and asks the user's own `dsh` to install that
bundle into a dedicated `open-design` profile. That profile is the only thing
Open Design adds to a Harness installation; credentials, settings, tools,
sessions, and provider adapters stay owned by the user's `DSH_HOME`.

| Fact | Value |
|---|---|
| App | Open Design 0.19.2, `/Applications/Open Design.app` |
| Component file | `/Applications/Open Design.app/Contents/Resources/open-design/agent-runtimes/deepseek-harness/open-design-dsh-runtime-0.1.0.tgz` |
| Component sha256 | `9852fa0fc79a870f656c8b03876abd42071658e124fad76c8c551333ebbf8933` (matches the app's `manifest.json`) |
| Package | `@open-design/dsh-runtime@0.1.0` |
| Profile | `$DSH_HOME/profiles/open-design` |
| Profile bundles | `@deepseek-ai/dsh-base`, `@open-design/dsh-runtime` |
| Launch surface | `dsh --profile open-design --stdio`, one short-lived process per run |

The bundle adds only the JSONL stdio protocol boundary. Its patch layer disables
`hmr` and replaces the deployment persona, then inserts two rows:
`@open-design/dsh-runtime/startup` (which parses `--probe`, `--models`, and
`--stdio`) and `@open-design/dsh-runtime`.

## What was executed

Installed with the checkout's own launcher, which is the same `dsh` source the
resident web profile runs from:

```sh
cd /Users/buu99y/workspace/github/agents/deepseek-harness
DSH_HOME="$HOME/.dsh" node --import tsx/esm apps/cli/src/bin.ts plugin \
  --profile open-design add \
  "/Applications/Open Design.app/Contents/Resources/open-design/agent-runtimes/deepseek-harness/open-design-dsh-runtime-0.1.0.tgz"
```

| Check | Result |
|---|---|
| Dependency installed into the profile | pass — `@open-design/dsh-runtime` plus `@deepseek-ai/dsh-*` and `commander` in `profiles/open-design/node_modules` |
| Bundle registered | pass — `dsh.profile.bundles` is `["@deepseek-ai/dsh-base","@open-design/dsh-runtime"]` |
| Composed layer | pass — `--dump-config` prints `# == @open-design/dsh-runtime` with the two inserted rows |
| Adapter flags reachable | pass — `--help` lists `--models`, `--probe`, `--stdio` |
| Probe | pass — `{"v":1,"type":"probe","runtime":"open-design","protocol_version":1,"plugin_version":"0.1.0","capabilities":{"session_resume":true,"session_cancel":true,"structured_events":true}}` |
| Model catalog | pass — 15 models across `deepseek-official`, `kimi-coding`, `zai-coding-cn`, read from this machine's provider configuration |
| Stdio handshake | pass — a `hello` frame answered with `{"v":1,"type":"ready",…}`; a malformed frame answered with `protocol_error` / `DSH_PROFILE_INVALID_COMMAND` |
| Probe against the globally installed `dsh` 0.1.1-rc.2 as well | pass — same probe object, so Open Design works with either launcher it detects |

## Launcher note

Two `dsh` executables exist on this machine:

| Launcher | Version | Notes |
|---|---|---|
| `dsh` on PATH (`~/.nvm/.../bin/dsh`) | `0.1.1-rc.2` | globally installed; loads the `open-design` profile and answers the probe |
| `pnpm dsh` in the checkout | `0.1.5-rc.2` (`c291e7961a`) | what the resident web GUI runs from |

Open Design discovers one of them and launches `dsh --profile open-design
--stdio` itself; either answers the probe. The component's own `peerDependencies`
name `@deepseek-ai/dsh-*@0.1.0-rc.6`, which is why the profile installs its own
copy of those packages instead of borrowing the launcher's.

## What is not verified here

- A full design run driven from the Open Design UI. That needs the app's
  "Settings → Models & Providers → Local CLI → rescan" step and a real task, and
  the app performs its own connection test when the DeepSeek Harness card is
  selected.
- Any Open Design plugin from the app's own registry (`plugins/` inside the app
  resources); only the connection component was installed.

## Removing it

```sh
cd /Users/buu99y/workspace/github/agents/deepseek-harness
DSH_HOME="$HOME/.dsh" node --import tsx/esm apps/cli/src/bin.ts plugin \
  --profile open-design remove @open-design/dsh-runtime
```

That leaves every other profile, Session, and credential untouched.
