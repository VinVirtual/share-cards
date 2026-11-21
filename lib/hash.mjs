// Incremental rendering: a card is drawn again only when something that shapes it has changed.
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'

/** Bump when the renderer changes in a way that alters every card. */
export const RENDER_VERSION = 1

const stable = (value) => {
  if (Array.isArray(value)) return value.map(stable)
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]))
  return value
}

/**
 * One hash for everything that decides how a card looks: its text and settings (`data`) and the
 * bytes of every file it draws from (`files`: template, runtime, art, logo, fonts), keyed by role.
 */
export function cardHash({ data, files = {} }) {
  const hash = createHash('sha256')
  hash.update(JSON.stringify(stable({ version: RENDER_VERSION, data })))
  for (const role of Object.keys(files).sort()) {
    hash.update(`\n${role}\n`)
    hash.update(files[role])
  }
  return hash.digest('hex')
}

/** Split jobs into those to draw and those already up to date. `exists` says whether an image file is on disk. */
export function planRender(jobs, lock = {}, { exists = existsSync, force = false } = {}) {
  const stale = [], fresh = []
  for (const job of jobs) {
    const upToDate = !force && lock[job.image]?.hash === job.hash && exists(job.imageFile)
    ;(upToDate ? fresh : stale).push(job)
  }
  return { stale, fresh }
}

export function readLock(file) {
  if (!existsSync(file)) return {}
  try { return JSON.parse(readFileSync(file, 'utf8')).cards || {} } catch { return {} }
}

export function writeLock(file, cards) {
  const sorted = Object.fromEntries(Object.keys(cards).sort().map((key) => [key, cards[key]]))
  writeFileSync(file, `${JSON.stringify({ note: 'Written by share-cards. Commit it so unchanged cards are not drawn again.', cards: sorted }, null, 2)}\n`)
}
