// Writes one HTML file per page from a built page shell, each with its own share tags.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve, sep } from 'node:path'
import { readLock } from './hash.mjs'
import { withPageMeta } from './meta.mjs'

/** Each page with the short version stamp that goes on its image address (only when versionImages is on). */
export function pagesForTags(config, lock = readLock(config.lockFile)) {
  return config.pages.map((page) => ({ ...page, imageVersion: config.versionImages && lock[page.image]?.hash ? lock[page.image].hash.slice(0, 8) : '' }))
}

/**
 * Read `<dist>/index.html` (or `html`) and write `<out>/<page>/index.html` for every page.
 * Nothing is written unless every page can be filled. Returns the files written.
 */
export function injectSite(config, { dist = config.dist, html, out, addMissing = false, lock } = {}) {
  const shellFile = html || join(dist, 'index.html')
  if (!existsSync(shellFile)) throw new Error(`No built page at ${shellFile}. Build the site first, or pass --html <file>.`)
  const shell = readFileSync(shellFile, 'utf8')
  const target = out || dist
  const failures = []
  const files = pagesForTags(config, lock).map((page) => {
    try { return { path: page.path, file: join(target, page.htmlFile), html: withPageMeta(shell, page, config, { addMissing }) } } catch (cause) { failures.push(cause.message); return null }
  })
  if (failures.length) throw new Error(failures[0] + (failures.length > 1 ? `\n(and the same for ${failures.length - 1} more page${failures.length > 2 ? 's' : ''})` : ''))
  const root = resolve(target) + sep
  for (const file of files) {
    if (!resolve(file.file).startsWith(root)) throw new Error(`${file.path} would be written outside ${target}`)
    mkdirSync(dirname(file.file), { recursive: true })
    writeFileSync(file.file, file.html)
  }
  return files.map(({ path, file }) => ({ path, file }))
}
