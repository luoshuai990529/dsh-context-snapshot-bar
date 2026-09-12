# DSH Context Snapshot Bar — visual specification

The supplied DSH reference uses a nearly white workspace with graphite text, hairline gray structure, restrained blue selection states, and a generously spaced, calm editor-like conversation canvas.

```css
:root {
  --bg: oklch(0.982 0.003 250);
  --surface: oklch(1 0 0);
  --fg: oklch(0.255 0.012 260);
  --muted: oklch(0.62 0.012 255);
  --border: oklch(0.89 0.007 255);
  --accent: oklch(0.61 0.17 256);
}
```

- Display: `"SF Pro Display", "PingFang SC", "Noto Sans CJK SC", sans-serif`
- Body: `"PingFang SC", "Microsoft YaHei", "Noto Sans CJK SC", sans-serif`
- Mono: `"SFMono-Regular", "Cascadia Code", "Noto Sans Mono CJK SC", monospace`

Observed rules:

1. The canvas is almost white; panels are separated with fine neutral borders, not heavy shadows.
2. Blue is reserved for current selection, active controls, and a small amount of status feedback.
3. Conversation text has generous breathing room and remains the visual center; surrounding controls are quiet.
4. Rounded corners signal direct manipulation on the composer and compact controls, while navigation remains mostly flat.
5. Metadata is low-contrast and compact, with technical source text revealed only on demand.

## 对话上下文轨迹卡

卡片与运行时快照卡一起挂载在 conversation.input.dock，独立折叠。顶部紧凑轨迹展示当前模型可见消息顺序；点击节点查看内容要点，下方可滚动查看分轮明细。两张卡展开时共同分配可用高度，输入框和卡片标题保持可见。

用户消息、插件注入消息、助手消息、工具结果和压缩摘要分别标识。工具调用附在所属助手消息上；结果返回后作为独立消息加入，不把 tool/call 执行事件重复计入消息数。摘要按替换后的上下文位置展示，不按事件编号排序。

动画时序：
- 新提交消息进入轨迹；工具结果稍后接到对应调用。
- compaction/start 只显示生成摘要中，原消息保留，不显示未经提供的百分比。
- compaction/summary 产生摘要后，仍等待替换消息提交。
- 实际 surfaceOp 替换提交后，精确来源消息组收拢为摘要，最近消息保留；摘要展示要点和替换来源。
- 工具结果裁剪在原位置缩短，不产生摘要节点。
- 未提交替换的压缩失败保留原上下文。若替换已提交后才出现结束错误，以实际 surfaceOp 为准，不能依据错误自行回滚。
- 新运行时快照提交后重新进入轨迹，快照卡恢复当前状态。

首次载入和重连直接展示最终状态；仅新提交事件播放一次动画。尊重减少动态效果设置，手动回放属于原型演示控制。

## 插件数据接入

runtime-context-snapshot 本身不足以构建消息轨迹。Host 侧应注册独立 Session projection，折叠 system/message、user/message、assistant/message、tool/result 及实际 surfaceOp，并关联 compaction/start、compaction/summary、compaction/end、compaction/prune。Client 通过通用 Session control stream 和 useProjection 获取视图。

Web 初始消息窗口是分页数据，不能从当前已加载聊天窗口推断完整模型上下文。Host projection 必须从完整 Session 状态建立顺序，向 Client 提供有界摘要、统计及替换关系；节点截断时明确标记，不能伪装完整轨迹。消息来源、工具 callId、实际 sourceEventSeqs / shadowedSeqs 是关联依据。

本设计依据本地 DSH c291e7961a 的源码核对。当前 HTML 使用样例数据，仅用于交互与布局评审，尚未接入运行中的 DSH。
