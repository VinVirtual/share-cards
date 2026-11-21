# Templates

A template is one plain HTML file with CSS. It has no build step and no script of its own. The renderer opens it at 1200x630, adds `templates/runtime.js`, and calls `fillCard(data)`.

## Built-in templates

| Name | Look | Title type | Art |
|---|---|---|---|
| `editorial` | warm paper, masthead rule, one loud accent | heavy serif, 50 to 104 px | full-height picture on the right; without art, an accent disc and an ink ring |
| `minimal` | near-white, a lot of empty space, one accent dot | semibold sans, 42 to 84 px | tall rounded picture on the right; without art, text only |
| `technical` | near-black, drafting grid, frame with corner marks | bold sans with monospace labels, 42 to 82 px | square framed panel; without art, a drawn scope |

## Slots

An element with `data-slot="name"` receives that value. Text goes in as text, never as HTML. An `<img data-slot>` gets the file as its `src`. When a value is empty the element is hidden.

| Slot | Value |
|---|---|
| `title` | the page's `cardTitle` (falls back to `title`). `*stars*` become `<em>` |
| `description` | `cardDescription` (falls back to `description`) |
| `kicker` | the page's `kicker` |
| `site` | `siteName` |
| `domain` | the host of `siteUrl`, e.g. `example.com` |
| `path` | the page path, e.g. `/pricing` |
| `address` | host and path together, e.g. `example.com/pricing` |
| `logo` | the `logo` file (use on an `<img>`) |
| `art` | the page's `art` file (use on an `<img>`) |

`<body>` also gets one class per optional value: `has-art` or `no-art`, `has-logo` or `no-logo`, `has-kicker` or `no-kicker`, `has-description` or `no-description`. Use them to change the layout.

## Variables

Everything in the config's `theme` becomes a CSS variable on `:root`: `"accent"` sets `--accent`, `"fontDisplay"` sets `--font-display`. The built-in templates read:

| Variable | editorial | minimal | technical |
|---|---|---|---|
| `accent` | `#d8401f` | `#2747d8` | `#5ee6a8` |
| `background` | `#f2ebdd` | `#fbfaf7` | `#0a0d12` |
| `text` | `#17130e` | `#131416` | `#e9eef5` |
| `muted` | `#5b5245` | `#62656c` | `#93a0b3` |
| `line` | not used | `#d9d7d0` | `rgb(233 238 245 / 0.16)` |
| `fontDisplay` | serif stack | sans stack | sans stack |
| `fontBody` | sans stack | sans stack | not used |
| `fontMono` | not used | not used | monospace stack |

The logo is the `logo` setting at the top of the config (SVG or PNG; a mark that reads on both light and dark works with every template).

A theme applies to every template a config uses. If pages mix templates, either leave `theme` out or give each page its own ejected template.

If you change `background` or `text`, check the contrast yourself: the title against the background, and `muted` against the background (aim for 4.5:1 or better).

## Fitting long and short titles

- `data-fit="min max"` on an element makes the runtime start at `max` px and shrink in 2 px steps until the element fits.
- "Fits" is measured on the nearest ancestor with `data-fit-box`: it must not scroll. Give that box a fixed position and size and `overflow: hidden`.
- If the text still does not fit at `min`, elements marked `data-fit-drop` inside the box are hidden (the built-ins drop the description).
- If it still does not fit, words are cut from the end, an ellipsis is added, and `cards render` prints a warning naming the page.

Use `margin-top: auto` to push content to the bottom of the box. Do not use `justify-content: flex-end`: content that overflows upward cannot be measured.

## Fonts

The built-in templates use system font stacks, so nothing is bundled and nothing is downloaded. To use your own typeface, put the font file in your project and list it:

```json
"fonts": [{ "family": "My Display", "file": "fonts/MyDisplay-Bold.woff2", "weight": "700" }],
"theme": { "fontDisplay": "'My Display', serif" }
```

The renderer declares the face, waits until it has loaded, and fails if it does not. Check the font's licence before committing the file.

## Writing your own

```bash
cards eject editorial card.html     # copy a built-in as a starting point
```

Then set `"template": "./card.html"` for the whole site or for one page. The file must lay out exactly 1200x630 (or the `width` and `height` in your config) with `overflow: hidden` on `html, body`. Requests to the network are blocked while rendering unless the config sets `"allowNetwork": true`.
