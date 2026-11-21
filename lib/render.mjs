// Draws every card: opens a template in a headless browser, fills it, and saves a JPEG.
import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { launchBrowser, pool } from './browser.mjs'
import { TEMPLATES_DIR } from './config.mjs'
import { cardHash, planRender, readLock, writeLock } from './hash.mjs'

export const RUNTIME_FILE = join(TEMPLATES_DIR, 'runtime.js')
export const DEFAULT_JOBS = 3
const LOCAL_SCHEMES = /^(file|data|about|blob):/

const fileUrl = (path) => (path ? pathToFileURL(path).href : '')
const mustRead = (path, what) => {
  if (!existsSync(path)) throw new Error(`${what} not found: ${path}`)
  return readFileSync(path)
}

/** One job per page: what the template is given, where the image goes, and the hash of all of it. */
/**
 * Local files a template pulls in with src="" or href="" (a stylesheet, an image, a script), so that
 * changing one redraws the card. Files reached from inside CSS (@import, url()) are not followed.
 */
export function linkedFiles(templateFile, template) {
  const found = {}
  for (const [, ref] of String(template).matchAll(/\b(?:src|href)\s*=\s*["']([^"'#?]+)["']/g)) {
    if (/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(ref)) continue
    const file = resolve(dirname(templateFile), ref)
    if (existsSync(file) && statSync(file).isFile()) found[`linked:${ref}`] = readFileSync(file)
  }
  return found
}

export function renderJobs(config) {
  const runtime = mustRead(RUNTIME_FILE, 'card runtime')
  const shared = { logo: config.logo ? mustRead(config.logo, 'logo') : null, fonts: config.fonts.map((font) => mustRead(font.file, `font "${font.family}"`)) }
  return config.pages.map((page) => {
    const template = mustRead(page.templateFile, `template "${page.template}"`)
    const art = page.art ? mustRead(page.art, `art for ${page.path}`) : null
    const text = {
      title: page.cardTitle,
      kicker: page.kicker,
      description: page.cardDescription,
      site: config.siteName,
      domain: config.host,
      path: page.path,
      address: `${config.host}${page.path === '/' ? '' : page.path}`,
    }
    const fonts = config.fonts.map(({ family, weight, style }) => ({ family, weight: String(weight), style }))
    const data = { ...text, theme: config.theme, fonts, art: fileUrl(page.art), logo: fileUrl(config.logo) }
    const files = { template, runtime, ...linkedFiles(page.templateFile, template), ...(art ? { art } : {}), ...(shared.logo ? { logo: shared.logo } : {}), ...Object.fromEntries(shared.fonts.map((bytes, i) => [`font${i}`, bytes])) }
    const hash = cardHash({ data: { ...text, theme: config.theme, fonts, width: config.width, height: config.height, quality: config.quality }, files })
    return { path: page.path, image: page.image, imageFile: page.imageFile, templateFile: page.templateFile, data, hash }
  })
}

const fontFaces = (config) => config.fonts.map((font) => `@font-face { font-family: "${font.family}"; src: url("${fileUrl(font.file)}"); font-weight: ${font.weight}; font-style: ${font.style}; font-display: block; }`).join('\n')

/** Draw one card on a fresh page and return { bytes, warnings }. */
async function drawCard(context, job, config) {
  const page = await context.newPage()
  try {
    const blocked = new Set()
    await page.route('**/*', (route) => {
      const url = route.request().url()
      if (config.allowNetwork || LOCAL_SCHEMES.test(url)) return route.continue()
      blocked.add(url)
      return route.abort()
    })
    const pageErrors = []
    page.on('pageerror', (error) => pageErrors.push(error.message))
    await page.goto(fileUrl(job.templateFile), { waitUntil: 'load' })
    if (config.fonts.length) await page.addStyleTag({ content: fontFaces(config) })
    await page.addScriptTag({ path: RUNTIME_FILE })
    if (!(await page.evaluate(() => typeof window.fillCard === 'function'))) throw new Error(`the card runtime did not load${pageErrors.length ? `: ${pageErrors[0]}` : ''}`)
    const { warnings } = await page.evaluate((data) => window.fillCard(data), job.data)
    if (pageErrors.length) throw new Error(`the template threw: ${pageErrors[0]}`)
    const notes = [...warnings, ...[...blocked].map((url) => `blocked a network request to ${url} (set "allowNetwork": true to permit it)`)]
    const bytes = await page.screenshot({ type: 'jpeg', quality: config.quality, clip: { x: 0, y: 0, width: config.width, height: config.height } })
    return { bytes, warnings: notes }
  } finally {
    await page.close().catch(() => {})
  }
}

/**
 * Render every card that changed. Returns { drawn, skipped, warnings, failures }.
 * `only` limits the run to some page paths; `force` redraws everything.
 */
export async function renderCards(config, { force = false, only = [], jobs = DEFAULT_JOBS, log = () => {}, launch = launchBrowser } = {}) {
  const all = renderJobs(config)
  const unknown = only.filter((path) => !all.some((job) => job.path === path))
  if (unknown.length) throw new Error(`No page ${unknown.join(', ')} in the config`)
  const wanted = only.length ? all.filter((job) => only.includes(job.path)) : all
  const lock = readLock(config.lockFile)
  const { stale, fresh } = planRender(wanted, lock, { force })
  const result = { drawn: [], skipped: fresh.map((job) => job.path), warnings: [], failures: [] }
  if (!stale.length) return result

  const { browser, label } = await launch({ log })
  log(`browser: ${label}`)
  const nextLock = { ...lock }
  try {
    const context = await browser.newContext({ viewport: { width: config.width, height: config.height }, deviceScaleFactor: 1 })
    await pool(stale, jobs, async (job) => {
      try {
        const { bytes, warnings } = await drawCard(context, job, config)
        mkdirSync(dirname(job.imageFile), { recursive: true })
        writeFileSync(`${job.imageFile}.tmp`, bytes)
        renameSync(`${job.imageFile}.tmp`, job.imageFile)
        nextLock[job.image] = { path: job.path, hash: job.hash }
        result.drawn.push(job.path)
        for (const warning of warnings) result.warnings.push(`${job.path}: ${warning}`)
        log(`drew ${job.path} -> ${job.imageFile} (${Math.round(bytes.length / 1024)} KB)`)
      } catch (error) {
        result.failures.push(`${job.path}: ${String(error.message).split('\n')[0]}`)
      }
    })
  } finally {
    await browser.close().catch(() => {})
    const kept = new Set(config.pages.map((page) => page.image))
    writeLock(config.lockFile, Object.fromEntries(Object.entries(nextLock).filter(([image]) => kept.has(image))))
  }
  return result
}
