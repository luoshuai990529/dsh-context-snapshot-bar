[简体中文](README.md) · [**English**](README.en.md) · [日本語](README.ja.md)

# dsh-context-snapshot-bar

<img src="docs/assets/libersum99.svg" alt="LiberSum99" width="144" height="24"> <a href="https://github.com/topics/dsh-plugin"><img src="docs/assets/dsh-plugin.svg" alt="dsh-plugin" width="100" height="24"></a>

See what DeepSeek Harness currently retains: runtime snapshots, message history in context, and what the latest compaction preserved.

## What it does

- **Context snapshot**: shows the latest recorded rules, source, and timestamp, distinguishing active, cleared, and replaced records.
- **Conversation trajectory**: groups user messages, assistant tool calls, and results by turn, with the latest compaction summary and the messages it replaced.
- **Where to find it**: an entry above the composer opens a right sidebar with tabs for both views.

The plugin reads committed Session events. It does not write to the session log or change DSH's AgentLoop or compaction policy. An optional model-written digest helps explain snapshots; raw records remain available without a configured model route.

## Supported versions

| Component | Version |
| --- | --- |
| DSH with recorded installation and runtime verification | **`0.1.5-rc.2` (Host + Web)** |
| Current plugin version | `0.2.0` |
| Declared Session / Projection peer range | `>=0.1.5-rc.2 <0.2.0-0` |
| Node.js | `^22.19.0 \|\| >=24.0.0` |

The dependency range is not a tested compatibility range. Other DSH versions have not been verified. See the [compatibility record](docs/compatibility.md) for specific artifacts and checks.

## Quick start

Install DSH first; pnpm is needed to build the plugin. Run these commands from the plugin source directory. If you already have a `.tgz` package, skip the first three steps.

```sh
pnpm install
pnpm run build
pnpm run pack
dsh plugin --profile web add ./artifacts/dsh-context-snapshot-bar-0.2.0.tgz
dsh --profile web --dump-config
```

Confirm that the output includes the `dsh-context-snapshot-bar` layer, then **restart the corresponding Web service**:

```sh
dsh --profile web
```

If the service is running, stop the old process first. Open the fresh URL printed by the launcher. In a session, select the snapshot entry above the composer to open the sidebar.

For a custom Web profile, replace `web` with its name. These instructions use a local package and do not assume a public npm release exists.

## Other notes

- **Real-time scope**: updates follow committed events, not individual streamed tokens. The latest snapshot may no longer be in the model's current context.
- **Digest requests**: configuring a model route enables additional requests containing the section text held by the card. See the [configuration and development guide](docs/guide.md) for disabling them and adjusting display limits.
- **Long sessions and motion**: omitted content is counted. The current version shows compaction comparisons; the animation that contracts old message groups is not implemented.
- **Uninstall**: run the command below and restart the service. Session data is retained.

```sh
dsh plugin --profile web remove dsh-context-snapshot-bar
```

[Configuration & troubleshooting](docs/guide.md) · [Compatibility](docs/compatibility.md) · [Acceptance](docs/acceptance.md) · [Changelog](CHANGELOG.md) · [MIT License](LICENSE)
