import assert from 'node:assert/strict'
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { describe, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { loadConfig } from '../lib/config.mjs'
import { injectSite, pagesForTags } from '../lib/inject.mjs'
import { readPageMeta } from '../lib/meta.mjs'
import shareCards from '../vite-plugin.mjs'
import { RAW, SHELL, config, tempDir } from './helpers.mjs'

const EXAMPLE = join(dirname(fileURLToPath(import.meta.url)), '..', 'examples', 'site')

describe('writing one HTML file per page', () => {
  test('writes index.html for the home page and a folder for every other page', () => {
    const dist = tempDir()
    writeFileSync(join(dist, 'index.html'), SHELL)
    const files = injectSite(config({}, dist), { dist })
    assert.deepEqual(files.map((f) => f.path), ['/', '/guides/first-loan'])
    assert.equal(readPageMeta(readFileSync(join(dist, 'index.html'), 'utf8')).title, 'Tool Shed')
    assert.equal(readPageMeta(readFileSync(join(dist, 'guides', 'first-loan', 'index.html'), 'utf8')).meta['og:url'], 'https://tools.example/guides/first-loan')
  })

  test('writes nothing at all when the shell lacks a tag', () => {
    const dist = tempDir()
    writeFileSync(join(dist, 'index.html'), SHELL.replace(/\s*<meta name="twitter:image"[^>]*>/, ''))
    assert.throws(() => injectSite(config({}, dist), { dist }), /twitter:image[\s\S]*and the same for 1 more page/)
    assert.equal(existsSync(join(dist, 'guides')), false)
    assert.equal(readPageMeta(readFileSync(join(dist, 'index.html'), 'utf8')).title, 'Shell')
  })

  test('says so when the site has not been built', () => {
    assert.throws(() => injectSite(config(), { dist: join(tempDir(), 'nope') }), /Build the site first/)
  })

  test('can write into another folder and leave the shell untouched', () => {
    const dist = tempDir(), out = tempDir()
    writeFileSync(join(dist, 'index.html'), SHELL)
    injectSite(config({}, dist), { dist, out })
    assert.equal(readFileSync(join(dist, 'index.html'), 'utf8'), SHELL)
    assert.ok(existsSync(join(out, 'guides', 'first-loan', 'index.html')))
  })

  test('versionImages stamps each image address from the lock', () => {
    const site = config({ versionImages: true })
    const pages = pagesForTags(site, { home: { hash: '0123456789abcdef' } })
    assert.equal(pages[0].imageVersion, '01234567')
    assert.equal(pages[1].imageVersion, '')
    assert.equal(pagesForTags(config(), { home: { hash: '0123456789abcdef' } })[0].imageVersion, '')
  })

  test('the example site in the repository is exactly what inject produces', async () => {
    const copy = tempDir()
    cpSync(EXAMPLE, copy, { recursive: true })
    const site = await loadConfig(copy)
    for (const file of injectSite(site)) {
      const committed = join(EXAMPLE, 'dist', file.file.slice(join(copy, 'dist').length + 1))
      assert.equal(readFileSync(file.file, 'utf8'), readFileSync(committed, 'utf8'), file.path)
    }
  })
})

describe('the Vite plugin', () => {
  test('injects into the build output folder after a build', async () => {
    const root = tempDir()
    writeFileSync(join(root, 'cards.config.json'), JSON.stringify(RAW))
    const out = join(root, 'build')
    mkdirSync(out)
    writeFileSync(join(out, 'index.html'), SHELL)
    const plugin = shareCards()
    plugin.configResolved({ root, build: { outDir: 'build' } })
    plugin.buildEnd()
    await plugin.closeBundle()
    assert.equal(readPageMeta(readFileSync(join(out, 'guides', 'first-loan', 'index.html'), 'utf8')).meta['og:title'], 'Your first loan | Tool Shed')
  })

  test('does nothing after a failed build', async () => {
    const plugin = shareCards()
    plugin.configResolved({ root: tempDir(), build: { outDir: 'dist' } })
    plugin.buildEnd(new Error('build broke'))
    await plugin.closeBundle()
  })
})
