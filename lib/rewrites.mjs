// Host rules that make /page serve /page/index.html. Printed for the user to paste, never written for them.

const ownPages = (config) => config.pages.filter((page) => page.path !== '/')

/** The "rewrites" list for vercel.json. */
export const vercelRewrites = (config) => ownPages(config).map((page) => ({ source: page.path, destination: `/${page.htmlFile}` }))

/** Lines for a Netlify `_redirects` file. */
export const netlifyRedirects = (config) => ownPages(config).map((page) => `${page.path}  /${page.htmlFile}  200`)

/** The same rules as netlify.toml blocks. */
export const netlifyToml = (config) => ownPages(config).map((page) => `[[redirects]]\n  from = "${page.path}"\n  to = "/${page.htmlFile}"\n  status = 200`).join('\n\n')

export const REWRITE_HOSTS = Object.freeze(['vercel', 'netlify', 'netlify-toml'])

/** The text to paste for one host, with a comment on where it goes. */
export function printRewrites(config, host, { spaFallback = false } = {}) {
  if (host === 'vercel') {
    const rewrites = [...vercelRewrites(config), ...(spaFallback ? [{ source: '/(.*)', destination: '/index.html' }] : [])]
    return JSON.stringify({ rewrites }, null, 2)
  }
  if (host === 'netlify') return [...netlifyRedirects(config), ...(spaFallback ? ['/*  /index.html  200'] : [])].join('\n')
  if (host === 'netlify-toml') return netlifyToml(config) + (spaFallback ? '\n\n[[redirects]]\n  from = "/*"\n  to = "/index.html"\n  status = 200' : '')
  throw new Error(`Unknown host "${host}". Use one of: ${REWRITE_HOSTS.join(', ')}`)
}
