// Reads and checks cards.config.json / cards.config.mjs, and works out everything a page needs:
// its image name, its web address, its image address and the template it uses.
import { existsSync, readFileSync } from 'node:fs'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

export const SKILL = resolve(dirname(fileURLToPath(import.meta.url)), '..')
export const TEMPLATES_DIR = join(SKILL, 'templates')
export const BUILT_IN_TEMPLATES = Object.freeze(['editorial', 'minimal', 'technical'])
export const CONFIG_NAMES = Object.freeze(['cards.config.json', 'cards.config.mjs'])
export const DESCRIPTION_LIMIT = 160

export const DEFAULTS = Object.freeze({
  template: 'editorial',
  imageDir: 'public/og',
  imageUrlPath: '/og',
  dist: 'dist',
  width: 1200,
  height: 630,
  quality: 88,
  maxImageKB: 300,
  versionImages: false,
  allowNetwork: false,
})

const TOP_KEYS = new Set([...Object.keys(DEFAULTS), 'siteUrl', 'siteName', 'logo', 'theme', 'fonts', 'pages', '$schema'])
const PAGE_KEYS = new Set(['path', 'title', 'description', 'kicker', 'cardTitle', 'cardDescription', 'art', 'template', 'image'])
const isText = (v) => typeof v === 'string' && v.trim().length > 0
const isPathTemplate = (name) => /[\\/]/.test(name) || name.endsWith('.html')

