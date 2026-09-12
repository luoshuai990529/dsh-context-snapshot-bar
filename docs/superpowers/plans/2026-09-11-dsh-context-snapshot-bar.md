# DSH Context Snapshot Bar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 构建无需修改 DSH 核心、可独立安装的双卡片插件，观察已提交的运行时快照、当前对话上下文和最近一次压缩变化。

**Architecture:** 一个独立 npm Profile Bundle 同时提供 Host 和 Client。Host 注册一个自有 Session projection，从完整事件流维护快照、当前 surface 索引和最近一次压缩；Client 通过通用 control stream / useProjection 读取有界视图，在 conversation.input.dock 注册两张卡。摘要替换动画以实际 surfaceOp 提交为准。

**Tech Stack:** TypeScript strict、Node ^22.19.0 || >=24.0.0、Cordis、DSH Session Projection、React 18、Zod 4、esbuild、Vitest、Testing Library、浏览器交互验收。

**Spec:** [已确认设计](../../design/2026-09-11-context-snapshot-bar-spec.md)。本文只安排未来编码；当前交付为计划文档，未完成项全部保持未勾选。

## 执行状态（2026-09-12 更新）

任务 1–5 已在 `/Users/buu99y/workspace/github/agents/dsh-context-snapshot-bar` 实现并取得证据；证据、命令与未执行项见该项目的 `docs/acceptance.md` 与 `docs/compatibility.md`。任务 6 的核对表保留未勾选项。

实现相对本文的两处文件级偏差（职责未变）：

- `src/client/styles.css` 改为 `src/client/styles.ts` 导出字符串常量：独立 esbuild 构建因此不需要 CSS 管线，样式仍由 `apply` 内的 effect 注入一个带 `data-plugin` 标记的 `style` 元素。
- 客户端交互测试集中在 `tests/client.spec.tsx`（折叠、可访问性、复制结果、选中详情、对照与回放、减少动态效果），动画准入表在 `tests/motion.spec.ts`；另有 `tests/replay.spec.ts`、`tests/excerpt.spec.ts`。客户端组件测试用真实 React + jsdom，而不是计划中提到的 Testing Library 之外的额外框架。

**Visual reference:** [Open Design 本地原型与样式](../../design/opendesign/README.md)。实现双卡片前打开其中 HTML，对照已有视觉和动画；不要另起一套设计。

## Global Constraints

- 项目根目录：`/Users/buu99y/workspace/github/agents/dsh-context-snapshot-bar`。
- DSH 核心零修改；不引用 sibling checkout 的源码、monorepo 构建脚本或 workspace:* 依赖作为发布路径。
- 首版：当前轨迹＋最近一次已提交摘要压缩前后对照，不提供历次压缩时间线。
- 原文片段与结构化字段，不增加模型调用；原有 compaction summary 可以摘录。
- 统一快照 producer 固定为 `@deepseek-ai/dsh-system-prompt`；其他注入仍属于轨迹消息。
- Node `^22.19.0 || >=24.0.0`；Host ESM，Client 使用 DSH closure-factory 产物协议。
- Cordis、React 与宿主共享模块不得重复打包；Client 不引用 Host 文件。
- state 必须为普通 JSON；init/apply/wire.view 同步；注册和订阅经 ctx.effect/ctx.on 管理。
- UI 文案使用 zh/en 字典；文本安全渲染，非文本附件仅展示元数据。
- 工程默认值及可配置范围见任务 2；超过显示上限必须标注省略，不截断 Host surface 索引。
- 初始化、重连、会话切换和变化版本跳跃只恢复状态；新提交的连续变化才播放一次。
- 当前开发基线是 `c291e7961a`，不是“npm 0.1.5-rc.2 已兼容”；发布构件验收单独记录。
- 未经额外要求不发布 npm、不改用户常驻 Web profile、不提交或推送 Git。

---

## 任务顺序与停止条件

依次执行 1 → 2 → 3 → 4 → 5 → 6。任务 1 的独立安装包加载验收失败时先修复插件构建或安装配置，不继续堆叠 UI。若现有公开接口确实无法完成接入，记录最小复现及缺失接口，不能悄悄修改 DSH 核心。

