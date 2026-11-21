import assert from 'node:assert/strict'
import { join } from 'node:path'
import { describe, test } from 'node:test'
import { cardHash, planRender, readLock, writeLock } from '../lib/hash.mjs'
import { tempDir } from './helpers.mjs'

const base = { data: { title: 'Hello', theme: { accent: '#f00', text: '#000' } }, files: { template: Buffer.from('<html>'), art: Buffer.from([1, 2, 3]) } }

describe('incremental hashing', () => {
  test('the same input gives the same hash', () => {
    assert.equal(cardHash(base), cardHash(structuredClone(base)))
    assert.match(cardHash(base), /^[0-9a-f]{64}$/)
  })

  test('key order does not matter', () => {
    const reordered = { data: { theme: { text: '#000', accent: '#f00' }, title: 'Hello' }, files: { art: base.files.art, template: base.files.template } }
    assert.equal(cardHash(reordered), cardHash(base))
  })

  test('changes when the text, the theme, the template or the art changes', () => {
    const original = cardHash(base)
    assert.notEqual(cardHash({ ...base, data: { ...base.data, title: 'Hello!' } }), original)
    assert.notEqual(cardHash({ ...base, data: { ...base.data, theme: { ...base.data.theme, accent: '#0f0' } } }), original)
    assert.notEqual(cardHash({ ...base, files: { ...base.files, template: Buffer.from('<html >') } }), original)
    assert.notEqual(cardHash({ ...base, files: { ...base.files, art: Buffer.from([1, 2, 4]) } }), original)
    assert.notEqual(cardHash({ ...base, files: { template: base.files.template } }), original)
  })

  test('the same bytes under a different role are a different card', () => {
    const bytes = Buffer.from('x')
    assert.notEqual(cardHash({ data: {}, files: { art: bytes } }), cardHash({ data: {}, files: { logo: bytes } }))
  })
})

describe('deciding what to draw', () => {
  const jobs = [{ image: 'home', imageFile: '/og/home.jpg', hash: 'aaa' }, { image: 'about', imageFile: '/og/about.jpg', hash: 'bbb' }]
  const onDisk = () => true

  test('nothing in the lock means everything is drawn', () => {
    assert.deepEqual(planRender(jobs, {}, { exists: onDisk }).stale.map((j) => j.image), ['home', 'about'])
  })

  test('a matching hash with the file on disk is skipped', () => {
    const plan = planRender(jobs, { home: { hash: 'aaa' }, about: { hash: 'old' } }, { exists: onDisk })
    assert.deepEqual(plan.fresh.map((j) => j.image), ['home'])
    assert.deepEqual(plan.stale.map((j) => j.image), ['about'])
  })

  test('a matching hash is drawn again when the image file is gone', () => {
    const plan = planRender(jobs, { home: { hash: 'aaa' }, about: { hash: 'bbb' } }, { exists: (file) => file !== '/og/home.jpg' })
    assert.deepEqual(plan.stale.map((j) => j.image), ['home'])
  })

  test('force draws everything', () => {
    assert.equal(planRender(jobs, { home: { hash: 'aaa' }, about: { hash: 'bbb' } }, { exists: onDisk, force: true }).stale.length, 2)
  })

  test('the lock file round-trips, sorted, and a broken one reads as empty', () => {
    const file = join(tempDir(), 'cards.lock.json')
    assert.deepEqual(readLock(file), {})
    writeLock(file, { b: { hash: '2' }, a: { hash: '1' } })
    assert.deepEqual(Object.keys(readLock(file)), ['a', 'b'])
  })
})
