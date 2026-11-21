// Writes one page's share details into an HTML document: title, description, canonical address,
// Open Graph tags and Twitter card tags. Pure string work, so it runs in any build tool.
import { DEFAULTS } from './config.mjs'

export const escapeAttr = (text) => String(text).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
export const escapeText = (text) => String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
export const unescape = (text) => String(text).replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')

const TAG = (name) => new RegExp(`<${name}\\b(?:[^>"']|"[^"]*"|'[^']*')*>`, 'gi')
const ATTR = /([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g

/** The attributes of one tag, names in lower case, values still escaped as written. */
export function readAttrs(tag) {
  const inner = tag.replace(/^<[a-z]+/i, '').replace(/\/?>$/, '')
  const attrs = {}
  for (const match of inner.matchAll(ATTR)) attrs[match[1].toLowerCase()] = match[2] ?? match[3] ?? match[4] ?? ''
  return attrs
}

/** The same tag with one attribute set, written with double quotes. */
function withAttr(tag, name, value) {
  const written = `${name}="${escapeAttr(value)}"`
  const existing = new RegExp(`(\\s)${name}\\s*=\\s*(?:"[^"]*"|'[^']*'|[^\\s"'=<>\`]+)`, 'i')
  if (existing.test(tag)) return tag.replace(existing, (_, space) => `${space}${written}`)
  return tag.replace(/\s*\/?>$/, (end) => ` ${written}${end.includes('/') ? ' />' : '>'}`)
}

/** Every tag the injector fills. `required` ones must already be in the HTML (or be added with addMissing). */
export function tagPlan(page, config = {}) {
  const width = String(config.width ?? DEFAULTS.width), height = String(config.height ?? DEFAULTS.height)
  const image = page.imageVersion ? `${page.imageUrl}?v=${page.imageVersion}` : page.imageUrl
  const meta = (attr, key, value, required = true) => ({ kind: 'meta', attr, key, value, required, label: `<meta ${attr}="${key}">` })
  return [
    { kind: 'title', value: page.title, required: true, label: '<title>' },
    meta('name', 'description', page.description),
    { kind: 'canonical', value: page.url, required: true, label: '<link rel="canonical">' },
    meta('property', 'og:title', page.title),
    meta('property', 'og:description', page.description),
    meta('property', 'og:url', page.url),
    meta('property', 'og:image', image),
    meta('name', 'twitter:card', 'summary_large_image'),
    meta('name', 'twitter:title', page.title),
    meta('name', 'twitter:description', page.description),
    meta('name', 'twitter:image', image),
    meta('property', 'og:type', 'website', false),
    meta('property', 'og:site_name', config.siteName ?? '', false),
    meta('property', 'og:image:width', width, false),
    meta('property', 'og:image:height', height, false),
    meta('property', 'og:image:alt', page.title, false),
    meta('name', 'twitter:image:alt', page.title, false),
  ]
}

const writeTag = (item) => {
  if (item.kind === 'title') return `<title>${escapeText(item.value)}</title>`
  if (item.kind === 'canonical') return `<link rel="canonical" href="${escapeAttr(item.value)}" />`
  return `<meta ${item.attr}="${item.key}" content="${escapeAttr(item.value)}" />`
}

/** Fill one item. Returns the new HTML, or null when the tag is not in the document. */
function fill(html, item) {
  if (item.kind === 'title') {
    const pattern = /<title\b[^>]*>[\s\S]*?<\/title>/i
    return pattern.test(html) ? html.replace(pattern, () => writeTag(item)) : null
  }
  let found = false
  const matches = item.kind === 'canonical'
    ? (attrs) => (attrs.rel || '').toLowerCase() === 'canonical'
    : (attrs) => (attrs[item.attr] || '').toLowerCase() === item.key
  const target = item.kind === 'canonical' ? 'href' : 'content'
  const out = html.replace(TAG(item.kind === 'canonical' ? 'link' : 'meta'), (tag) => {
    if (!matches(readAttrs(tag))) return tag
    found = true
    return withAttr(tag, target, item.value)
  })
  return found ? out : null
}

/** The head snippet a page shell needs before `inject` can fill it. */
export function headSnippet(page, config) {
  return tagPlan(page, config).map(writeTag).join('\n')
}

/**
 * The HTML with this page's own title, description, address and preview image in its head.
 * A required tag that is not in the HTML is an error naming every missing tag, unless
 * `addMissing` is set, in which case missing tags are added before </head>.
 */
export function withPageMeta(html, page, config = {}, { addMissing = false } = {}) {
  const missing = []
  let out = html
  for (const item of tagPlan(page, config)) {
    const filled = fill(out, item)
    if (filled !== null) out = filled
    else if (item.required || addMissing) missing.push(item)
  }
  if (!missing.length) return out
  if (!addMissing) {
    const required = missing.filter((item) => item.required)
    throw new Error([
      `The HTML has no ${required.map((item) => item.label).join(', ')} to fill in for ${page.path}.`,
      'Add the tags to the page shell (run "cards tags" for a block to paste), or pass --add-missing.',
    ].join('\n'))
  }
  if (!/<\/head>/i.test(out)) throw new Error(`The HTML has no </head>, so missing tags cannot be added for ${page.path}.`)
  const block = missing.map((item) => `    ${writeTag(item)}`).join('\n')
  return out.replace(/([ \t]*)<\/head>/i, (_, indent) => `${block}\n${indent}</head>`)
}

/** What a finished page says about itself, values decoded: { title, canonical, meta: { 'og:title': ... } } */
export function readPageMeta(html) {
  const meta = {}
  for (const tag of html.match(TAG('meta')) || []) {
    const attrs = readAttrs(tag)
    const key = (attrs.property || attrs.name || '').toLowerCase()
    if (key && attrs.content !== undefined && !(key in meta)) meta[key] = unescape(attrs.content)
  }
  const canonicalTag = (html.match(TAG('link')) || []).find((tag) => (readAttrs(tag).rel || '').toLowerCase() === 'canonical')
  const title = /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(html)
  return { title: title ? unescape(title[1].trim()) : null, canonical: canonicalTag ? unescape(readAttrs(canonicalTag).href || '') : null, meta }
}
