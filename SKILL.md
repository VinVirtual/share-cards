---
name: share-cards
description: Make link-preview images (1200x630 Open Graph cards) for every page of a website from one HTML template, and write each page's own title, description, canonical address and image tags into its HTML at build time, so links shared in chat apps and on social sites show the right preview even for single-page apps. Use whenever the user wants Open Graph images, OG cards, social cards, share images, link previews, "the preview when I paste my link", twitter cards, og:image or meta tags per page, or says a shared link shows the wrong title or picture, the same preview for every page, or no preview at all.
---

# share-cards

Preview crawlers (chat apps, social sites, search) read the HTML a server sends and **do not run JavaScript**. A single-page app sends the same HTML for every address, so every link shows the same preview. share-cards fixes both halves:

1. **render**: one HTML template + a list of pages → one 1200x630 JPEG per page, drawn in a headless browser.
2. **inject**: the built `index.html` → one HTML file per page, each with its own `<title>`, description, canonical, `og:*` and `twitter:*` tags.

Skill folder: `~/.claude/skills/share-cards/` (written below as `$S`). Every command is `$S/cards <command> [dir]`, where `[dir]` holds `cards.config.json`. `$S/cards help` lists them.

```
$S/cards                    the command line
$S/lib/                     config, tag injection, rendering, verify, preview, rewrites
$S/templates/               editorial.html, minimal.html, technical.html, runtime.js
$S/vite-plugin.mjs          runs inject after `vite build`
$S/references/templates.md  slots, variables, and how to write your own template
$S/examples/site/           a 4-page example with its cards and injected pages
$S/README.md                config reference, framework notes, limits
```

## Workflow

1. **Check the machine**: `$S/cards check`. Only `render` and `preview` need a browser.
2. **Find the pages.** Read the project's router or content folder and list every public address. Find where static files are served from (`public/`, `static/`) and where the build goes (`dist/`, `build/`, `out/`).
3. **Scaffold**: `$S/cards init <project>` (add `--mjs` when the page list should be built from the project's own route or content data, so it cannot drift). Set `siteUrl` (the real `https://` origin), `siteName`, `imageDir` (inside the static folder, e.g. `public/og`), `imageUrlPath` (where that folder is served, e.g. `/og`) and `dist`.
4. **Write each page's entry**:
   - `title`: the full page title as it should appear in the preview.
   - `description`: one sentence, 160 characters at most.
   - `cardTitle`: the words drawn on the card. Keep it short (about 2 to 6 words). `*stars*` mark words drawn in the accent colour.
   - `cardDescription` (optional, a shorter line for the card), `kicker` (small label), `art` (an image file from the project), `template` (per-page override).
   - Never invent facts, numbers or quotes for these. Take the words from the page itself.
5. **Pick a template and theme.** `editorial` (paper, heavy serif), `minimal` (white, quiet), `technical` (dark, monospace). Set `theme` to the project's own colours. For anything else run `$S/cards eject <name> card.html`, edit it, and set `"template": "./card.html"`. See `references/templates.md`.
6. **Render**: `$S/cards render <project>`. Read every warning: a cut-off title or description means the text must be shortened.
7. **Look at the result.** `$S/cards preview <project>` writes `cards-preview/contact-sheet.png` and `chat-preview.png`. **Read both PNGs.** Check each card for cut-off words, crowding, weak contrast and art that hides text. Fix and render again. Do not tell the user the cards look right unless you have looked.
8. **Prepare the page shell.** `inject` fills tags that already exist and fails if one is missing. Run `$S/cards tags <project>` and paste the block into the `<head>` of the source `index.html`, replacing any old share tags (or pass `--add-missing`).
9. **Wire it into the build**:
   - Vite: add `shareCards()` from `$S/vite-plugin.mjs` to `plugins` (see README).
   - Anything else: run `$S/cards inject <project>` after the build command.
10. **Host rules**: if the host has a catch-all rewrite to `/index.html`, print page rules with `$S/cards rewrites vercel|netlify|netlify-toml <project>` and place them **before** the catch-all. Show the user the rules; do not edit host config without saying so.
11. **Verify**: build the site, then `$S/cards verify <project>`. It must end with `All good.`
12. **Tell the user what is left**: deploy, then paste one real link into a chat app. Previews are cached by each app, sometimes for days; set `"versionImages": true` to change the image address whenever a card changes.

## Rules

- `siteUrl` must be the production origin. Preview images need absolute `https://` addresses.
- Render cards before the build so the build copies them, and commit the cards and `cards.lock.json`. CI then needs no browser.
- Nothing is fetched from the network while rendering unless the config sets `"allowNetwork": true`. Web fonts must be local files listed under `fonts`.
- Fonts default to system stacks, so cards drawn on another machine can differ. For identical output everywhere, add font files to the project (check their licence) and list them under `fonts`.
- Say plainly what was not checked: the real crawler of each app, and the host's routing once deployed.
