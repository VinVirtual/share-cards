import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { netlifyRedirects, printRewrites, vercelRewrites } from '../lib/rewrites.mjs'
import { config } from './helpers.mjs'

const site = config()

describe('host rewrite rules', () => {
  test('Vercel: one rule per page, the home page left out', () => {
    assert.deepEqual(vercelRewrites(site), [{ source: '/guides/first-loan', destination: '/guides/first-loan/index.html' }])
  })

  test('Vercel output is JSON that can be pasted into vercel.json', () => {
    assert.deepEqual(JSON.parse(printRewrites(site, 'vercel')), { rewrites: vercelRewrites(site) })
  })

  test('the single-page fallback goes last, so page rules win', () => {
    const { rewrites } = JSON.parse(printRewrites(site, 'vercel', { spaFallback: true }))
    assert.deepEqual(rewrites.at(-1), { source: '/(.*)', destination: '/index.html' })
    assert.equal(rewrites.length, 2)
    assert.equal(printRewrites(site, 'netlify', { spaFallback: true }).split('\n').at(-1), '/*  /index.html  200')
  })

  test('Netlify _redirects lines', () => {
    assert.deepEqual(netlifyRedirects(site), ['/guides/first-loan  /guides/first-loan/index.html  200'])
    assert.equal(printRewrites(site, 'netlify'), '/guides/first-loan  /guides/first-loan/index.html  200')
  })

  test('Netlify netlify.toml blocks', () => {
    assert.equal(printRewrites(site, 'netlify-toml'), '[[redirects]]\n  from = "/guides/first-loan"\n  to = "/guides/first-loan/index.html"\n  status = 200')
  })

  test('an unknown host is refused with the list of known ones', () => {
    assert.throws(() => printRewrites(site, 'ftp'), /vercel, netlify, netlify-toml/)
  })
})
