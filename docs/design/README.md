# Open Design 视觉与交互基准

这里保存本次对话产出的 Open Design 原型原件，供后续 Agent 实现和视觉验收。请沿用此设计，不根据文字计划重新设计卡片。

- [完整交互原型](dsh-context-snapshot-prototype.html)：HTML 内含 CSS、双卡片 DOM 和演示交互脚本，可在浏览器打开；不依赖 Open Design 服务。
- [最新侧栏设计（本次实现依据）](dsh-context-snapshot-prototype-v4.html)：右侧上下文列 + 标签页 + 输入框上方快捷入口；SHA256 `aec0cb0b…`，由产品侧复制归档。
- [消息轨迹与压缩内联设计（v5）](dsh-context-snapshot-prototype-v5.html)：轮次优先轨迹、压缩对照与归档展开；样式生成器读这一份。
- [运行时快照节点设计（v6）](dsh-context-snapshot-prototype-v6.html)：琥珀色快照节点、到达动效与状态标记；由 Codex 本地修改，未在 Studio 同步，其 `.runtime-node*` 样式由 `src/client/host.css.ts` 手工转写（见 [设计说明](runtime-snapshot-node-design.md)）。
- [样式与交互说明](brand-spec.md)：颜色、字体、卡片约束、事件驱动动画说明。
- [运行时快照节点设计说明](runtime-snapshot-node-design.md)：展示、位置、状态与动效约束。
- [产品设计与数据语义](../2026-09-11-context-snapshot-bar-spec.md)：真实数据范围、状态定义与实现限制。
- [实施计划](../../superpowers/plans/2026-09-11-dsh-context-snapshot-bar.md)：工程任务与验收；实施进度以项目验收记录为准。

## 如何沿用

1. 先在浏览器打开 HTML，观察两张卡片的折叠/展开，以及压缩成功、工具裁剪、压缩失败、新快照进入四种演示。
2. HTML 的 style 区保存实际样式。重点查找 `.snapshot-card`、`.trajectory-card`、`.overview-wrap`、`.overview-chip`、`.context-node`、`.tool-pair` 和 `.inspect-panel`，连同 media queries 一起对照。
3. 轨迹脚本含节点总览、检查面板、压缩对照与动画时序。复用视觉和过渡效果，把样例事件换为真实 projection；不要把样例数字和消息写入产品数据。
4. 对照桌面 1280×720 与窄屏 390×844，检查紧凑轨迹、摘要样式、快照状态和双卡展开时输入框可用性。支持 prefers-reduced-motion。
5. 原型中的左侧导航、假聊天、输入框壳和右侧演示面板用于展示环境，不属于插件组件；只抽取两卡及其内部内容，并将 CSS 限定到插件根节点。

原型是视觉基准；数据正确性以产品设计文档和实际 Session 事件为准。例如截断提示、长会话省略和失败状态需要按真实数据实现，不能照抄原型的简化样例逻辑。

## 来源与当前实现

Open Design 项目为 `dsh-context-snapshot-bar-f11e`。本目录在交接补充时从项目原件逐字节复制，并核对 SHA256；原件保存于当前用户 Library/Application Support/Open Design 下。在线 Studio 入口保留在产品设计文档，仅为可选入口。

复制时目标项目已经存在 `src/client/styles.ts`、`SnapshotCard.tsx`、`TrajectoryCard.tsx` 和 `CollapsibleCard.tsx`。这些实现未在本次复制中修改，也未在本轮被评定为已经与原型一致；接手者应对照此目录检查。
