import assert from 'node:assert/strict'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, test } from 'node:test'
import { imageName, loadConfig, pageFile, resolveConfig, validateConfig } from '../lib/config.mjs'
import { STARTER, writeStarter } from '../lib/init.mjs'
import { RAW, tempDir } from './helpers.mjs'

const errors = (raw) => validateConfig(raw).filter((p) => p.level === 'error').map((p) => p.message)
const warnings = (raw) => validateConfig(raw).filter((p) => p.level === 'warning').map((p) => p.message)
const withPage = (page) => ({ ...RAW, pages: [...RAW.pages, page] })

describe('config validation', () => {
  test('a good config has no problems', () => {
    assert.deepEqual(validateConfig(RAW), [])
  })

  test('siteUrl must be absolute', () => {
    assert.match(errors({ ...RAW, siteUrl: '/relative' })[0], /siteUrl must be an absolute address/)
    assert.match(errors({ ...RAW, siteUrl: undefined })[0], /siteUrl/)
  })

  test('http:// is allowed but warned about', () => {
    assert.deepEqual(errors({ ...RAW, siteUrl: 'http://tools.example' }), [])
    assert.match(warnings({ ...RAW, siteUrl: 'http://tools.example' })[0], /https/)
  })

  test('pages are required', () => {
    assert.match(errors({ ...RAW, pages: [] })[0], /at least one page/)
  })

  test('each page needs a path, a title and a description', () => {
    const found = errors(withPage({ path: '/x' }))
    assert.ok(found.some((m) => m === '/x: title is missing'))
    assert.ok(found.some((m) => m === '/x: description is missing'))
    assert.match(errors(withPage({ path: 'x', title: 'T', description: 'D' }))[0], /path must start with "\/"/)
  })

  test('rejects duplicate paths, trailing slashes, .html and query strings', () => {
    const page = (path) => withPage({ path, title: 'T', description: 'D' })
    assert.match(errors(page('/'))[0], /listed twice/)
    assert.match(errors(page('/about/'))[0], /trailing/)
    assert.match(errors(page('/about.html'))[0], /without "\.html"/)
    assert.match(errors(page('/a?b=1'))[0], /cannot contain/)
  })

  test('two pages cannot share an image name', () => {
    const raw = { ...RAW, pages: [{ path: '/a/b', title: 'T', description: 'D' }, { path: '/a-b', title: 'T', description: 'D' }] }
    assert.match(errors(raw)[0], /image name "a-b" is also used by \/a\/b/)
  })

  test('unknown templates are errors; unknown settings and long descriptions are warnings', () => {
    assert.match(errors({ ...RAW, template: 'fancy' })[0], /not built in/)
    assert.deepEqual(errors({ ...RAW, template: './mine.html' }), [])
    assert.match(warnings({ ...RAW, sitename: 'typo' })[0], /unknown setting "sitename"/)
    assert.match(warnings(withPage({ path: '/long', title: 'T', description: 'x'.repeat(161) }))[0], /161 characters/)
  })

  test('numbers are checked', () => {
    assert.match(errors({ ...RAW, quality: 140 })[0], /between 1 and 100/)
    assert.match(errors({ ...RAW, width: '1200' })[0], /width must be a positive number/)
  })

  test('resolveConfig throws one error listing every problem', () => {
    assert.throws(() => resolveConfig({ siteName: '', pages: [{ path: 'x' }] }, '/p'), /siteUrl[\s\S]*siteName[\s\S]*path must start/)
  })
})

describe('resolved config', () => {
  const site = resolveConfig({ ...RAW, siteUrl: 'https://tools.example/', logo: 'logo.svg' }, '/project')

  test('fills defaults and resolves paths against the config folder', () => {
    assert.equal(site.siteUrl, 'https://tools.example')
    assert.equal(site.width, 1200)
    assert.equal(site.height, 630)
    assert.equal(site.imageDir, join('/project', 'public/og'))
    assert.equal(site.logo, join('/project', 'logo.svg'))
    assert.equal(site.host, 'tools.example')
  })

  test('works out each page address, image and file', () => {
    const [home, guide] = site.pages
    assert.equal(home.image, 'home')
    assert.equal(home.htmlFile, 'index.html')
    assert.equal(guide.image, 'guides-first-loan')
    assert.equal(guide.imageUrl, 'https://tools.example/og/guides-first-loan.jpg')
    assert.equal(guide.htmlFile, 'guides/first-loan/index.html')
    assert.equal(guide.cardTitle, guide.title)
    assert.match(guide.templateFile, /templates[\\/]editorial\.html$/)
  })

  test('helpers', () => {
    assert.equal(imageName('/'), 'home')
    assert.equal(imageName('/a/b'), 'a-b')
    assert.equal(pageFile('/'), 'index.html')
    assert.equal(pageFile('/visit'), 'visit/index.html')
  })
})

describe('config files', () => {
  test('init writes a starter that validates, and refuses to overwrite it', async () => {
    const dir = tempDir()
    const file = writeStarter(dir)
    assert.deepEqual(validateConfig(STARTER), [])
    assert.equal((await loadConfig(dir)).pages.length, STARTER.pages.length)
    assert.throws(() => writeStarter(dir, { mjs: true }), /already exists/)
    assert.match(file, /cards\.config\.json$/)
  })

  test('a .mjs config can export an object or a function', async () => {
    const dir = tempDir()
    writeStarter(dir, { mjs: true })
    assert.equal((await loadConfig(dir)).siteName, 'Example Site')
    const fn = tempDir()
    writeFileSync(join(fn, 'cards.config.mjs'), `export default async () => (${JSON.stringify(RAW)})`)
    assert.equal((await loadConfig(fn)).siteName, 'Tool Shed')
  })

  test('says what to do when there is no config, and when JSON is broken', async () => {
    const dir = tempDir()
    await assert.rejects(loadConfig(dir), /cards init/)
    writeFileSync(join(dir, 'cards.config.json'), '{ nope')
    await assert.rejects(loadConfig(dir), /not valid JSON/)
  })
})