/** '/' -> 'home', '/guides/first-loan' -> 'guides-first-loan' */
export const imageName = (path) => (path === '/' ? 'home' : path.slice(1).replace(/\//g, '-'))

/** Where a page's own HTML file goes in the build: '/visit' -> 'visit/index.html'. */
export const pageFile = (path) => (path === '/' ? 'index.html' : `${path.slice(1)}/index.html`)

/** Every problem in a config, as { level: 'error' | 'warning', message }. An empty list means it is usable. */
export function validateConfig(raw) {
  const problems = []
  const error = (message) => problems.push({ level: 'error', message })
  const warning = (message) => problems.push({ level: 'warning', message })
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return [{ level: 'error', message: 'the config must be an object' }]

  for (const key of Object.keys(raw)) if (!TOP_KEYS.has(key)) warning(`unknown setting "${key}" (a typo?)`)
  if (!isText(raw.siteUrl) || !/^https?:\/\/[^/\s]+/.test(raw.siteUrl)) error('siteUrl must be an absolute address such as "https://example.com"')
  else if (raw.siteUrl.startsWith('http://')) warning('siteUrl uses http://, and most apps only show previews for https:// images')
  if (!isText(raw.siteName)) error('siteName is missing')
  if (raw.imageUrlPath !== undefined && !/^\/[^?#]*$/.test(raw.imageUrlPath)) error('imageUrlPath must start with "/" (for example "/og")')
  for (const key of ['width', 'height', 'quality', 'maxImageKB']) {
    if (raw[key] !== undefined && !(Number.isFinite(raw[key]) && raw[key] > 0)) error(`${key} must be a positive number`)
  }
  if (raw.quality !== undefined && raw.quality > 100) error('quality must be between 1 and 100')
  if (raw.template !== undefined && !isText(raw.template)) error('template must be a name or a path to an .html file')
  else if (raw.template && !isPathTemplate(raw.template) && !BUILT_IN_TEMPLATES.includes(raw.template)) error(`template "${raw.template}" is not built in (${BUILT_IN_TEMPLATES.join(', ')}); give a path ending in .html for your own`)
  if (raw.theme !== undefined && (typeof raw.theme !== 'object' || raw.theme === null || Array.isArray(raw.theme))) error('theme must be an object of variable names and values')
  if (raw.fonts !== undefined && !Array.isArray(raw.fonts)) error('fonts must be a list of { family, file }')
  for (const [i, font] of (Array.isArray(raw.fonts) ? raw.fonts : []).entries()) {
    if (!font || !isText(font.family) || !isText(font.file)) error(`fonts[${i}] needs a family and a file`)
  }

  if (!Array.isArray(raw.pages) || raw.pages.length === 0) return [...problems, { level: 'error', message: 'pages must list at least one page' }]
  const seenPaths = new Set(), seenImages = new Map()
  for (const [i, page] of raw.pages.entries()) {
    const where = isText(page?.path) ? page.path : `pages[${i}]`
    if (!page || typeof page !== 'object') { error(`${where}: must be an object`); continue }
    for (const key of Object.keys(page)) if (!PAGE_KEYS.has(key)) warning(`${where}: unknown setting "${key}" (a typo?)`)
    if (!isText(page.path) || !page.path.startsWith('/')) { error(`${where}: path must start with "/"`); continue }
    if (/[?#\s"<>\\]/.test(page.path)) error(`${where}: path cannot contain "?", "#", quotes, angle brackets, backslashes or spaces`)
    if (/[:*()+]/.test(page.path)) error(`${where}: path cannot contain ":", "*", "+" or brackets (hosts read them as patterns)`)
    if (page.path.length > 1 && page.path.slice(1).replace(/\/$/, '').split('/').some((part) => part === '' || part === '.' || part === '..')) { error(`${where}: path cannot contain empty, "." or ".." parts`); continue }
    if (page.path.length > 1 && page.path.endsWith('/')) error(`${where}: drop the trailing "/"`)
    if (page.path.endsWith('.html')) error(`${where}: give the page address without ".html"`)
    if (seenPaths.has(page.path)) error(`${where}: listed twice`)
    seenPaths.add(page.path)
    if (!isText(page.title)) error(`${where}: title is missing`)
    if (!isText(page.description)) error(`${where}: description is missing`)
    else if (page.description.length > DESCRIPTION_LIMIT) warning(`${where}: description is ${page.description.length} characters; previews cut it near ${DESCRIPTION_LIMIT}`)
    for (const key of ['kicker', 'cardTitle', 'cardDescription', 'art', 'template', 'image']) {
      if (page[key] !== undefined && typeof page[key] !== 'string') error(`${where}: ${key} must be text`)
    }
    if (isText(page.template) && !isPathTemplate(page.template) && !BUILT_IN_TEMPLATES.includes(page.template)) error(`${where}: template "${page.template}" is not built in (${BUILT_IN_TEMPLATES.join(', ')})`)
    if (page.image !== undefined && !/^[a-z0-9][a-z0-9._-]*$/i.test(String(page.image))) error(`${where}: image must be a plain file name without an extension`)
    const name = isText(page.image) ? page.image : imageName(page.path)
    if (seenImages.has(name)) error(`${where}: its image name "${name}" is also used by ${seenImages.get(name)}; set "image" on one of them`)
    seenImages.set(name, page.path)
  }
  return problems
}

/** A checked config with defaults filled in and every page resolved. Throws one error listing every problem. */
export function resolveConfig(raw, root = process.cwd()) {
  const problems = validateConfig(raw)
  const errors = problems.filter((p) => p.level === 'error')
  if (errors.length) throw new Error(['The config has problems:', ...errors.map((p) => `  - ${p.message}`)].join('\n'))
  const base = { ...DEFAULTS, ...raw }
  const siteUrl = base.siteUrl.replace(/\/+$/, '')
  const imageUrlPath = base.imageUrlPath.replace(/\/+$/, '')
  const at = (p) => (isAbsolute(p) ? p : resolve(root, p))
  const templateFile = (name) => (isPathTemplate(name) ? at(name) : join(TEMPLATES_DIR, `${name}.html`))
  const pages = base.pages.map((page) => {
    const image = page.image || imageName(page.path)
    const template = page.template || base.template
    return Object.freeze({
      path: page.path,
      title: page.title,
      description: page.description,
      kicker: page.kicker || '',
      cardTitle: page.cardTitle || page.title,
      cardDescription: page.cardDescription ?? page.description,
      art: page.art ? at(page.art) : '',
      template,
      templateFile: templateFile(template),
      image,
      imageFile: join(at(base.imageDir), `${image}.jpg`),
      url: `${siteUrl}${page.path === '/' ? '/' : page.path}`,
      imageUrl: `${siteUrl}${imageUrlPath}/${image}.jpg`,
      htmlFile: pageFile(page.path),
    })
  })
  return Object.freeze({
    ...base,
    root,
    siteUrl,
    imageUrlPath,
    host: new URL(siteUrl).host,
    imageDir: at(base.imageDir),
    dist: at(base.dist),
    logo: base.logo ? at(base.logo) : '',
    theme: Object.freeze({ ...(base.theme || {}) }),
    fonts: Object.freeze((base.fonts || []).map((font) => Object.freeze({ weight: '400', style: 'normal', ...font, file: at(font.file) }))),
    lockFile: join(root, 'cards.lock.json'),
    pages: Object.freeze(pages),
    warnings: Object.freeze(problems.filter((p) => p.level === 'warning').map((p) => p.message)),
  })
}

/** The config file in a folder, or the file itself when a file is given. */
export function findConfig(target = process.cwd()) {
  const full = resolve(target)
  if (existsSync(full) && /\.(json|mjs|js)$/.test(full)) return full
  for (const name of CONFIG_NAMES) if (existsSync(join(full, name))) return join(full, name)
  throw new Error(`No ${CONFIG_NAMES.join(' or ')} in ${full}. Run "cards init" there first.`)
}

/** Load, check and resolve a config file. Paths inside it are relative to the folder it sits in. */
export async function loadConfig(target) {
  const file = findConfig(target)
  let raw
  if (file.endsWith('.json')) {
    try { raw = JSON.parse(readFileSync(file, 'utf8')) } catch (cause) { throw new Error(`${file} is not valid JSON: ${cause.message}`) }
  } else {
    const loaded = await import(`${pathToFileURL(file).href}?t=${Date.now()}`)
    raw = typeof loaded.default === 'function' ? await loaded.default() : loaded.default
  }
  return resolveConfig(raw, dirname(file))
}
