// Finds playwright-core and starts a headless browser, trying every browser on the machine in turn.
import { createRequire } from 'node:module'
import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// Helpers run from this folder, not the current one, so a .npmrc there cannot redirect `npm root -g`.
const HERE = dirname(fileURLToPath(import.meta.url))
const run = (cmd, args) => execFileSync(cmd, args, { cwd: HERE, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
const onPath = (name) => { try { return run(process.platform === 'win32' ? 'where' : 'which', [name]).split(/\r?\n/)[0] } catch { return null } }
const sleep = (ms) => new Promise((done) => setTimeout(done, ms))
const firstLine = (error) => String(error?.message || error).split('\n')[0].slice(0, 200)

const PATH_BROWSERS = ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser', 'microsoft-edge', 'chrome', 'msedge']
const FIXED_BROWSERS = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
]
const RETRY_PAUSE_MS = 500
const LONG_TMPDIR = 70 // Chrome keeps sockets in the temp folder, and socket paths have a short length limit

/** Playwright's chromium launcher and where it was loaded from. $CARDS_PLAYWRIGHT overrides the search. */
export function findPlaywright(env = process.env, cwd = process.cwd()) {
  const require = createRequire(import.meta.url)
  let globalRoot = ''
  try { globalRoot = run('npm', ['root', '-g']) } catch { /* npm is optional */ }
  const places = [
    env.CARDS_PLAYWRIGHT,
    join(cwd, 'node_modules', 'playwright-core'),
    join(cwd, 'node_modules', 'playwright'),
    'playwright-core',
    'playwright',
    ...(globalRoot ? ['playwright-core', 'playwright', '@playwright/test/node_modules/playwright-core', '@playwright/cli/node_modules/playwright-core'].map((name) => join(globalRoot, name)) : []),
  ].filter(Boolean)
  for (const place of places) {
    try {
      const loaded = require(place)
      if (loaded?.chromium) return { chromium: loaded.chromium, from: place }
    } catch { /* try the next place */ }
  }
  throw new Error('playwright-core was not found. Run "npm i -D playwright-core" in your project (or "npm i -g playwright-core"), or set CARDS_PLAYWRIGHT=/path/to/playwright-core')
}

/** Browsers worth trying, best first: { label, options, present }. */
export function browserCandidates(chromium, env = process.env) {
  const list = []
  if (env.CARDS_CHROME) list.push({ label: `CARDS_CHROME (${env.CARDS_CHROME})`, options: { executablePath: env.CARDS_CHROME }, present: existsSync(env.CARDS_CHROME) })
  const found = [...new Set([...PATH_BROWSERS.map(onPath), ...FIXED_BROWSERS].filter((path) => path && existsSync(path)))]
  for (const path of found) list.push({ label: path, options: { executablePath: path }, present: true })
  let bundled = ''
  try { bundled = chromium.executablePath() } catch { /* not installed */ }
  const registry = bundled ? resolve(bundled, '..', '..', '..') : ''
  let installed = false
  try { installed = readdirSync(registry).some((entry) => entry.startsWith('chromium')) } catch { /* no registry folder */ }
  list.push({ label: `Playwright's own Chromium${registry ? ` (${registry})` : ''}`, options: {}, present: installed })
  return list
}

/**
 * Start a browser. Each installed candidate gets `attempts` tries with a growing pause, because a
 * launch can fail for a moment on a busy machine. Throws one error listing what was tried.
 */
export async function launchBrowser({ chromium, from, candidates, attempts = 3, timeout = 45000, wait = sleep, log = () => {} } = {}) {
  if (!chromium) ({ chromium, from } = findPlaywright())
  const tried = []
  for (const candidate of candidates || browserCandidates(chromium)) {
    if (!candidate.present) { tried.push(`${candidate.label}: not installed`); continue }
    for (let attempt = 1; attempt <= attempts; attempt++) {
      try {
        const browser = await chromium.launch({ ...candidate.options, headless: true, timeout, args: ['--allow-file-access-from-files', '--font-render-hinting=none'] })
        if (tried.some((line) => line.includes('failed'))) log(`browser: started ${candidate.label} after earlier failures`)
        return { browser, label: candidate.label, tried }
      } catch (error) {
        tried.push(`${candidate.label}: attempt ${attempt} failed: ${firstLine(error)}`)
        if (attempt < attempts) await wait(RETRY_PAUSE_MS * attempt * attempt)
      }
    }
  }
  throw new Error([
    'No browser could be started. Tried:',
    ...tried.map((line) => `  - ${line}`),
    'Fix one of these:',
    '  - install Google Chrome, Chromium or Microsoft Edge',
    `  - install Playwright's own Chromium: npx playwright install chromium${from ? ` (playwright loaded from ${from})` : ''}`,
    '  - set CARDS_CHROME=/path/to/a/chromium-based/browser',
    ...(tmpdir().length > LONG_TMPDIR ? [`  - the temp folder path is ${tmpdir().length} characters long, which can stop Chrome starting: set TMPDIR to a shorter path`] : []),
  ].join('\n'))
}

/** Run `worker(item)` over `items`, at most `limit` at a time. Results keep the order of `items`. */
export async function pool(items, limit, worker) {
  const results = new Array(items.length)
  let next = 0
  const lane = async () => {
    while (next < items.length) {
      const index = next++
      results[index] = await worker(items[index], index)
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, lane))
  return results
}
