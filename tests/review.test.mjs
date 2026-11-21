import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { validateConfig } from '../lib/config.mjs'
import { linkedFiles } from '../lib/render.mjs'

const config = (path) => ({ siteUrl: 'https://example.com', siteName: 'Example', pages: [{ path, title: 'T', description: 'D' }] })
const errors = (path) => validateConfig(config(path)).filter((problem) => problem.level === 'error')

test('a page path cannot climb out of the build folder', () => {
  for (const path of ['/../../escaped', '/a/../b', '/a/./b', '//x', '/a//b']) assert.ok(errors(path).length > 0, path)
  assert.equal(errors('/guides/first-loan').length, 0)
})

test('a page path cannot contain characters hosts read as patterns', () => {
  for (const path of ['/a:b', '/a*', '/(a)', '/a+b']) assert.ok(errors(path).length > 0, path)
})

test('local files a template links are part of what is hashed', () => {
  const dir = mkdtempSync(join(tmpdir(), 'cards-linked-'))
  mkdirSync(join(dir, 'img'))
  writeFileSync(join(dir, 'extra.css'), 'body{}')
  writeFileSync(join(dir, 'img', 'a.svg'), '<svg/>')
  const html = '<link rel="stylesheet" href="extra.css"><img src=\'img/a.svg\'><script src="https://example.com/x.js"></script><a href="#top"></a><img src="missing.png">'
  const found = linkedFiles(join(dir, 'card.html'), html)
  assert.deepEqual(Object.keys(found).sort(), ['linked:extra.css', 'linked:img/a.svg'])
  assert.equal(String(found['linked:extra.css']), 'body{}')
})
