// Vite plugin: after `vite build`, write one HTML file per page with its own share tags.
//
//   import shareCards from 'share-cards/vite'
//   export default { plugins: [shareCards()] }
//
// Options: config (path to cards.config.json/.mjs, relative to the Vite root), addMissing (add tags
// the page shell lacks instead of failing). Cards themselves are drawn by `cards render`, not here.
import { resolve } from 'node:path'
import { loadConfig } from './lib/config.mjs'
import { injectSite } from './lib/inject.mjs'

export default function shareCards({ config = '.', addMissing = false } = {}) {
  let root = process.cwd()
  let outDir = resolve(root, 'dist')
  let failed = false
  return {
    name: 'share-cards',
    apply: 'build',
    configResolved(resolved) {
      root = resolved.root
      outDir = resolve(resolved.root, resolved.build.outDir)
    },
    buildEnd(error) {
      failed = Boolean(error)
    },
    async closeBundle() {
      if (failed) return
      const cards = await loadConfig(resolve(root, config))
      const files = injectSite(cards, { dist: outDir, addMissing })
      console.log(`share-cards: wrote share tags into ${files.length} page${files.length === 1 ? '' : 's'}`)
    },
  }
}
