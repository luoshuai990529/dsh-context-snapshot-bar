// @vitest-environment jsdom
/**
 * The two cards in a DOM, against the prototype's own structure: the trajectory
 * card's toggle and strip, its turn segments with one node per message and tool
 * pairs hanging off their assistant node, the attempt marker, the compaction
 * comparison, the inspector dropped after the selected element, the arrival mark
 * that plays once, and the snapshot pane's four standings.
 */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { BarView, NodeView, SnapshotStatus } from '../src/shared/types.ts'
import { ComposerEntry, entrySummary } from '../src/client/ComposerEntry.tsx'
import { ContextPanel } from '../src/client/ContextPanel.tsx'
import { SnapshotCard } from '../src/client/SnapshotCard.tsx'
import { TrajectoryCard } from '../src/client/TrajectoryCard.tsx'
import { zh } from '../src/client/locales.ts'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

/** Translate through the real dictionary, substituting `{name}` parameters. */
function t(key: string, params?: Record<string, unknown>): string {
  const template = (zh as Record<string, string>)[key] ?? key
  if (params === undefined) return template
  return template.replace(/\{(\w+)\}/g, (_, name: string) => String(params[name] ?? `{${name}}`))
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

/** An empty projection value. */
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

/** A standing's snapshot value with committed sections. */
function snapshot(status: SnapshotStatus, sections = 2) {
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

const CALL = {
  callId: 'call-1' as NodeView['toolCalls'][number]['callId'],
  name: 'read_file',
  argsExcerpt: 'load.ts',
  truncated: false,
}

describe('SnapshotCard digest', () => {
  const SECTIONS = [
    { name: 'sandbox:policy', text: 'DSH file policy: workspace-write', truncated: false },
    { name: 'approval:policy', text: 'approval prompts are asked', truncated: false },
  ]
  const recorded = view({ snapshot: { ...snapshot('present', 2), sections: SECTIONS } })

  it('separates the model digest from the raw record it describes', () => {
    render(<SnapshotCard
      view={recorded}
      t={t}
      summary={{ status: 'ready', text: '沙箱允许写入工作区，审批会询问。', model: 'deepseek-official/deepseek-chat' }}
    />)
    const blocks = [...document.querySelectorAll('.snapshot-digest, .snapshot-raw')]
    expect(blocks.map(element => element.className)).toEqual(['snapshot-digest', 'snapshot-raw'])
    expect(document.querySelector('.snapshot-digest')?.textContent).toContain('内容摘要 · 由模型生成')
    expect(document.querySelector('.snapshot-digest')?.textContent).toContain('沙箱允许写入工作区')
    expect(document.querySelector('.snapshot-digest')?.textContent).toContain('deepseek-official/deepseek-chat')
    // The raw record keeps its own caption and the section text unchanged.
    expect(document.querySelector('.snapshot-raw')?.textContent).toContain('原始记录 · DSH 内部状态原文')
    expect(document.querySelector('.snapshot-raw')?.textContent).toContain('DSH file policy: workspace-write')
  })

  it('draws the digest states without disturbing the raw record', () => {
    const { unmount } = render(<SnapshotCard view={recorded} t={t} summary={{ status: 'loading' }} />)
    expect(document.querySelector('.snapshot-digest')?.textContent).toContain('正在生成摘要')
    expect(document.querySelector('.snapshot-raw')?.textContent).toContain('approval prompts are asked')
    unmount()

    render(<SnapshotCard view={recorded} t={t} summary={{ status: 'unavailable', reason: 'unconfigured' }} />)
    expect(document.querySelector('.snapshot-digest')?.textContent).toContain('未配置摘要模型')
    expect(document.querySelector('.snapshot-raw')?.textContent).toContain('DSH file policy: workspace-write')
  })

  it('omits the digest when no channel answered', () => {
    render(<SnapshotCard view={recorded} t={t} summary={{ status: 'idle' }} />)
    expect(document.querySelector('.snapshot-digest')).toBeNull()
    expect(document.querySelector('.snapshot-raw')).not.toBeNull()
  })
})

describe('TrajectoryCard', () => {
  /** Two turns plus the standing anchors the projection keeps outside a turn. */
  const NODES = [
    node(0, { kind: 'system', title: 'session prompt', turn: null, step: null, excerpt: 'you are a coding agent' }),
    node(4, { kind: 'injected', title: 'runtime snapshot', turn: null, step: null, excerpt: 'sandbox:policy · workspace-write' }),
    node(10, { kind: 'user', turn: 1, excerpt: 'fix the loader' }),
    node(11, { kind: 'assistant', turn: 1, excerpt: 'reading the loader', toolCalls: [CALL] }),
    node(12, { kind: 'tool-result', turn: 1, excerpt: 'committed output', resultFor: CALL.callId }),
    node(13, { kind: 'assistant', turn: 1, excerpt: 'the loader is shadowed' }),
    node(20, { kind: 'user', turn: 2, excerpt: 'verify the fix' }),
  ]

  it('draws the prototype shell and the round list, newest turn first', () => {
    render(<TrajectoryCard view={view({ nodes: NODES, totalMessages: 7 })} t={t} />)
    expect(screen.getByText('对话上下文轨迹')).toBeTruthy()
    const strip = [...document.querySelectorAll('.trajectory-strip .strip-token')].map(item => item.textContent)
    expect(strip).toEqual(['系统', '注入', '人类', '助手·工具'])
    expect(screen.getByText('第 2 → 1 轮')).toBeTruthy()
    expect(screen.getByText('最新轮次在前')).toBeTruthy()
    expect(screen.getByText('点击轮次展开')).toBeTruthy()
    // One card per turn, the newest first, and the anchors as leaves.
    const cards = [...document.querySelectorAll('.turn-card .turn-entry .turn-question')].map(item => item.textContent)
    expect(cards[0]).toContain('verify the fix')
    expect(cards[1]).toContain('fix the loader')
    expect(document.querySelector('.system-anchor')?.textContent).toContain('you are a coding agent')
    expect(screen.getByText(/轮次倒序仅用于浏览/)).toBeTruthy()
  })

  it('lists the turns newest first, all the way down', () => {
    const many = [
      node(10, { kind: 'user', turn: 1, excerpt: 'first question' }),
      node(20, { kind: 'user', turn: 2, excerpt: 'second question' }),
      node(30, { kind: 'user', turn: 3, excerpt: 'third question' }),
    ]
    render(<TrajectoryCard view={view({ nodes: many, totalMessages: 3 })} t={t} />)
    const questions = [...document.querySelectorAll('.turn-entry .turn-question')]
      .map(entry => entry.textContent)
    expect(questions[0]).toContain('third question')
    expect(questions[1]).toContain('second question')
    expect(questions[2]).toContain('first question')
    expect(screen.getByText('第 3 → 1 轮')).toBeTruthy()
  })

  it('keeps the session prompt out of the turns and reads it as an anchor', () => {
    const nodes = [
      // The loop stamps a system message with the boundary it was rendered in.
      node(0, { kind: 'system', title: 'session prompt', turn: 1, step: 1, excerpt: 'you are a coding agent' }),
      node(5, { kind: 'user', turn: 1, excerpt: 'the real question' }),
    ]
    render(<TrajectoryCard view={view({ nodes, totalMessages: 2 })} t={t} />)
    expect(document.querySelectorAll('.turn-card')).toHaveLength(1)
    expect(document.querySelector('.turn-question')?.textContent).toContain('the real question')
    expect(document.querySelector('.system-anchor')?.textContent).toContain('you are a coding agent')
  })

  it('keeps injected context as lines inside its turn', () => {
    const injected = [
      node(40, { kind: 'user', turn: 4, excerpt: 'the real question' }),
      node(41, { kind: 'injected', turn: 4, title: 'runtime snapshot', excerpt: 'sandbox:policy', sourceName: '@deepseek-ai/dsh-system-prompt' }),
    ]
    render(<TrajectoryCard view={view({ nodes: injected, totalMessages: 2 })} t={t} />)
    expect(document.querySelector('.turn-question')?.textContent).toContain('the real question')
    fireEvent.click(document.querySelector('.turn-entry') as HTMLElement)
    expect(document.querySelector('.turn-cycles')?.textContent).toContain('sandbox:policy')
  })

  it('opens a turn into its cycles, and a cycle into the call and its pairing', () => {
    render(<TrajectoryCard view={view({ nodes: NODES, totalMessages: 7 })} t={t} />)
    const older = [...document.querySelectorAll('.turn-entry')][1] as HTMLElement
    expect(older.getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(older)
    expect(older.closest('.turn-card')?.querySelectorAll('.cycle-node')).toHaveLength(1)
    expect(document.querySelector('.final-leaf')?.textContent).toContain('the loader is shadowed')

    const cycle = document.querySelector('.cycle-node') as HTMLElement
    expect(cycle.textContent).toContain('助手调用 · read_file')
    expect(cycle.textContent).toContain('committed output')
    fireEvent.click(cycle)
    const info = document.querySelector('.cycle-info')
    expect(info?.textContent).toContain('参数 · load.ts')
    expect(info?.textContent).toContain('助手 #11 → 工具结果 #12')
    expect(info?.textContent).toContain('工具结果 · 成功')
  })

  it('records the attempt as one inline marker in the round list', () => {
    const { rerender } = render(<TrajectoryCard view={view({ nodes: NODES, totalMessages: 7, attempt: 'generating' })} t={t} />)
    const marker = document.querySelector('.compression-event')
    expect(marker?.textContent).toContain('压缩触发 · 过程记录，不计入模型消息')
    expect(marker?.className).not.toContain('failed')
    rerender(<TrajectoryCard view={view({ nodes: NODES, totalMessages: 7, attempt: 'failed' })} t={t} />)
    expect(document.querySelector('.compression-event')?.className).toContain('failed')
  })

  it('draws a committed compaction where the replacement landed, not at the top', () => {
    // The compression is a point in the timeline: turns newer than it stay above,
    // the turns it stands for stay below, and a recorded replacement is not also
    // announced by the attempt marker at the newest end.
    // The replacement committed during turn 2, so turn 2 keeps the messages that
    // followed it: turns 3 and 4 above the compression, turn 2 below.
    const nodes = [
      node(22, { kind: 'user', turn: 2, excerpt: 'second question' }),
      node(20, { kind: 'user', turn: 3, excerpt: 'third question' }),
      node(21, { kind: 'assistant', turn: 3, excerpt: 'third answer' }),
      node(30, { kind: 'user', turn: 4, excerpt: 'fourth question' }),
      node(31, { kind: 'assistant', turn: 4, excerpt: 'fourth answer' }),
    ]
    render(<TrajectoryCard view={view({
      nodes,
      totalMessages: 6,
      attempt: 'completed',
      latestCompression: {
        replacementSeq: 25 as BarView['nodes'][number]['seq'],
        generatedExcerpt: 'the first two messages, summarized',
        checkpoint: node(25, { kind: 'summary', turn: 2, excerpt: 'condensed' }),
        before: [node(10, { kind: 'user', turn: 1 }), node(11, { kind: 'assistant', turn: 1 })],
        beforeCount: 2,
        omittedBeforeCount: 0,
        beforeFirstTurn: 1,
        beforeLastTurn: 1,
      },
    })} t={t} />)
    const order = [...document.querySelectorAll('.round-list > *')].map((element) => {
      if (element.classList.contains('summary-group')) return 'compaction'
      return element.querySelector('.turn-question')?.textContent ?? element.className
    })
    // Fourth and third turns are newer than the replacement; the turn it committed
    // in follows it, and the turns it replaced stay inside the compression.
    expect(order).toHaveLength(4)
    expect(order[0]).toContain('fourth question')
    expect(order[1]).toContain('third question')
    expect(order[2]).toBe('compaction')
    expect(order[3]).toContain('second question')
    // The recorded replacement is the only compaction marker in the list.
    expect(document.querySelectorAll('.compression-event')).toHaveLength(0)
    expect(document.querySelector('.summary-entry')?.textContent).toContain('压缩摘要 · 第 1 轮')
    expect(document.querySelector('.summary-entry')?.textContent).toContain('2 条消息 → 1 条摘要')
  })

  it('stands a committed summary in for the turns it replaced, with the archived copy inside', () => {
    // The surface keeps the newest turn and the anchors; turn 1 is gone from it,
    // exactly as a committed replacement leaves it.
    const retained = NODES.filter(entry => entry.turn === null || entry.turn === 2)
    const replaced = NODES.filter(entry => entry.turn === 1)
    render(<TrajectoryCard view={view({
      nodes: retained,
      totalMessages: 3,
      attempt: 'completed',
      latestCompression: {
        replacementSeq: 30 as BarView['nodes'][number]['seq'],
        generatedExcerpt: 'the loader was shadowed by the merge order',
        checkpoint: node(30, { kind: 'summary', turn: 2, excerpt: 'condensed' }),
        before: replaced,
        beforeCount: 4,
        omittedBeforeCount: 0,
        beforeFirstTurn: 1,
        beforeLastTurn: 1,
      },
    })} t={t} />)
    expect(screen.getByText('摘要 + 第 2 轮')).toBeTruthy()
    expect(document.querySelector('.turn-card.archived')).toBeNull()
    const entry = document.querySelector('.summary-entry') as HTMLElement
    expect(entry.textContent).toContain('压缩摘要 · 第 1 轮')
    expect(entry.textContent).toContain('4 条消息 → 1 条摘要')
    fireEvent.click(entry)
    expect(document.querySelector('.summary-excerpt')?.textContent).toContain('the loader was shadowed by the merge order')
    expect(document.querySelector('.summary-content')?.textContent).toContain('checkpoint #30')
    const toggle = document.querySelector('.archive-toggle') as HTMLElement
    expect(toggle.textContent).toContain('展开压缩前的第 1 轮')
    fireEvent.click(toggle)
    expect(document.querySelector('.turn-card.archived')?.textContent).toContain('fix the loader')
  })

  it('collapses and expands from its own toggle', () => {
    render(<TrajectoryCard view={view({ nodes: NODES, totalMessages: 7 })} t={t} />)
    const toggle = document.querySelector('.trajectory-toggle') as HTMLElement
    expect(toggle.getAttribute('aria-expanded')).toBe('true')
    fireEvent.click(toggle)
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    expect(document.querySelector('.trajectory-detail')?.className).not.toContain('open')
  })
})

describe('SnapshotCard', () => {
  it('draws the pane with its heading and caption, and says when nothing was committed', () => {
    render(<SnapshotCard view={view()} t={t} />)
    expect(screen.getByText('上下文快照')).toBeTruthy()
    expect(screen.getByText('当前会话最近已提交的记录')).toBeTruthy()
    expect(screen.getByText(/这不表示插件被禁用/)).toBeTruthy()
    expect(document.querySelectorAll('.section')).toHaveLength(0)
  })

  it('draws the committed sections with the producer names beside the labels', () => {
    render(<SnapshotCard view={view({ snapshot: snapshot('present') })} t={t} />)
    expect(screen.getByText('沙箱文件范围')).toBeTruthy()
    expect(screen.getByText('sandbox:policy')).toBeTruthy()
    // An unknown producer keeps its own name as the label.
    expect(screen.getAllByText('approval:policy').length).toBeGreaterThan(0)
    expect(document.querySelectorAll('.section')).toHaveLength(2)
    expect(screen.getByText(/记录 #148/)).toBeTruthy()
    expect(screen.getByText('source.kind=plugin')).toBeTruthy()
  })

  it('copies the shown text and reports the clipboard outcome', async () => {
    const writeText = vi.fn(async () => undefined)
    vi.stubGlobal('navigator', { clipboard: { writeText } })
    render(<SnapshotCard view={view({ snapshot: snapshot('present', 1) })} t={t} />)
    fireEvent.click(screen.getByText('复制完整原文'))
    await vi.waitFor(() => { expect(screen.getByText('已复制')).toBeTruthy() })
    expect(writeText).toHaveBeenCalledWith('沙箱文件范围\nworkspace-write')
  })

  it('shows the first record silently and flashes a later commit once', () => {
    const first = view({ snapshot: snapshot('present') })
    const { rerender } = render(<SnapshotCard view={first} t={t} />)
    expect(document.querySelector('.snapshot-detail')?.className).not.toContain('state-change')
    rerender(<SnapshotCard view={view({ snapshot: { ...snapshot('present'), seq: 168 as BarView['nodes'][number]['seq'] } })} t={t} />)
    expect(document.querySelector('.snapshot-detail')?.className).toContain('state-change')
  })

  it('keeps a cleared record readable', () => {
    render(<SnapshotCard view={view({ snapshot: snapshot('cleared', 0) })} t={t} />)
    expect(screen.getAllByText('已清除').length).toBeGreaterThan(0)
    expect(screen.getByText('清除记录')).toBeTruthy()
    expect(screen.getByText(/Earlier runtime-context snapshots no longer apply/)).toBeTruthy()
  })

  it('reports a record a replacement took out of the surface', () => {
    render(<SnapshotCard view={view({ snapshot: snapshot('removed') })} t={t} />)
    expect(screen.getAllByText('已移出当前上下文').length).toBeGreaterThan(0)
    expect(document.querySelector('.state')?.className).toContain('removed')
  })
})

describe('ContextPanel', () => {
  it('keeps both tabs and switches between the two cards', () => {
    render(
      <ContextPanel
        view={view({ nodes: [node(4)], totalMessages: 1 })}
        requested={undefined}
        navigationRevision={0}
        t={t}
      />,
    )
    const tabs = [...document.querySelectorAll('.context-tabs button')]
    expect(tabs.map(tab => tab.textContent)).toEqual(['消息轨迹', '运行时快照'])
    expect(document.querySelector('.trajectory-card')).not.toBeNull()
    fireEvent.click(tabs[1] as HTMLElement)
    expect(document.querySelector('.snapshot-pane')).not.toBeNull()
    expect(document.querySelector('.trajectory-card')).toBeNull()
    fireEvent.click(tabs[0] as HTMLElement)
    expect(document.querySelector('.trajectory-card')).not.toBeNull()
  })

  it('opens on the pane the composer entry asked for', () => {
    render(<ContextPanel view={view()} requested="snapshot" navigationRevision={1} t={t} />)
    expect(document.querySelector('.snapshot-pane')).not.toBeNull()
    const tabs = [...document.querySelectorAll('.context-tabs button')]
    expect(tabs.map(tab => tab.getAttribute('aria-pressed'))).toEqual(['false', 'true'])
  })
})

describe('ComposerEntry', () => {
  it('states the committed snapshot in the prototype row and opens the card', () => {
    const open = vi.fn()
    const committed = view({ snapshot: snapshot('present') })
    render(<ComposerEntry view={committed} open={open} t={t} />)
    expect(screen.getByText('上下文快照')).toBeTruthy()
    expect(screen.getByText(entrySummary(committed, t))).toBeTruthy()
    expect(document.querySelector('.snapshot-card')).not.toBeNull()
    fireEvent.click(document.querySelector('.snapshot-toggle') as HTMLElement)
    expect(open).toHaveBeenCalledTimes(1)
  })

  it('says a session has committed nothing and still opens the column', () => {
    const open = vi.fn()
    render(<ComposerEntry view={view()} open={open} t={t} />)
    expect(screen.getAllByText('无记录').length).toBeGreaterThan(0)
    fireEvent.click(screen.getByLabelText('打开上下文快照'))
    expect(open).toHaveBeenCalledTimes(1)
  })
})
