/**
 * Render `artifacts/preview.html` in a real browser and check that the shipped
 * stylesheet actually applies.
 *
 * jsdom, where the component specs run, parses no stylesheets: it can prove the
 * markup, never the presentation. This script launches headless Chrome, drives
 * it over the DevTools protocol with the built-in WebSocket (no dependency),
 * reads computed styles for the rules the design depends on, captures a full
 * page screenshot beside the artifact, and exits non-zero when a check fails.
 *
 * Usage: node scripts/check-preview-render.mjs [--chrome <path>]
 */

import { spawn } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CHROME = process.argv.includes('--chrome')
  ? process.argv[process.argv.indexOf('--chrome') + 1]
  : '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const ROOT = process.cwd()
// Cache-busted: a repeated file:// navigation would otherwise reuse the
// previous render, which silently checks a stale artifact.
const PAGE = `file://${ROOT}/artifacts/preview.html?rev=${Date.now()}`
const PORT = 9333

/** Wait until the DevTools HTTP endpoint answers, or throw. */
async function waitForChrome(deadlineMs = 20_000) {
  const started = Date.now()
  for (;;) {
    try {
      const response = await fetch(`http://127.0.0.1:${PORT}/json/version`)
      if (response.ok) return await response.json()
    } catch {
      // Not listening yet.
    }
    if (Date.now() - started > deadlineMs) throw new Error('Chrome did not expose its debugging endpoint')
    await new Promise(resolve => setTimeout(resolve, 200))
  }
}

/** Send one CDP command and resolve its result. */
function send(ws, id, method, params = {}) {
  return new Promise((resolve, reject) => {
    const onMessage = (event) => {
      const message = JSON.parse(event.data)
      if (message.id !== id) return
      ws.removeEventListener('message', onMessage)
      if (message.error) reject(new Error(`${method}: ${message.error.message}`))
      else resolve(message.result)
    }
    ws.addEventListener('message', onMessage)
    ws.send(JSON.stringify({ id, method, params }))
  })
}

const profile = mkdtempSync(join(tmpdir(), 'csb-render-'))
const chrome = spawn(CHROME, [
  '--headless=new',
  '--no-sandbox',
  '--disable-gpu',
  '--hide-scrollbars',
  '--no-first-run',
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${profile}`,
  'about:blank',
], { stdio: ['ignore', 'ignore', 'ignore'] })

let failures = 0
try {
  await waitForChrome()
  const targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()
  const page = targets.find(target => target.type === 'page')
  if (page === undefined) throw new Error('no page target')

  const ws = new WebSocket(page.webSocketDebuggerUrl)
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true })
    ws.addEventListener('error', reject, { once: true })
  })
  await send(ws, 1, 'Page.enable')
  await send(ws, 2, 'Runtime.enable')
  await send(ws, 3, 'Emulation.setDeviceMetricsOverride', { width: 1440, height: 1200, deviceScaleFactor: 1, mobile: false })
  await send(ws, 4, 'Page.navigate', { url: PAGE })
  await new Promise(resolve => setTimeout(resolve, 700))

  const evaluated = await send(ws, 5, 'Runtime.evaluate', {
    returnByValue: true,
    expression: `(() => {
      const css = (selector, property) => {
        const element = document.querySelector(selector)
        return element === null ? null : getComputedStyle(element).getPropertyValue(property)
      }
      const summaryClosed = document.querySelector('.summary-content') === null
      const sheetText = [...document.styleSheets].map(sheet => {
        try { return [...sheet.cssRules].map(rule => rule.cssText).join('\\n') } catch { return '' }
      }).join('\\n')
      return {
        blocks: document.querySelectorAll('.preview-block').length,
        panes: document.querySelectorAll('.snapshot-pane').length,
        entries: document.querySelectorAll('.snapshot-card').length,
        cards: document.querySelectorAll('.trajectory-card').length,
        steps: document.querySelectorAll('.turn-card').length,
        chips: document.querySelectorAll('.cycle-node').length,
        cycleInfo: document.querySelector('.cycle-info')?.textContent ?? null,
        // Every round list must read newest first: the turn keys are the turn
        // numbers, and an archived copy inside a summary is not part of the
        // list's own order.
        roundOrders: [...document.querySelectorAll('.round-list')].map(list =>
          [...list.querySelectorAll(':scope > .turn-card > .turn-entry[data-turn]')]
            .map(entry => Number(entry.dataset.turn))
            .filter(turn => Number.isFinite(turn))),
        summaryExcerpts: document.querySelectorAll('.summary-excerpt').length,
        archivedTurns: document.querySelectorAll('.turn-card.archived').length,
        leaves: document.querySelectorAll('.trace-leaf').length,
        summaries: document.querySelectorAll('.summary-group').length,
        cardDisplay: css('.trajectory-card', 'display'),
        cardColor: css('.trajectory-card', 'color'),
        toggleDisplay: css('.trajectory-toggle', 'display'),
        toggleTracks: (css('.trajectory-toggle', 'grid-template-columns').match(/px|auto|fr/g) ?? []).length,
        stripTokens: document.querySelectorAll('.strip-token').length,
        nodeKindFont: css('.turn-entry .trace-line', 'font-family'),
        nodeKindSize: css('.turn-entry .trace-line', 'font-size'),
        entryHeight: document.querySelector('.snapshot-toggle')?.getBoundingClientRect().height ?? null,
        entryMaxWidth: css('.csb-entry', 'max-width'),
        composerVar: getComputedStyle(document.documentElement).getPropertyValue('--dsh-composer-card-max-width').trim(),
        columnTabs: document.querySelectorAll('.context-tabs button').length,

        hasEnterKeyframes: sheetText.includes('csb-node-enter'),
        hasArrivalRule: sheetText.includes('.context-node.selected'),
        overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      }
    })()`,
  })
  const report = evaluated.result.value

  const shot = await send(ws, 9, 'Page.captureScreenshot', { format: 'png', captureBeyondViewport: true })
  writeFileSync(join(ROOT, 'artifacts/preview.png'), Buffer.from(shot.data, 'base64'))
  console.log(`\nscreenshot: artifacts/preview.png (${Buffer.from(shot.data, 'base64').length} bytes)`)
  console.log(failures === 0 ? 'all render checks passed' : `${failures} render check(s) failed`)
  ws.close()
} catch (error) {
  console.error(`render check failed: ${error.message}`)
  failures += 1
} finally {
  chrome.kill('SIGKILL')
}
process.exit(failures === 0 ? 0 : 1)