任务 3 只增加轨迹算法，保持任务 2 已完成的快照能力；任务 5 验证整体事件恢复和动画。任务 6 的发布构件测试失败不抹去源码基线已通过的结果，也不能宣称可供所有版本复用。

## 文件安排

以下路径均相对插件根目录。

| 文件 | 职责 |
|---|---|
| package.json、pnpm-lock.yaml、cordis.patch.yml | npm 产物、显式版本、Profile 插入行 |
| tsconfig.base.json、tsconfig.host.json、tsconfig.client.json、tsconfig.json | strict 公共选项、Host/Client 编译面、solution references |
| scripts/build.mjs、scripts/check-pack.mjs | 独立构建、factory 包装、产物检查 |
| src/index.ts、src/config.ts | Host 注册、配置校验与缓存指纹 |
| src/shared/types.ts、src/shared/schema.ts | Host/Client 共享 DTO、线上的 Zod schema、投影键类型扩展 |
| src/projection/index.ts、src/projection/snapshot.ts | 投影组合、统一快照识别与状态 |
| src/projection/surface.ts、src/projection/compaction.ts | 当前 surface 顺序、提交替换与最近一次压缩 |
| src/projection/excerpt.ts、src/projection/view.ts | 有界摘录、计数、Client 数据裁剪 |
| src/client/index.ts、src/client/styles.css | 字典、样式生命周期、dock 注册 |
| src/client/SnapshotCard.tsx、src/client/TrajectoryCard.tsx | 两张独立折叠卡片 |
| src/client/ContextTrack.tsx、src/client/NodeDetails.tsx | 紧凑节点条、要点与压缩对照 |
| src/client/motion.ts、src/client/locales.ts | 动画选择、会话/连接重置、双语文案 |
| tests/fixtures/*.json、tests/fixtures/README.md | 有效 Session 事件夹具、生成方式与覆盖内容 |
| tests/build.spec.ts、tests/config.spec.ts | factory 惰性加载及配置输入 |
| tests/snapshot.spec.ts、tests/surface.spec.ts、tests/compaction.spec.ts | 纯投影行为 |
| tests/client.spec.tsx、tests/motion.spec.ts | 组件可访问性、绑定、动画触发 |
| tests/replay.spec.ts、tests/expected/*.json | 完整事件回放的稳定视图快照 |
| tests/host-registration.spec.ts | 真正 Cordis 生命周期及投影服务集成 |
| README.md、docs/compatibility.md、docs/acceptance.md | 使用指南、版本证据、实际验收记录 |

只在任务第一次需要文件时创建它，不先放空壳模块。已有 Open Design HTML 只作为视觉参照，不复制整页壳、演示聊天或播放控制栏进入产品。

## 共享接口

投影键固定为 `contextSnapshotBar`。业务标识沿用 DSH branded SessionSeq、SessionId、ToolCallId；compactionId 沿用压缩包公开类型。以下是本插件 DTO 的确定接口；在 src/shared/types.ts 完整定义，在 schema.ts 对应校验。

```ts
import type { SessionSeq } from '@deepseek-ai/dsh-session/types'
import type { ToolCallId } from '@deepseek-ai/dsh-llm'
export interface ToolCallView {
  callId: ToolCallId
  name: string
  argsExcerpt: string
  truncated: boolean
}
export type NodeKind =
  | 'system' | 'user' | 'injected' | 'assistant' | 'tool-result' | 'summary'

export interface NodeView {
  seq: SessionSeq
  kind: NodeKind
  turn: number | null
  step: number | null
  title: string
  excerpt: string
  truncated: boolean
  sourceName: string | null
  toolCalls: readonly ToolCallView[]
  resultFor: ToolCallView['callId'] | null
}
export interface SectionView {
  name: string
  text: string
  truncated: boolean
}
export interface SnapshotView {
  status: 'none' | 'present' | 'cleared' | 'removed'
  seq: SessionSeq | null
  time: number | null
  sections: readonly SectionView[]
  totalSections: number
  omittedSections: number
}
export interface CompressionView {
  replacementSeq: SessionSeq
  generatedExcerpt: string
  checkpoint: NodeView
  before: readonly NodeView[]
  beforeCount: number
  omittedBeforeCount: number
}
export interface ChangeView {
  kind: 'append' | 'replace' | 'prune'
  seq: SessionSeq
  before: readonly NodeView[]
  after: readonly NodeView[]
  omittedBeforeCount: number
}
export interface BarView {
  schemaVersion: 1
  revision: number
  snapshot: SnapshotView
  nodes: readonly NodeView[]
  totalMessages: number
  omittedMessages: number
  latestCompression: CompressionView | null
  attempt: 'idle' | 'generating' | 'awaiting-replacement'
    | 'completed' | 'failed' | 'interrupted'
  latestChange: ChangeView | null
}
```

ToolCallView 在任务 3 按上面的接口实现；ToolCallId 使用 @deepseek-ai/dsh-llm 的公开类型导出，不在 Client 引入其 Host 实现。schema 用 DSH branded id 构造函数在 wire parse 时恢复品牌；浏览器只导入类型或纯数据模块。

内部 BarState 使用 JSON 数组保存所有 surface 节点。每个索引条目为 `{seq: SessionSeq; message: NodeView | null}`；即使 deriveEventMessage 返回 null，也保留其位置供后续 replacement 查找。BarState 另外持有快照记录、当前 turn/step、工具关联、待提交压缩记录、最近成功对照、attempt、revision 和缓存配置指纹。不保存完整 Session 日志或附件正文。

固定函数入口：
- `resolveConfig(input: unknown): Config`：只在插件载入时解析不可信配置。
- `initialState(config: Config): BarState`：空日志状态。
- `reduceEvent(state: BarState, event: SessionEvent, config: Config): BarState`：已提交事件的纯折叠。
- `toView(state: BarState, config: Config): BarView`：有界展示；不变状态复用返回引用。
- `createProjection(config: Config): ProjectionDefinition<'contextSnapshotBar'>`：schema、缓存版本和上述函数的装配。
- `excerpt(text: string, limit: number): {text: string; truncated: boolean}`。
- `decideMotion(previous: MotionObservation | null, next: MotionObservation, reducedMotion: boolean): ChangeView | null`。

MotionObservation 定义为 `{sessionId: SessionId; connectionEpoch: number; view: BarView}`。连接重置或重新绑定会话时清空 previous；不能单凭数组长度变化推断压缩。

---

## Task 1: 证明独立 Host/Client 安装链路

**Files:** package.json、cordis.patch.yml、四份 tsconfig、scripts/build.mjs、scripts/check-pack.mjs、src/index.ts、src/client/index.ts、tests/build.spec.ts、docs/compatibility.md。

**Consumes:** DSH 已安装构件、公开 Cordis/Session Projection/Client slots 接口。
**Produces:** 可安装的 dsh-context-snapshot-bar-0.1.0.tgz；独立 Host 注册及 Client dock 加载证据。

- [x] 记录实际 dsh 可执行文件、Node 版本、Host 构件路径及 SHA/版本；区分本地构建与 release artifact。开发包名使用 `dsh-context-snapshot-bar`，版本 0.1.0，尚未承诺 npm 名称可用。
- [x] 建立 Host/Client strict 编译面。Host ESM 输出 lib/index.js，Client 输出 lib/client.js，类型分面输出 lib/types。所有 DSH/Cordis 运行依赖声明 peer＋dev，版本来自所选可安装构件，不使用 workspace:*；开发本地链接只用于源码阶段并在兼容表标出。
- [x] 设置 package scripts：`typecheck=tsc -b`、`test=vitest run`、`build=node scripts/build.mjs`、`check:pack=node scripts/check-pack.mjs`。产物 allowlist 只包含 lib、cordis.patch.yml、README 和许可文件。
- [x] 编写 factory 加载测试并确认未构建时失败。将 lib/client.js 放进隔离 JS VM，断言执行文件只注册 factory；调用 factory 后才运行 Client 模块。注入假模块表，未声明的 require 必须失败。
- [x] 实现独立 esbuild 构建：Host platform=node/format=esm；Client platform=browser/format=cjs；CSS 作为文本导入，由 Client apply 内的 effect 创建/释放有命名空间的 style 元素。不要使用仓库内部 tsdown helper。

关键包装必须符合当前 loader：
```js
const banner =
  'window.__ModuleLoader__.load({ id: "dsh-context-snapshot-bar", factory: (require) => {'
  + 'var module = { exports: {} }; var exports = module.exports;'
const footer = 'return module.exports; } });'
```

Client external 仅保留实际引用的共享模块：React、react/jsx-runtime、Cordis、slots/primitives；其余依赖内联或明确声明 dsh.client.external。Host 类型导入不能残留到浏览器。锁定 production define，禁止 Client 依赖 node:*、fs、process.env 动态读取。

manifest 的安装与加载声明：
```json
{
  "name": "dsh-context-snapshot-bar",
  "version": "0.1.0",
  "type": "module",
  "exports": {
    ".": {"types": "./lib/types/host/index.d.ts", "default": "./lib/index.js"},
    "./client": {"types": "./lib/types/client/index.d.ts", "default": "./lib/client.js"}
  },
  "dsh": {
    "bundle": {"patch": "./cordis.patch.yml"},
    "client": {
      "platform": "web",
      "inject": ["@deepseek-ai/dsh-client-locale", "@deepseek-ai/dsh-client-ui-conversation", "@deepseek-ai/dsh-client-ui-session"]
    }
  }
}
```

```yaml
- insert:
    - id: context-snapshot-bar
      name: dsh-context-snapshot-bar
```

- [x] Host 先注册真实空态投影，Client 用相同键显示“尚无记录”；此阶段不把原型样例写成真实状态。验证 Client 工厂懒加载及共享依赖没有重复实例。
- [x] 运行 `pnpm run typecheck && pnpm test -- tests/build.spec.ts && pnpm run build && pnpm run check:pack`，再 `pnpm pack --pack-destination ./artifacts`。
- [x] 按任务 6 的隔离 profile 流程安装 tgz；验证 /plugins 资源、dock 卡片和已提交消息触发的投影更新。缺少浏览器或 Host 任何一半都判定本任务未通过。
- [x] 将版本、构件来源、命令及实际结果写入 docs/compatibility.md。源码 link 测试不能替代此任务的 tgz 验收。

## Task 2: 快照投影、配置和恢复

**Files:** src/config.ts、src/shared/types.ts、src/shared/schema.ts、src/projection/index.ts、snapshot.ts、excerpt.ts、view.ts、tests/config.spec.ts、snapshot.spec.ts、host-registration.spec.ts。

**Consumes:** Task 1 的 Host 注册及投影 transport。
**Produces:** SnapshotView 正确的状态转换；可恢复的 JSON BarState；受校验配置。

- [x] 写配置边界测试：非法负数、非整数、超限值在载入时失败；未提供的字段使用明确 resolve 默认值。有效范围：visibleNodeLimit/comparisonNodeLimit 20–500，excerptChars 40–1000，toolArgsChars 40–500，snapshotPreviewChars 200–8000，snapshotSectionLimit 1–128。
- [x] 在 ConfigSchema 中分别设置默认 120、120、200、160、2000、32；缓存 schema 包含配置指纹字面值，改变配置时旧缓存解析失败并回放历史，不能用旧截断正文继续计算。
- [x] 编写摘录测试：空文本、Unicode、多个文本块、超长单块、无文本附件、截断标志。提取时限制每块读取长度，不能为取 200 字先拼接数 MB 正文。
- [x] 写快照 fixture：空会话；正常2段；同 producer 清除；未知第三方 section；其他 producer snapshot；旧快照被 replacement 移出；相同文本以新 seq 恢复。
- [x] 实现快照识别，正常消息必须同时满足 producer/form/sections，清空必须匹配 producer 与已知清空正文。未知 producer 不覆盖统一快照。最近原始时间和 seq 不随 Client 刷新改变。
- [x] 通过完整 surface 顺序判断最近快照是否仍存在；status=removed 时保留段落摘录，status=cleared 时不保留旧值作为当前值。断线状态由 Client 连接信息叠加，不伪造成 Host 新事件。
- [x] 注册 ProjectionDefinition：key=contextSnapshotBar，stateVersion=1，init/apply、stateSchema、wire.view/viewSchema；声明合并 SessionProjectionStateMap/SessionProjectionMap。与插件无关的事件返回同一个状态引用。
- [x] 编写真实 Cordis 注册测试，使用公开 Context 和 SessionProjectionRegistry：注册、接收事件、释放插件、重新注册及状态重建。断言无重复订阅、释放后不再发布。
- [x] 运行 `pnpm test -- tests/config.spec.ts tests/snapshot.spec.ts tests/host-registration.spec.ts` 与 `pnpm run typecheck`。把快照状态表和 Config 示例写入 README。

核心身份保持测试：
```ts
const before = initialState(config)
expect(reduceEvent(before, ignoredEvent, config)).toBe(before)
```

ignoredEvent 取自 fixtures 普通的已提交 log-only 事件，并在夹具说明中记录其类型；不可用缺字段断言伪造 SessionEvent。

## Task 3: 当前 surface 与最近一次压缩

**Files:** src/projection/surface.ts、compaction.ts、view.ts；补全 shared/types.ts/schema.ts；tests/surface.spec.ts、compaction.spec.ts、fixtures 和 expected 文件。

**Consumes:** Config、BarState、SnapshotView、完整已提交事件。
**Produces:** 当前消息顺序、精确计数、工具关联、latestCompression/attempt/latestChange。

- [x] 首先制作有效 keyless 事件夹具：普通两轮、多工具乱序返回、插件注入、空 system/assistant、摘要压缩、连续压缩、单结果裁剪、替换前失败、替换后失败、轮间压缩、恢复 unmatched start。夹具用 DSH Session 写入/验证 API 生成或核验，不能手写省略字段的日志。
- [x] 用 DSH `foldSurface(events)` 与 `deriveEventMessage(event)` 作测试 oracle，对每个事件前缀比较准确节点集合和数量。运行时只保存轻量索引，不每次重新折叠整份日志。

测试核心：
```ts
const expected = foldSurface(events).nodes.filter(
  seq => deriveEventMessage(events[seq]) !== null,
)
const state = events.reduce((s, e) => reduceEvent(s, e, config), initialState(config))
expect(state.surface.flatMap(n => n.message === null ? [] : [n.seq])).toEqual(expected)
```

- [x] 实现 append/replace 的有序索引。对 replace 用当前数组中的 startSeq/endSeq 位置切片，替换来源核对 sourceEventSeqs；不能用 `seq >= start && seq <= end`。保持 null-message surface 锚点，以支持其后替换。
- [x] 通过 deriveEventMessage 判断是否计为模型消息。分类依据事件和来源；工具调用作为助手附属数据，resultFor 使用 callId。step/turn 从事件或已记录的边界获取，不为轮间压缩捏造用户消息。
- [x] 压缩分两步：summary 存 pending；紧邻 replacement 才提交 latestCompression，保留有界 before 和生成摘要摘录、实际 checkpoint。记录被替换消息总数与展示省略数。后来一次失败不得抹掉最近一次成功对照。
- [x] prune 只更新对应 tool-result 与 latestChange；不更新 latestCompression 为虚假摘要。摘要再次参与压缩按普通 surface replacement 处理。
- [x] compaction/end.error 只更新 attempt，不撤销已提交 surface；session/end-seed 将未闭合的恢复期压缩标为 interrupted。manual turn=null 保持 null。
- [x] revision 只在对外可见变化时递增；latestChange 表示最近可动画的提交，包含其 seq。内部状态变化不伪造模型消息或新的 replacement。
- [x] toView 固定保留系统锚点并展示尾部节点，合计不超过 visibleNodeLimit；若来源跨越被省略节点，显示被替换总量与省略量，不对不可见内容伪造动画。最早普通消息折叠为“另有 N 条”提示。
- [x] 运行 `pnpm test -- tests/surface.spec.ts tests/compaction.spec.ts`；对每个前缀核验 oracle。用 10,000 条短消息和单条 1 MB 工具结果夹具验证 wire 节点/摘录长度上限；记录耗时与 payload 字节，不宣称未经测量的延迟指标。

## Task 4: 快照卡、轨迹卡与动画

**Files:** src/client/index.ts、styles.css、SnapshotCard.tsx、TrajectoryCard.tsx、ContextTrack.tsx、NodeDetails.tsx、motion.ts、locales.ts；tests/client.spec.tsx、motion.spec.ts。

**Consumes:** BarView、Session 标准 useProjection/sessionId、连接重置通知。
**Produces:** 已设计的双卡片，纯展示，不修改 Session 或触发压缩。

- [x] 写组件测试：空态、所有快照状态、未知段落、正常消息配对、摘要要点、截断数量、独立折叠、键盘可操作、Session 切换与连接状态。
- [x] 以真实 locale/slot 注入方式挂载，注册 id=context-snapshot-bar、order=30，不覆盖已有 Todo/Queue/Goal dock。样式以插件根 class 限定范围；使用宿主配色与字体变量。
- [x] 实现 SnapshotCard：默认折叠，显示最近提交时间、段落数量、生效状态；展开后原文片段与来源。复制结果必须核验成功，失败显示失败；截断内容只提供“复制已展示文本”。
- [x] 实现 ContextTrack：紧凑总览、实际消息数量、轮次分组、助手调用与结果关联；节点以 sessionId＋seq 为身份。文本安全渲染，摘要和普通注入分开标识。
- [x] 实现 NodeDetails 和最近一次压缩对照：展示生成摘要要点、实际 replacement 节点、被替换前后节点及省略数。没有成功对照时隐藏回放按钮。
- [x] 写 motion 的先失败测试，再实现以下准入规则。reduce-motion 不影响状态更新；pause/replay 只控制本地动画，不能拦截实时 projection。

```ts
export function decideMotion(
  previous: MotionObservation | null,
  next: MotionObservation,
  reducedMotion: boolean,
): ChangeView | null {
  if (previous === null || reducedMotion) return null
  if (previous.sessionId !== next.sessionId) return null
  if (previous.connectionEpoch !== next.connectionEpoch) return null
  if (next.view.revision !== previous.view.revision + 1) return null
  const change = next.view.latestChange
  if (change === null || change.seq === previous.view.latestChange?.seq) return null
  return change
}
```

- [x] 使用 CSS/Web Animations 实现追加淡入、提交后的旧组收拢、摘要进入、工具结果原位缩短；动画层保留旧节点快照直到结束，但无论动画中途是否取消，数据状态立即以新投影为准。序号跳跃直接落到最终状态。
- [x] 连接 reset 用 ctx.on 管理，将新的 connectionEpoch 注入组件；首次 baseline 即使含最新变化也不播放。新 Session 不沿用上个 Session 的选中节点或回放状态。
- [x] 桌面1280×720及窄屏390×844检查双卡分别/同时展开。轨迹区可滚动，标题和输入框仍可见，页面不横向溢出。产品卡不包含原型的假聊天和演示控制侧栏。
- [x] 运行 `pnpm test -- tests/client.spec.tsx tests/motion.spec.ts`、`pnpm run typecheck`，用浏览器实际播放和切换状态，分别记录自动测试与视觉检查。

## Task 5: 完整回放、恢复和回归验收

**Files:** tests/replay.spec.ts、tests/fixtures/*.json、tests/expected/*.json、docs/acceptance.md。

**Consumes:** 完整插件投影与双卡片。
**Produces:** 可重复的 keyless 回放结果及明确的运行时证据。

- [x] 固化 Task 3 的 fixture，在相同事件集下分别测试一次性完整回放、逐事件 live、缓存恢复后续传，三者最终 BarView 相同。expected 保存完整稳定 DTO，不只断言 snapshot 存在。
- [x] 加入切断点：summary 到 replacement 之间、replacement 到 end 之间、裁剪计量到替换之间，以及两次连续压缩。基线重建必须恢复正确状态，不永久停在“生成中”。
- [x] 检查实际 wire 视图中的条数、每段长度和旧压缩保留范围；新压缩覆盖旧对照，普通工具裁剪不清空成功摘要对照。
- [x] 两个会话交错提交，当前 UI 只跟随选中会话；返回先前会话静态恢复，不能回放另一个会话的压缩。
- [x] 断线保留最后快照及时间；重连后的新 baseline 静态恢复；之后第一次真正的新 replacement 才播放。连续 live 更新即使被 React 合并，也必须状态正确并安全跳过遗漏的动画。
- [x] 卸载插件，断言 projection/locale/style/slot 注册均释放；重新安装后从 Session 事件恢复，不依赖插件进程残留内存。
- [x] 运行 `pnpm test`、`pnpm run typecheck`、`pnpm run build`、`pnpm run check:pack`。此为插件自身完整检查，不运行 DSH 仓库全量测试。
- [x] 在受控测试会话完成一次真实用户消息→工具调用→结果→压缩的演示。只有实际运行成功才标记 real-API 验收；无可用凭据或无法产生真实压缩时保留“未执行”，不得把 keyless 夹具称为真实联调。

## Task 6: 独立打包、版本兼容与使用文档

**Files:** scripts/check-pack.mjs、README.md、docs/compatibility.md、docs/acceptance.md、artifacts/ 产物。

**Consumes:** Task 5 已通过的插件构建。
**Produces:** prebuilt tgz、可复制安装步骤、明确兼容范围、实际验收证据。

- [x] check-pack 检查 package allowlist、所有 exports 文件、patch bundle 声明、Client factory id 和 sourcemap；拒绝 workspace:/link: 生产依赖、绝对源码路径和缺失 Client 文件。
- [x] 从无 sibling checkout 的临时目录安装 tgz，证明包不依赖工作区链接。若当前开发构件未公开发布，应提供其已打包的依赖集合用于源码基线验证并准确标注；这不能替代下一项的公开发布构件测试。
- [x] 使用隔离 DSH_HOME，从 web 模板创建自定义 profile；不手写 profile manifest。示例从插件目录执行，使用事先确认的 dsh 可执行文件：

```sh
pnpm pack --pack-destination ./artifacts
dsh_test_home=$(mktemp -d)
DSH_HOME="$dsh_test_home" dsh --profile context-bar-test --from-default-profile web --dump-config
DSH_HOME="$dsh_test_home" dsh plugin --profile context-bar-test add "$PWD/artifacts/dsh-context-snapshot-bar-0.1.0.tgz"
DSH_HOME="$dsh_test_home" dsh --profile context-bar-test --dump-config
DSH_HOME="$dsh_test_home" dsh --profile context-bar-test
```

启动端口在该测试 profile 的 Web 服务配置中选择已验证空闲端口，不抢占常驻服务；先检查所选版本的 CLI 帮助和模板配置，再写入测试配置。所有 Node 应用启动都经 dsh profile，不运行包 bin、裸 index.js 或自制 SDK argv 入口。

- [x] 验证有效配置出现插件层；Web 的 /plugins 产物被正确 materialize；两卡收到基线和实时更新；重新打开 Session 不依赖先加载全部聊天记录。
- [x] 在测试 profile 执行 `dsh plugin --profile context-bar-test remove dsh-context-snapshot-bar` 并重启该 profile；卡片消失，其他会话功能正常，持久化 Session 数据保持不变。命令仍带同一个 DSH_HOME。
- [x] 查询实际可用的发布构件，锁定精确版本/完整性校验，对该构件重复安装、基线、live、重连、卸载验收。若失败，限制兼容表到已测构件，记录失败接口；不能只凭版本号相同宣称兼容。
- [x] README 包含安装/卸载、Config 完整示例、快照与轨迹数据范围、“实时”的定义、截断提示、无额外模型调用、减少动态效果、已测兼容版本及排障入口。说明“最近记录”不保证仍在模型上下文。
- [x] docs/acceptance.md 按“测试命令 / 源码基线运行 / 发布构件运行 / 浏览器视觉”分栏，附实际日志和截图路径；未执行项明确写未执行。
- [x] 交付源码与 tgz 下载路径。npm 发布、仓库推送、用户常驻 Web profile 安装由后续明确要求触发；不以产物已打包代替公开发布。

---

## 最终验收清单

- [x] DSH 仓库没有为插件功能产生源码改动。
- [x] 独立 tgz 能加载 Host＋Client，浏览器未打入第二份 React/Cordis。
- [x] 快照状态、section 原文片段、时间和来源可追溯；清除和移出不是同一状态。
- [x] surface/message 计数与 DSH oracle 一致；工具调用不重复计数。
- [x] 摘要在实际 replacement 提交后才生效；连续压缩、裁剪、失败均正确。
- [x] 基线/重连/会话切换不自动重播；少看动画不能导致数据状态错误。
- [x] 最近一次压缩对照和长会话截断均如实标注，不伪装完整正文。
- [x] 桌面和窄屏输入框可用，键盘操作、locale 与 reduce-motion 生效。
- [x] keyless 回放、插件测试、构建、产物检查及实际安装证据分别记录。
- [x] 已测构件版本明确；未测发布版本和真实 API 测试没有被标记为通过。

## 执行结果

- 源码、测试、构建与 `artifacts/dsh-context-snapshot-bar-0.1.0.tgz`（sha256 `b183d83bb93373cb392c5281d03726f1c9dbfa9f0e282d63c37ebd0d2e7b0af5`）已交付。
- 实测命令与证据分栏记录在 `docs/acceptance.md`：源码测试命令、独立 tgz 安装、隔离 profile 验收、浏览器实时投影与重连、打包负向检查、线宽测量。
- 兼容范围、接口比对、依赖完整性与未验证项记录在 `docs/compatibility.md`。
- 真实 API 已在隔离 profile 上实测：真实模型轮次（write/read/present 三个工具调用）后执行真实 `/compact`，卡片显示 `Latest compaction · replaced 9` 与模型自己生成的摘要，快照卡正确标为 `Replaced out of context`，回放控件实测可播放。证据见 `docs/acceptance.md` 的 Real API 一节与 `docs/evidence/task5-realapi-*.png`。
- 仍有一处未执行：源码基线（c291e7961a）的安装运行；验收记录中明确标注为未执行，不计为通过。

## 视觉实现更新（2026-09-12）

按用户提供的 Open Design 规范（原件已存入 `docs/design/`，sha256 与交付副本一致）重做两张卡的视觉与 DOM 结构：

- 轨迹卡改到快照卡上方，轨迹默认展开；卡头改为「图标 + 标题 + 紧凑 token 条 + 轮次状态 + 可旋转箭头」。
- 轨迹正文新增顶部 sticky 总览 chip 条（含被替换范围的虚线组）、要点检查面板、按轮次分段的轨迹（消息行 + 助手消息下的工具调用/结果配对）、以及被替换范围的折叠归档行。
- 快照卡改为「卡片状态写在卡头」，正文含说明行、记录元数据、复制按钮与段落（已知段落用中文友好名，未知段落保留原名）。
- 新增设计 token（`--csb-*`）全部声明在插件根节点，宿主页面不受影响；dock 高度受限（`min(556px, 62dvh)`），两卡同开时输入框与两个卡头仍在视口内。
- 空轨迹状态不再渲染总览/检查面板/说明段，改为一行空态提示。
- 数据语义未变：仍只呈现 Host 投影，不引入原型样例数据。

## 自查结果与执行约定

本计划覆盖两个已确认卡片、最新压缩对照、无额外摘要模型、不改 DSH 核心和独立安装复用。共享类型由任务 2/3 定义，任务 4 仅消费这些 DTO；ToolCallId 等宿主类型只从公开包导入。所有 fixture 必须能经 DSH canonical fold 校验，避免测试与错误实现互相印证。

工程配置上限、默认展开方式及动画降级属于可调整实现默认，列在设计文档并接受测试；本计划不再增加新产品分支。执行时先读 spec，再按任务检查框推进。只在有新修改、失败或未解决疑点时重跑相关检查，不为交付重复已经通过且未受影响的测试。
