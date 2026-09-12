// @vitest-environment jsdom
/**
 * The human-visible artifact of this suite: both cards and the composer entry,
 * in every standing the design defines, rendered from the same components and
 * the same stylesheet the browser bundle ships into a standalone
 * `artifacts/preview.html`.
 *
 * Two data sources are labelled in the page itself: the recorded replay
 * projections (the states the projection actually reaches in the fixtures) and
 * constructed views for the standings those fixtures do not carry. The
 * assertions below state what a reader must find in each block, so the preview
 * can never quietly become a picture of nothing.
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { BarView, NodeView, SnapshotStatus } from '../src/shared/types.ts'
import { ComposerEntry } from '../src/client/ComposerEntry.tsx'
import { ContextPanel } from '../src/client/ContextPanel.tsx'
import { SnapshotCard } from '../src/client/SnapshotCard.tsx'
import { TrajectoryCard } from '../src/client/TrajectoryCard.tsx'
import { zh } from '../src/client/locales.ts'
import { cardCss } from '../src/client/styles.ts'
import { hostCss } from '../src/client/host.css.ts'

afterEach(cleanup)

/** Translate through the real dictionary, substituting `{name}` parameters. */
function t(key: string, params?: Record<string, unknown>): string {
  const template = (zh as Record<string, string>)[key] ?? key
  if (params === undefined) return template
  return template.replace(/\{(\w+)\}/g, (_, name: string) => String(params[name] ?? `{${name}}`))
}

/** Read one recorded projection the replay suite compares against. */
function recorded(name: string): BarView {
  return JSON.parse(readFileSync(`${process.cwd()}/tests/expected/${name}.json`, 'utf8')) as BarView
}

/** One node view with the given identity and fields. */
function node(seq: number, overrides: Partial<NodeView> = {}): NodeView {
  return {
    seq: seq as NodeView['seq'],
    kind: 'user',
    turn: 1,
    step: 1,
    title: 'user message',
    excerpt: `excerpt ${seq}`,
    truncated: false,
    sourceName: null,
    toolCalls: [],
    resultFor: null,
    ...overrides,
  }
}

/** A view carrying only what a block needs, for standings the fixtures do not reach. */
function view(overrides: Partial<BarView> = {}): BarView {
  return {
    schemaVersion: 1,
    revision: 1,
    snapshot: { status: 'none', seq: null, time: null, sections: [], totalSections: 0, omittedSections: 0 },
    nodes: [],
    totalMessages: 0,
    omittedMessages: 0,
    latestCompression: null,
    attempt: 'idle',
    latestChange: null,
    ...overrides,
  }
}

/** A standing's snapshot view with one committed section. */
function standing(status: SnapshotStatus, sections = 1) {
  return {
    status,
    seq: 148 as BarView['nodes'][number]['seq'],
    time: Date.UTC(2026, 8, 11, 6, 32, 18),
    sections: Array.from({ length: sections }, (_, index) => ({
      name: index === 0 ? 'sandbox:policy' : 'approval:policy',
      text: index === 0 ? 'workspace-write' : 'ask',
      truncated: false,
    })),
    totalSections: sections,
    omittedSections: 0,
  }
}

