[**简体中文**](README.md) · [English](README.en.md) · [日本語](README.ja.md)

# dsh-context-snapshot-bar

<img src="docs/assets/libersum99.svg" alt="LiberSum99" width="144" height="24"> <a href="https://github.com/topics/dsh-plugin"><img src="docs/assets/dsh-plugin.svg" alt="dsh-plugin" width="100" height="24"></a>

让 DeepSeek Harness 的当前上下文看得见：查看运行时快照、消息轨迹，以及最近一次压缩保留了什么。

## 插件作用

- **上下文快照**：展示最新记录的规则、来源和时间，区分仍在上下文、已清除和已被替换。
- **对话轨迹**：按轮次查看用户消息、助手工具调用与结果，并对照最近一次压缩摘要及其替换的消息。
- **接入位置**：输入框上方提供入口，右侧上下文栏通过标签切换两种视图。

插件读取已提交的 Session 事件，不写入会话日志，不修改 DSH 的 AgentLoop 或压缩策略。快照可选用模型生成辅助摘要；未配置模型路由时仍可查看原始记录。

## 支持版本

| 项目 | 版本 |
| --- | --- |
| 已有安装与运行验证的 DSH | **`0.1.5-rc.2`（Host + Web）** |
| 插件当前版本 | `0.2.0` |
| Session / Projection 依赖声明范围 | `>=0.1.5-rc.2 <0.2.0-0` |
| Node.js | `^22.19.0 \|\| >=24.0.0` |

依赖范围不等于已验证范围，其他 DSH 版本尚未完成兼容验证。具体构件和检查记录见[兼容说明](docs/compatibility.md)。

## 快速安装

已安装 DSH 后，可直接从 [npm](https://www.npmjs.com/package/dsh-context-snapshot-bar) 安装，无需下载源码或手动构建：

```sh
dsh plugin --profile web add dsh-context-snapshot-bar@0.2.0
dsh --profile web --dump-config
```

确认输出包含 `dsh-context-snapshot-bar` 配置层后，**重启对应 Web 服务**：

```sh
dsh --profile web
```

若该服务正在运行，先停止旧进程再启动；使用启动器新输出的地址打开 Web。进入会话后，点击输入框上方的快照入口打开右侧栏。

使用自定义 Web profile 时，将命令中的 `web` 替换为实际名称。需要修改或从源码构建时，参见[开发指南](docs/guide.md#development)。

## 其他说明

- **实时范围**：提交事件后更新，不是逐 Token 流式显示；最新快照也可能已离开当前模型上下文。
- **摘要调用**：配置模型路由后会产生额外请求，发送卡片持有的段落文本。关闭方式及显示上限见[配置与开发指南](docs/guide.md)。
- **长会话与动画**：超出上限时标注省略数量；当前版本展示压缩对照，尚未实现旧消息组收拢动画。
- **卸载**：执行下面命令并重启对应服务，会话数据保留。

```sh
dsh plugin --profile web remove dsh-context-snapshot-bar
```

[配置与排障](docs/guide.md) · [兼容记录](docs/compatibility.md) · [验收记录](docs/acceptance.md) · [变更记录](CHANGELOG.md) · [MIT License](LICENSE)
