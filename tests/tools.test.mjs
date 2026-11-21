import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { launchBrowser, pool } from '../lib/browser.mjs'
import { parseArgs } from '../lib/cli.mjs'
import { chatPreviewHtml, contactSheetHtml } from '../lib/preview.mjs'
import { config } from './helpers.mjs'

describe('command line arguments', () => {
  test('separates words, switches and flags that take values', () => {
    assert.deepEqual(parseArgs(['render', 'site', '--only', '/a', '--only=/b', '--force']), { rest: ['render', 'site'], flags: { only: ['/a', '/b'], force: true } })
  })

  test('a value flag without a value is an error', () => {
    assert.throws(() => parseArgs(['render', '--jobs']), /--jobs needs a value/)
  })
})

describe('starting a browser', () => {
  const noWait = async () => {}

  test('retries a browser that fails at first', async () => {
    let calls = 0
    const chromium = { launch: async () => { calls += 1; if (calls < 3) throw new Error('busy\nstack'); return { name: 'ok' } } }
    const result = await launchBrowser({ chromium, candidates: [{ label: 'A', options: {}, present: true }], wait: noWait })
    assert.equal(result.browser.name, 'ok')
    assert.equal(calls, 3)
  })

  test('moves on to the next browser, skipping ones that are not installed', async () => {
    const seen = []
    const chromium = { launch: async (options) => { seen.push(options.executablePath); if (options.executablePath === '/a') throw new Error('broken'); return {} } }
    const candidates = [{ label: 'gone', options: { executablePath: '/gone' }, present: false }, { label: 'A', options: { executablePath: '/a' }, present: true }, { label: 'B', options: { executablePath: '/b' }, present: true }]
    const result = await launchBrowser({ chromium, candidates, attempts: 2, wait: noWait })
    assert.equal(result.label, 'B')
    assert.deepEqual(seen, ['/a', '/a', '/b'])
  })

  test('when nothing starts, the error lists what was tried and how to fix it', async () => {
    const chromium = { launch: async () => { throw new Error('no display') } }
    const candidates = [{ label: 'gone', options: {}, present: false }, { label: 'A', options: {}, present: true }]
    await assert.rejects(launchBrowser({ chromium, candidates, attempts: 1, wait: noWait }), (error) => {
      assert.match(error.message, /gone: not installed/)
      assert.match(error.message, /A: attempt 1 failed: no display/)
      assert.match(error.message, /CARDS_CHROME/)
      return true
    })
  })
})

describe('running jobs in parallel', () => {
  test('never runs more than the limit at once and keeps results in order', async () => {
    let running = 0, peak = 0
    const results = await pool([5, 1, 4, 2, 3, 6, 7], 3, async (n) => {
      running += 1
      peak = Math.max(peak, running)
      await new Promise((done) => setTimeout(done, n))
      running -= 1
      return n * 2
    })
    assert.equal(peak, 3)
    assert.deepEqual(results, [10, 2, 8, 4, 6, 12, 14])
  })
})

describe('preview pages', () => {
  const site = config({ siteName: 'Tool <Shed>' })

  test('escape text and point at images by relative path', () => {
    const html = chatPreviewHtml(site, '/project/cards-preview')
    assert.match(html, /Tool &lt;Shed&gt;/)
    assert.doesNotMatch(html, /Tool <Shed>/)
    assert.match(html, /What to bring &amp; what "clean" means\./)
    assert.match(html, /https:\/\/tools\.example\/guides\/first-loan/)
  })

  test('the contact sheet marks cards that are not rendered yet', () => {
    const html = contactSheetHtml(site, '/project/cards-preview')
    assert.equal(html.match(/class="missing"/g).length, 2)
    assert.match(html, /2 cards/)
  })
})