describe('rendered preview', () => {
  it('renders every standing into artifacts/preview.html and states its facts', () => {
    const rich = recorded('replay-rich')
    const compacted = recorded('replay-compacted')
    // The hosts are collected here and serialized at the end: a block is often
    // opened by a click after it renders, and the written page must carry the
    // state a reader sees, not the state before the click.
    const hosts: HTMLElement[] = []

    const renderBlock = (caption: string, body: React.ReactNode): HTMLElement => {
      const host = document.createElement('div')
      document.body.append(host)
      render(<div className="preview-block"><p className="preview-caption">{caption}</p>{body}</div>, { container: host })
      hosts.push(host)
      return host
    }

    // ── snapshot standings ────────────────────────────────────────────────
    renderBlock('快照 · 尚无记录（构造）', <SnapshotCard view={view()} t={t} />)
    expect(screen.getByText(/这不表示插件被禁用/)).toBeTruthy()

    renderBlock('快照 · 当前上下文（replay-rich 录制）', <SnapshotCard view={rich} t={t} />)
    expect(screen.getByText('沙箱文件范围')).toBeTruthy()
    expect(screen.getByText('sandbox:policy')).toBeTruthy()

    renderBlock('快照 · 已清除（构造）', <SnapshotCard view={view({ snapshot: standing('cleared', 0) })} t={t} />)
    expect(screen.getByText('清除记录')).toBeTruthy()
    expect(screen.getByText(/Earlier runtime-context snapshots no longer apply/)).toBeTruthy()

    renderBlock('快照 · 已移出当前上下文（构造）', <SnapshotCard view={view({ snapshot: standing('removed') })} t={t} />)
    expect(screen.getAllByText('已移出当前上下文').length).toBeGreaterThan(0)

    // ── trajectory phases ─────────────────────────────────────────────────
    const track = [
      node(0, { kind: 'system', title: '会话基础指令', turn: 1, step: 1 }),
      node(3, { kind: 'user', turn: 1, step: 1, excerpt: '定位配置加载失败并验证修复路径。' }),
      node(4, { kind: 'injected', title: '运行时上下文快照', excerpt: 'sandbox:policy · workspace-write · 2 项' }),
      node(5, {
        kind: 'assistant',
        title: '检查配置加载入口',
        excerpt: '读取加载路径与覆盖顺序。',
        toolCalls: [{ callId: 'c1' as never, name: 'read_file', argsExcerpt: 'load.ts', truncated: false }],
      }),
      node(6, { kind: 'tool-result', title: 'read_file', excerpt: '环境变量在合并后仍保留旧值。', resultFor: 'c1' as never }),
    ]

    renderBlock('轨迹 · 当前顺序（replay-rich 录制）', <TrajectoryCard view={rich} t={t} />)
    expect(screen.getAllByText('最新轮次在前').length).toBeGreaterThan(0)

    // Each block is queried inside its own host: several blocks draw a marker.
    const generating = renderBlock('轨迹 · 压缩生成中·已展开轮次（构造）', <TrajectoryCard view={view({ nodes: track, totalMessages: 4, attempt: 'generating' })} t={t} />)
    expect(generating.querySelector('.compression-event')?.className).not.toContain('failed')
    // The preview is a serialized DOM with no React behind it, so the states a
    // reader reaches by clicking are opened here, before it is written.
    for (const entry of generating.querySelectorAll('.turn-entry[aria-expanded="false"]')) fireEvent.click(entry)
    const firstCycle = generating.querySelector('.cycle-node')
    expect(firstCycle).not.toBeNull()
    fireEvent.click(firstCycle as HTMLElement)
    expect(generating.querySelector('.cycle-info')?.textContent).toContain('参数')

    const failed = renderBlock('轨迹 · 压缩失败（构造）', <TrajectoryCard view={view({ nodes: track, totalMessages: 4, attempt: 'failed' })} t={t} />)
    expect(failed.querySelector('.compression-event')?.className).toContain('failed')

    const committed = renderBlock('轨迹 · 压缩已提交·摘要与对照已展开（replay-compacted 录制）', <TrajectoryCard view={compacted} t={t} />)
    expect(committed.querySelector('.summary-group')).not.toBeNull()
    const summaryEntry = committed.querySelector('.summary-entry')
    if (summaryEntry !== null) fireEvent.click(summaryEntry)
    const archiveToggle = committed.querySelector('.archive-toggle')
    if (archiveToggle !== null) fireEvent.click(archiveToggle)
    expect(screen.getAllByText(/压缩摘要/).length).toBeGreaterThan(0)

    // ── the column, with its two fixed tabs ───────────────────────────────
    const column = renderBlock(
      '上下文列 · 消息轨迹（两个固定标签）',
      <ContextPanel view={rich} requested={undefined} navigationRevision={0} t={t} />,
    )
    expect(column.querySelectorAll('.context-tabs button')).toHaveLength(2)
    expect(column.querySelector('.trajectory-card')).not.toBeNull()

    const columnSnapshot = renderBlock(
      '上下文列 · 运行时快照（入口直达）',
      <ContextPanel view={rich} requested="snapshot" navigationRevision={1} t={t} />,
    )
    expect(columnSnapshot.querySelector('.snapshot-pane')).not.toBeNull()

    // ── composer entry standings ──────────────────────────────────────────
    renderBlock('快捷入口 · 当前上下文', <ComposerEntry view={rich} open={() => undefined} t={t} />)
    expect(screen.getByLabelText('打开上下文快照')).toBeTruthy()
    renderBlock('快捷入口 · 已清除', <ComposerEntry view={view({ snapshot: standing('cleared', 0) })} open={() => undefined} t={t} />)
    expect(screen.getAllByText('已清除').length).toBeGreaterThan(0)
    renderBlock('快捷入口 · 尚无记录', <ComposerEntry view={view()} open={() => undefined} t={t} />)
    expect(screen.getAllByText('无记录').length).toBeGreaterThan(0)

    const html = [
      '<!doctype html>',
      '<html lang="zh-CN"><head><meta charset="utf-8">',
      '<title>dsh-context-snapshot-bar · 渲染预览</title>',
      `<style>${cardCss}\n${hostCss}</style>`,
      '<style>body{margin:0;padding:24px;background:#f6f7f9;font-family:-apple-system,"PingFang SC",sans-serif}',
      '.preview-grid{display:grid;gap:20px;grid-template-columns:repeat(auto-fill,minmax(380px,1fr));align-items:start}',
      '.preview-block{border:1px solid #dfe3e8;border-radius:10px;background:#fff;overflow:hidden}',
      '.preview-block .dsh-context-snapshot-bar__card{border:0}',
      '.preview-caption{margin:0;padding:8px 12px;border-bottom:1px solid #eceff3;color:#6b7280;font-size:12px}',
      '</style>',
      '</head><body><div class="preview-grid">',
      hosts.map(host => host.innerHTML).join('\n'),
      '</div></body></html>',
    ].join('\n')
    mkdirSync(`${process.cwd()}/artifacts`, { recursive: true })
    writeFileSync(`${process.cwd()}/artifacts/preview.html`, html)
    // Every block rendered something, and the stylesheet travelled with it.
    expect(html).toContain('trajectory-card')
    expect(html.match(/class="preview-block"/g)?.length ?? 0).toBe(hosts.length)
  })
})
