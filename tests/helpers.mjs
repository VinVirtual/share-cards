// Shared fixtures for the tests.
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { resolveConfig } from '../lib/config.mjs'

export const SHELL = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Shell</title>
    <meta name="description" content="shell" />
    <link rel="canonical" href="https://old.example/" />
    <meta property="og:title" content="shell" />
    <meta property="og:description" content="shell" />
    <meta property="og:url" content="" />
    <meta property="og:image" content="" />
    <meta name="twitter:card" content="summary" />
    <meta name="twitter:title" content="" />
    <meta name="twitter:description" content="" />
    <meta name="twitter:image" content="" />
  </head>
  <body><div id="app"></div></body>
</html>
`

export const RAW = Object.freeze({
  siteUrl: 'https://tools.example',
  siteName: 'Tool Shed',
  pages: [
    { path: '/', title: 'Tool Shed', description: 'Borrow tools.' },
    { path: '/guides/first-loan', title: 'Your first loan | Tool Shed', description: 'What to bring & what "clean" means.', kicker: 'Guide' },
  ],
})

export const tempDir = () => mkdtempSync(join(tmpdir(), 'share-cards-test-'))
export const config = (overrides = {}, root = '/project') => resolveConfig({ ...RAW, ...overrides }, root)

/** The smallest bytes that read as a JPEG of the given size, padded to `length`. */
export function fakeJpeg(width, height, length = 64) {
  const bytes = Buffer.alloc(Math.max(length, 24))
  Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00, 0xff, 0xc0, 0x00, 0x11, 0x08]).copy(bytes)
  bytes.writeUInt16BE(height, 13)
  bytes.writeUInt16BE(width, 15)
  return bytes
}
