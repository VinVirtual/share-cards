// Starter config for a new project. The pages are placeholders to replace.
import { existsSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { CONFIG_NAMES } from './config.mjs'

export const STARTER = Object.freeze({
  siteUrl: 'https://example.com',
  siteName: 'Example Site',
  template: 'editorial',
  imageDir: 'public/og',
  imageUrlPath: '/og',
  dist: 'dist',
  theme: { accent: '#d8401f' },
  pages: [
    { path: '/', title: 'Example Site', description: 'One sentence that says what this site is, under 160 characters.', kicker: 'Home' },
    { path: '/about', title: 'About | Example Site', cardTitle: 'About *us*', description: 'One sentence about this page. Stars in cardTitle mark the words drawn in the accent colour.', kicker: 'About' },
    { path: '/pricing', title: 'Pricing | Example Site', cardTitle: 'Pricing', description: 'One sentence about this page.', kicker: 'Plans', template: 'minimal' },
  ],
})

const asModule = (config) => `// share-cards config. Build the page list from your own routes or content here.
export default ${JSON.stringify(config, null, 2)}
`

/** Write a starter config into `dir`. Refuses to replace one that is already there. */
export function writeStarter(dir, { mjs = false } = {}) {
  const existing = CONFIG_NAMES.map((name) => join(dir, name)).find((file) => existsSync(file))
  if (existing) throw new Error(`${existing} already exists; edit it instead`)
  const file = join(dir, mjs ? 'cards.config.mjs' : 'cards.config.json')
  writeFileSync(file, mjs ? asModule(STARTER) : `${JSON.stringify(STARTER, null, 2)}\n`)
  return file
}
