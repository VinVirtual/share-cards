// Two ways to look at the cards before shipping: a contact sheet of every card, and a page that
// imitates how a chat app unfurls each link (image, site, title, description).
import { existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { pathToFileURL } from 'node:url'
import { launchBrowser } from './browser.mjs'
import { escapeText } from './meta.mjs'

const SHEET_WIDTH = 1240
const CHAT_WIDTH = 1016
const esc = escapeText
const relUrl = (from, file) => relative(from, file).split('\\').join('/').split('/').map(encodeURIComponent).join('/')
const kb = (file) => (existsSync(file) ? `${Math.round(statSync(file).size / 1024)} KB` : 'not rendered')

/** A grid of every card with its page, template and file size underneath. */
export function contactSheetHtml(config, outDir) {
  const columns = config.pages.length > 6 ? 3 : 2
  const cards = config.pages.map((page) => `
      <figure>
        ${existsSync(page.imageFile) ? `<img src="${relUrl(outDir, page.imageFile)}" width="${config.width}" height="${config.height}" alt="" />` : '<div class="missing">not rendered</div>'}
        <figcaption><b>${esc(page.path)}</b><span>${esc(page.template)} · ${kb(page.imageFile)}</span></figcaption>
      </figure>`).join('')
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Card contact sheet</title>
    <style>
      * { box-sizing: border-box; margin: 0; }
      body { width: ${SHEET_WIDTH}px; padding: 36px; background: #24262b; color: #eef0f3; font: 16px/1.4 ui-monospace, 'SF Mono', Menlo, Consolas, 'DejaVu Sans Mono', monospace; }
      h1 { font-size: 15px; font-weight: 500; letter-spacing: 0.08em; text-transform: uppercase; color: #a9afba; margin-bottom: 24px; }
      .sheet { display: grid; grid-template-columns: repeat(${columns}, 1fr); gap: 32px 28px; }
      figure img, .missing { display: block; width: 100%; height: auto; aspect-ratio: ${config.width} / ${config.height}; border-radius: 4px; box-shadow: 0 10px 30px rgb(0 0 0 / 0.45); }
      .missing { display: grid; place-items: center; border: 1px dashed #6d7480; color: #a9afba; box-shadow: none; }
      figcaption { display: flex; justify-content: space-between; gap: 16px; margin-top: 10px; font-size: 14px; }
      figcaption span { color: #a9afba; white-space: nowrap; }
      figcaption b { font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    </style>
  </head>
  <body>
    <h1>${esc(config.siteName)} · ${config.pages.length} card${config.pages.length === 1 ? '' : 's'} · ${config.width}×${config.height}</h1>
    <div class="sheet">${cards}
    </div>
  </body>
</html>
`
}

const bubble = (config, outDir, page) => `
        <article class="message">
          <p class="link">${esc(page.url)}</p>
          <div class="unfurl">
            ${existsSync(page.imageFile) ? `<img src="${relUrl(outDir, page.imageFile)}" width="${config.width}" height="${config.height}" alt="" />` : '<div class="missing">no card yet</div>'}
            <div class="text">
              <p class="host">${esc(config.host)}</p>
              <p class="title">${esc(page.title)}</p>
              <p class="desc">${esc(page.description)}</p>
            </div>
          </div>
          <time>${esc(page.path)}</time>
        </article>`

/** Every page as a shared link in a made-up chat thread, in a light and a dark theme. */
export function chatPreviewHtml(config, outDir) {
  const thread = (theme) => `
      <section class="thread ${theme}" aria-label="${theme} chat">
        <header><span class="avatar">${esc(config.siteName.slice(0, 1).toUpperCase())}</span><div><b>Link check</b><small>${theme} theme</small></div></header>${config.pages.map((page) => bubble(config, outDir, page)).join('')}
      </section>`
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>How the links unfurl</title>
    <style>
      :root { --paper: #efe9df; --ink: #1c1a17; --soft: #6c655b; }
      * { box-sizing: border-box; margin: 0; }
      body { background: var(--paper); color: var(--ink); font: 16px/1.45 system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; padding: clamp(20px, 4vw, 56px); }
      .intro { max-width: 760px; margin-bottom: 40px; }
      .intro h1 { font: 700 clamp(30px, 4vw, 46px)/1.05 'Iowan Old Style', Palatino, Charter, 'Bitstream Charter', Georgia, serif; letter-spacing: -0.02em; }
      .intro p { margin-top: 12px; color: var(--soft); max-width: 62ch; }
      .threads { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 440px)); gap: 40px; align-items: start; }
      .thread { border-radius: 30px; padding: 0 16px 24px; overflow: hidden; box-shadow: 0 30px 60px -30px rgb(28 26 23 / 0.5); }
      .thread.light { --bg: #f4f5f7; --bubble: #ffffff; --card: #f0f1f4; --fg: #15171a; --dim: #676c75; --edge: #dfe1e6; --out: #dcebff; }
      .thread.dark { --bg: #111417; --bubble: #1e2328; --card: #171b1f; --fg: #eef0f2; --dim: #98a0aa; --edge: #2c3238; --out: #1d3a57; }
      .thread { background: var(--bg); color: var(--fg); }
      .thread header { display: flex; align-items: center; gap: 12px; margin: 0 -16px 20px; padding: 16px 20px; border-bottom: 1px solid var(--edge); }
      .thread header small { display: block; color: var(--dim); font-size: 13px; }
      .avatar { width: 38px; height: 38px; border-radius: 50%; display: grid; place-items: center; background: var(--out); font-weight: 700; }
      .message { margin: 0 0 18px auto; width: min(100%, 372px); background: var(--out); border-radius: 20px 20px 6px 20px; padding: 8px; }
      .link { padding: 4px 8px 8px; font-size: 15px; text-decoration: underline; text-underline-offset: 2px; overflow-wrap: anywhere; }
      .unfurl { background: var(--bubble); border-radius: 14px; overflow: hidden; border: 1px solid var(--edge); transition: transform 150ms ease-out; }
      .message:hover .unfurl { transform: translateY(-2px); }
      .unfurl img, .missing { display: block; width: 100%; height: auto; aspect-ratio: 1.91 / 1; object-fit: cover; }
      .missing { display: grid; place-items: center; color: var(--dim); background: var(--card); }
      .text { padding: 10px 12px 12px; }
      .host { font-size: 12px; letter-spacing: 0.04em; text-transform: uppercase; color: var(--dim); }
      .title { margin-top: 2px; font-weight: 650; line-height: 1.25; display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; overflow: hidden; }
      .desc { margin-top: 3px; font-size: 14px; line-height: 1.35; color: var(--dim); display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; overflow: hidden; }
      time { display: block; padding: 6px 8px 0; font-size: 12px; text-align: right; color: var(--dim); }
      @media (prefers-reduced-motion: reduce) { .unfurl { transition: none; } }
    </style>
  </head>
  <body>
    <div class="intro">
      <h1>How the links unfurl</h1>
      <p>An imitation of a chat app's link preview for each page of ${esc(config.siteName)}: the card, the site, the title and the description, cut to two lines. Real apps crop and trim in their own ways, so read this as a sanity check and then test one real link.</p>
    </div>
    <main class="threads">${thread('light')}${thread('dark')}
    </main>
  </body>
</html>
`
}

/** Write the contact sheet PNG, the chat page and a PNG of the chat page into `outDir`. */
export async function writePreview(config, { out, launch = launchBrowser, log = () => {} } = {}) {
  const outDir = out || join(config.root, 'cards-preview')
  mkdirSync(outDir, { recursive: true })
  const sheetHtml = join(outDir, 'contact-sheet.html'), chatHtml = join(outDir, 'chat-preview.html')
  writeFileSync(sheetHtml, contactSheetHtml(config, outDir))
  writeFileSync(chatHtml, chatPreviewHtml(config, outDir))
  const { browser } = await launch({ log })
  try {
    const shots = [[sheetHtml, join(outDir, 'contact-sheet.png'), SHEET_WIDTH], [chatHtml, join(outDir, 'chat-preview.png'), CHAT_WIDTH]]
    for (const [html, png, width] of shots) {
      const page = await browser.newPage({ viewport: { width, height: 800 }, deviceScaleFactor: 1 })
      await page.goto(pathToFileURL(html).href, { waitUntil: 'load' })
      await page.evaluate(() => Promise.all([...document.images].map((img) => img.decode().catch(() => {}))))
      await page.screenshot({ path: png, fullPage: true, type: 'png' })
      await page.close()
    }
  } finally {
    await browser.close().catch(() => {})
  }
  return { outDir, files: ['contact-sheet.png', 'contact-sheet.html', 'chat-preview.html', 'chat-preview.png'].map((name) => join(outDir, name)) }
}
