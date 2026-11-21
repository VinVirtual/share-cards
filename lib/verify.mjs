// Checks that what will be deployed is what link previews need. Reads files only; needs no browser.
import { existsSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { DESCRIPTION_LIMIT } from './config.mjs'
import { readLock } from './hash.mjs'
import { imageSize } from './image.mjs'
import { pagesForTags } from './inject.mjs'
import { readPageMeta } from './meta.mjs'
import { renderJobs } from './render.mjs'

const TITLE_SOFT_LIMIT = 70
const isAbsoluteHttps = (url) => /^https:\/\/[^/\s]+\//.test(url)

/** Checks on one page's card image. */
export function checkImage(page, config, bytes) {
  const errors = []
  if (!bytes) return [`${page.path}: no card image at ${page.imageFile} (run "cards render")`]
  const size = imageSize(bytes)
  if (!size || size.type !== 'jpeg') errors.push(`${page.path}: ${page.imageFile} is not a JPEG`)
  else if (size.width !== config.width || size.height !== config.height) errors.push(`${page.path}: card is ${size.width}x${size.height}, expected ${config.width}x${config.height}`)
  const kb = bytes.length / 1024
  if (kb > config.maxImageKB) errors.push(`${page.path}: card is ${Math.round(kb)} KB, over the ${config.maxImageKB} KB budget (lower "quality" or simplify the art)`)
  return errors
}

/** Checks on one page's text and addresses, before any HTML exists. */
export function checkPage(page) {
  const errors = [], warnings = []
  if (page.description.length > DESCRIPTION_LIMIT) errors.push(`${page.path}: description is ${page.description.length} characters, over ${DESCRIPTION_LIMIT}`)
  if (page.title.length > TITLE_SOFT_LIMIT) warnings.push(`${page.path}: title is ${page.title.length} characters; previews often cut titles near ${TITLE_SOFT_LIMIT}`)
  if (!isAbsoluteHttps(page.imageUrl)) (page.imageUrl.startsWith('http://') ? warnings : errors).push(`${page.path}: image address ${page.imageUrl} should be an absolute https:// address`)
  return { errors, warnings }
}

/** Checks on one page's built HTML: every value must read back exactly as the config has it. */
export function checkHtml(page, config, html) {
  const errors = []
  const found = readPageMeta(html)
  const image = page.imageVersion ? `${page.imageUrl}?v=${page.imageVersion}` : page.imageUrl
  const expect = (label, actual, wanted) => {
    if (actual === null || actual === undefined) errors.push(`${page.path}: ${label} is missing from ${page.htmlFile}`)
    else if (actual !== wanted) errors.push(`${page.path}: ${label} is "${actual}" but should be "${wanted}" (an unescaped quote, or the page was not injected)`)
  }
  expect('<title>', found.title, page.title)
  expect('canonical', found.canonical, page.url)
  expect('description', found.meta.description, page.description)
  expect('og:title', found.meta['og:title'], page.title)
  expect('og:description', found.meta['og:description'], page.description)
  expect('og:url', found.meta['og:url'], page.url)
  expect('og:image', found.meta['og:image'], image)
  expect('twitter:card', found.meta['twitter:card'], 'summary_large_image')
  expect('twitter:title', found.meta['twitter:title'], page.title)
  expect('twitter:description', found.meta['twitter:description'], page.description)
  expect('twitter:image', found.meta['twitter:image'], image)
  for (const key of ['og:image', 'twitter:image']) {
    if (found.meta[key] && !/^https?:\/\//.test(found.meta[key])) errors.push(`${page.path}: ${key} "${found.meta[key]}" is not an absolute address`)
  }
  return errors
}

/**
 * Check a whole project. `html: 'auto'` checks built pages only when the dist folder exists,
 * `true` requires them, `false` skips them. Returns { errors, warnings, checked }.
 */
export function verifySite(config, { dist = config.dist, html = 'auto' } = {}) {
  const errors = [], warnings = [...config.warnings]
  const lock = readLock(config.lockFile)
  let hashes = {}
  try { hashes = Object.fromEntries(renderJobs(config).map((job) => [job.image, job.hash])) } catch (error) { errors.push(error.message) }
  const withHtml = html === true || (html === 'auto' && existsSync(join(dist, 'index.html')))
  if (html === true && !existsSync(join(dist, 'index.html'))) errors.push(`no built site at ${dist}`)
  let totalBytes = 0

  for (const page of pagesForTags(config, lock)) {
    const text = checkPage(page)
    errors.push(...text.errors)
    warnings.push(...text.warnings)
    const bytes = existsSync(page.imageFile) ? readFileSync(page.imageFile) : null
    errors.push(...checkImage(page, config, bytes))
    if (bytes) {
      totalBytes += statSync(page.imageFile).size
      if (hashes[page.image] && lock[page.image]?.hash !== hashes[page.image]) errors.push(`${page.path}: the card is out of date with the config or template (run "cards render")`)
    }
    if (!withHtml) continue
    const file = join(dist, page.htmlFile)
    if (!existsSync(file)) { errors.push(`${page.path}: no ${page.htmlFile} in ${dist} (run "cards inject")`); continue }
    errors.push(...checkHtml(page, config, readFileSync(file, 'utf8')))
    const deployed = join(dist, config.imageUrlPath.slice(1), `${page.image}.jpg`)
    if (!existsSync(deployed)) warnings.push(`${page.path}: ${config.imageUrlPath}/${page.image}.jpg is not in ${dist}; make sure the build copies the cards there`)
  }
  return { errors, warnings, checked: { pages: config.pages.length, html: withHtml, totalKB: Math.round(totalBytes / 1024) } }
}
