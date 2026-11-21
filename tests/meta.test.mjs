import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { escapeAttr, headSnippet, readPageMeta, withPageMeta } from '../lib/meta.mjs'
import { SHELL, config } from './helpers.mjs'

const site = config()
const [home, guide] = site.pages

describe('writing share tags into a page', () => {
  test('fills title, description, canonical, og and twitter tags for the page', () => {
    const found = readPageMeta(withPageMeta(SHELL, guide, site))
    assert.equal(found.title, 'Your first loan | Tool Shed')
    assert.equal(found.canonical, 'https://tools.example/guides/first-loan')
    assert.equal(found.meta.description, guide.description)
    assert.equal(found.meta['og:title'], guide.title)
    assert.equal(found.meta['og:description'], guide.description)
    assert.equal(found.meta['og:url'], 'https://tools.example/guides/first-loan')
    assert.equal(found.meta['og:image'], 'https://tools.example/og/guides-first-loan.jpg')
    assert.equal(found.meta['twitter:card'], 'summary_large_image')
    assert.equal(found.meta['twitter:title'], guide.title)
    assert.equal(found.meta['twitter:image'], 'https://tools.example/og/guides-first-loan.jpg')
  })

  test('the home page gets the site address with a trailing slash', () => {
    assert.equal(readPageMeta(withPageMeta(SHELL, home, site)).canonical, 'https://tools.example/')
  })

  test('escapes quotes, ampersands and angle brackets so a value cannot end its tag', () => {
    const risky = { ...guide, title: 'Saws <b>&</b> "levels"', description: 'She said "hi" & left <script>' }
    const html = withPageMeta(SHELL, risky, site)
    assert.match(html, /<title>Saws &lt;b&gt;&amp;&lt;\/b&gt; "levels"<\/title>/)
    assert.match(html, /name="description" content="She said &quot;hi&quot; &amp; left &lt;script&gt;"/)
    assert.doesNotMatch(html, /<script>/)
    assert.equal(readPageMeta(html).meta.description, risky.description)
    assert.equal(escapeAttr('a"b'), 'a&quot;b')
  })

  test('keeps dollar signs and backslashes exactly as written', () => {
    const odd = { ...guide, description: 'Costs $1 or $& and a \\ slash' }
    assert.equal(readPageMeta(withPageMeta(SHELL, odd, site)).meta.description, odd.description)
  })

  test('fails loudly, naming every missing tag', () => {
    const bare = SHELL.replace(/\s*<meta property="og:image"[^>]*>/, '').replace(/\s*<link rel="canonical"[^>]*>/, '')
    assert.throws(() => withPageMeta(bare, guide, site), (error) => {
      assert.match(error.message, /<link rel="canonical">/)
      assert.match(error.message, /<meta property="og:image">/)
      assert.match(error.message, /\/guides\/first-loan/)
      assert.doesNotMatch(error.message, /og:title/)
      return true
    })
  })

  test('a page with no title tag is refused', () => {
    assert.throws(() => withPageMeta(SHELL.replace(/<title>.*<\/title>/, ''), guide, site), /<title>/)
  })

  test('addMissing inserts the tags the shell lacks, before </head>', () => {
    const bare = '<html><head><meta charset="utf-8" /></head><body></body></html>'
    const html = withPageMeta(bare, guide, site, { addMissing: true })
    const found = readPageMeta(html)
    assert.equal(found.title, guide.title)
    assert.equal(found.meta['og:image:width'], '1200')
    assert.equal(found.meta['og:site_name'], 'Tool Shed')
    assert.ok(html.indexOf('og:image') < html.indexOf('</head>'))
  })

  test('copes with single quotes, other attribute orders and tags that are not self-closed', () => {
    const shell = SHELL
      .replace('<meta name="description" content="shell" />', "<meta content='old' name='description'>")
      .replace('<meta property="og:url" content="" />', '<meta property="og:url">')
    const html = withPageMeta(shell, guide, site)
    assert.match(html, /<meta content="What to bring &amp; what &quot;clean&quot; means\." name='description'>/)
    assert.match(html, /<meta property="og:url" content="https:\/\/tools\.example\/guides\/first-loan">/)
  })

  test('running it twice changes nothing more', () => {
    const once = withPageMeta(SHELL, guide, site)
    assert.equal(withPageMeta(once, guide, site), once)
  })

  test('leaves the rest of the page alone', () => {
    const html = withPageMeta(SHELL, guide, site)
    assert.match(html, /<meta charset="utf-8" \/>/)
    assert.match(html, /<body><div id="app"><\/div><\/body>/)
  })

  test('a version stamp goes on the image address when the page carries one', () => {
    const found = readPageMeta(withPageMeta(SHELL, { ...guide, imageVersion: 'abc12345' }, site))
    assert.equal(found.meta['og:image'], 'https://tools.example/og/guides-first-loan.jpg?v=abc12345')
  })

  test('the head snippet is itself a shell that can be filled', () => {
    const shell = `<html><head>${headSnippet(home, site)}</head></html>`
    assert.equal(readPageMeta(withPageMeta(shell, guide, site)).meta['og:title'], guide.title)
  })
})
