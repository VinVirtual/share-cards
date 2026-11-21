import assert from 'node:assert/strict'
import { dirname, join } from 'node:path'
import { describe, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { loadConfig } from '../lib/config.mjs'
import { imageSize } from '../lib/image.mjs'
import { withPageMeta } from '../lib/meta.mjs'
import { checkHtml, checkImage, checkPage, verifySite } from '../lib/verify.mjs'
import { SHELL, config, fakeJpeg } from './helpers.mjs'

const EXAMPLE = join(dirname(fileURLToPath(import.meta.url)), '..', 'examples', 'site')
const site = config()
const guide = site.pages[1]

describe('reading image sizes', () => {
  test('JPEG and PNG headers', () => {
    assert.deepEqual(imageSize(fakeJpeg(1200, 630)), { type: 'jpeg', width: 1200, height: 630 })
    const png = Buffer.alloc(32)
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(png)
    png.writeUInt32BE(640, 16)
    png.writeUInt32BE(480, 20)
    assert.deepEqual(imageSize(png), { type: 'png', width: 640, height: 480 })
    assert.equal(imageSize(Buffer.from('not an image at all, just text')), null)
  })
})

describe('verify', () => {
  test('a card of the right size and weight passes', () => {
    assert.deepEqual(checkImage(guide, site, fakeJpeg(1200, 630)), [])
  })

  test('a missing, wrong-sized, oversized or non-JPEG card fails', () => {
    assert.match(checkImage(guide, site, null)[0], /no card image/)
    assert.match(checkImage(guide, site, fakeJpeg(1200, 600))[0], /1200x600, expected 1200x630/)
    assert.match(checkImage(guide, site, fakeJpeg(1200, 630, 301 * 1024))[0], /over the 300 KB budget/)
    assert.match(checkImage(guide, site, Buffer.alloc(64))[0], /not a JPEG/)
  })

  test('descriptions over 160 characters fail; 160 exactly passes', () => {
    assert.deepEqual(checkPage({ ...guide, description: 'x'.repeat(160) }).errors, [])
    assert.match(checkPage({ ...guide, description: 'x'.repeat(161) }).errors[0], /161 characters/)
  })

  test('long titles are a warning, not a failure', () => {
    const result = checkPage({ ...guide, title: 'x'.repeat(71) })
    assert.deepEqual(result.errors, [])
    assert.match(result.warnings[0], /title is 71 characters/)
  })

  test('an injected page passes', () => {
    assert.deepEqual(checkHtml(guide, site, withPageMeta(SHELL, guide, site)), [])
  })

  test('catches a page that was never injected', () => {
    const problems = checkHtml(guide, site, SHELL)
    assert.ok(problems.some((p) => /og:image/.test(p)))
    assert.ok(problems.some((p) => /<title> is "Shell"/.test(p)))
  })

  test('catches an unescaped quote that cuts a description short', () => {
    const broken = withPageMeta(SHELL, guide, site).replaceAll('&quot;', '"')
    assert.ok(checkHtml(guide, site, broken).some((p) => /description is "What to bring & what "/.test(p)))
  })

  test('catches a relative image address', () => {
    const relative = withPageMeta(SHELL, guide, site).replaceAll('https://tools.example/og/', '/og/')
    assert.ok(checkHtml(guide, site, relative).some((p) => /not an absolute address/.test(p)))
  })

  test('the example site passes end to end, built pages included', async () => {
    const result = verifySite(await loadConfig(EXAMPLE), { html: true })
    assert.deepEqual(result.errors, [])
    assert.equal(result.checked.pages, 4)
    assert.equal(result.checked.html, true)
    assert.ok(result.checked.totalKB < 1200)
  })
})
