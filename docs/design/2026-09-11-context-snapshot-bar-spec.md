# DeepSeek Harness 状态栏插件设计

状态：用户已确认首版范围；本文是实施计划的产品依据。确认日期：2026-09-11。

## 已确认决策

- 插件独立放在 `/Users/buu99y/workspace/github/agents/dsh-context-snapshot-bar`，不修改 DeepSeek Harness 源码、AgentLoop、压缩策略或主页面。
- 一个 npm Profile Bundle 提供 Host 数据投影和 Web Client 两张卡片，挂载 `conversation.input.dock`。
- 快照卡只观察 `@deepseek-ai/dsh-system-prompt` 产生的统一 runtime-context snapshot；不混入模型、Token、Jobs、Plan 指标。
- 轨迹卡展示当前 Session 保留的消息与最近一次已提交的摘要压缩前后对照；不提供历次压缩时间线。连续压缩仍须正确识别“旧摘要＋新消息→新摘要”。
- 节点要点取自原消息文本片段、工具名与结构化字段；不额外调用模型。DSH 本身产生的压缩摘要可以直接摘录。
- 两张卡可分别折叠；默认快照卡折叠、轨迹卡展开。点击节点查看要点。保留输入框空间，窄屏无横向页面溢出。
- 实时以已提交事件到达为准，不承诺流式逐 Token 更新或配置修改立即产生快照。
- 本轮只输出计划文档；编码、真实服务接入、npm 发布分别记录其实际完成状态。

## 快照语义

正常记录为 `user/message`，`data.source.kind=plugin`、`source.plugin=@deepseek-ai/dsh-system-prompt`、`source.form=snapshot`、`source.sections=[{name,text}]`。段落只有名称和原文，不存在可直接读取的结构化 policy mode。内置段落为 `sandbox:policy`、`approval:policy`、`subagent:delegation`；未知第三方段落按原名称和文本展示，不丢弃。

后续清空由同 producer 的无 form/sections 消息表示，正文为 `Current runtime context: none. Earlier runtime-context snapshots no longer apply.`。初次为空不一定有记录；“尚无记录”不等于禁用。最新记录被替换后保留用于追溯，另标“已移出当前上下文”。断线保留最后已知值及原始时间，不制造新更新时间。其他 producer 的 time-context、tmux-context 不归入此卡，但仍可作为轨迹中的插件注入消息。

## 轨迹与动画语义

以 Session 当前 surface 顺序与 `deriveEventMessage()` 的消息派生规则为准，不以已加载聊天窗口或事件编号数值排序代替。该视图描述 Session 保留的对话消息，不宣称覆盖 provider 最终 HTTP 请求中的所有包装、工具定义或传输转换。

消息分类包括系统、用户、插件注入、助手、工具结果和压缩摘要。`tool/call` 作为助手消息的调用关联信息，不重复计为模型消息；工具结果虽然内部 role 为 user，也不能归类为人类输入。空 system/assistant 消息和 assistant/attempt 不计入消息数。多工具并行通过 callId 关联，结果顺序遵循实际提交顺序。

`compaction/start` 只显示不确定进度，不能提前猜测替换范围、触发原因或百分比。`compaction/summary` 提供摘要与精确来源；实际 replacement 消息提交后才播放收拢动画。摘要显示实际产生的文本片段及替换数量。模型收到的摘要正文以 replacement 消息为准，不能把 summary 日志再计为一个模型消息。

工具结果裁剪在原位置更新，不制造摘要。最近一次失败尝试与最近一次成功压缩对照分别存储；未提交替换的失败保留原消息，已提交替换后出现结束错误也不能回滚 UI。历史 unmatched start 在恢复结束时不能永久显示运行中。

首次载入、切换会话、重连和压缩版本跳跃时直接显示最终布局；仅连续的新提交变化自动播放一次。最近一次成功压缩可手动回放。减少动态效果设置下保留状态更新，取消位移与收拢动效。

## 规模与内容

Host 保留当前 surface 的完整顺序索引及准确计数；节点正文仅保存有界摘录。Client 接收最近节点、系统锚点和最近一次压缩的有界展示数据；明确标注已展示/总数及省略数量。首版不提供无限展开全部正文、跨会话检索或额外分页接口。

工程默认值：`visibleNodeLimit=120`、`excerptChars=200`、`toolArgsChars=160`、`comparisonNodeLimit=120`、`snapshotPreviewChars=2000`、`snapshotSectionLimit=32`。这些值由插件 Config 校验，可通过 cordis.patch.yml 调整；截断不改变总数、来源关系和实际生效状态。快照原文超过上限时显示截断标识，只能复制已展示文本，不冒充“复制完整原文”。Config 固定于本次 Host 启动；更改后重启并以配置指纹隔离投影缓存。

原文是已有会话内容，按文本渲染，不执行 HTML；图片、文件、音频仅展示类型/名称，不读取附件正文，不主动外发。基于配置的摘录会带入已有消息中的敏感信息，因此不增加独立分析上报、后台模型摘要或浏览器日志正文输出。

## 交付与兼容性

开发依据为本地 `c291e7961a`，git describe 为 `dsh-v0.1.5-rc.2-139-gc291e7961a`。package.json 的 0.1.5-rc.2 不能证明与同名已发布构件一致。

交付包括源码、测试、prebuilt tgz、安装/配置/卸载说明及兼容验证表。先对当前构件验收，再选择实际可安装的发布构件执行相同测试；未测版本不宣称兼容。npm 命名可用性和发布操作不在本轮计划交付中。

## 设计与源码依据

- [Open Design 本地视觉基准](opendesign/README.md)：完整 HTML/CSS/交互与样式说明已归档在项目内，后续实现沿用此设计；无需依赖在线预览。
- [Open Design 原型](http://127.0.0.1:57905/projects/dsh-context-snapshot-bar-f11e/conversations/b49d2309-15ad-4dbe-bbfc-13cb0f7296ca/files/dsh-context-snapshot-prototype.html)：样例交互参考，不作为真实数据。
- `packages/core/agent-loop/src/runtime-context.ts`：快照 producer、清空及替换后恢复。
- `packages/core/session/src/surface.ts`：deriveEventMessage、foldSurface 与当前上下文顺序。
- `packages/compaction/compaction/src/types.ts`：压缩事件、shadowedSeqs 和 replacement 时序。
- `packages/session/session-projection/src/index.ts`：纯投影、历史恢复及通用变化通知。
- `packages/api/session-controller/src/control.ts`：全局投影基线和增量推送。
- `packages/client/ui-session/src/client/index.ts`：useProjection 标准属性。
- `packages/client/ui-goal/src/client/index.ts`：输入框上方插槽注册示例。
- `packages/client/modules/README.md`、`packages/client/tsdown.client.ts`、`packages/client/web/src/platform.ts`：Client 产物协议与共享依赖。
- `docs/user/develop/basic/publish.md`：Profile Bundle 的安装和卸载。

以上源码路径相对 `/Users/buu99y/workspace/github/agents/deepseek-harness`，仅作为阅读依据，插件的运行和构建不得引用这些绝对路径。
