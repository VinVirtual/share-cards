#!/usr/bin/env node
// share-cards command line. Run "cards help" for the list.
import { spawnSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, readdirSync, realpathSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { browserCandidates, findPlaywright, launchBrowser } from './browser.mjs'
import { BUILT_IN_TEMPLATES, SKILL, TEMPLATES_DIR, loadConfig } from './config.mjs'
import { writeStarter } from './init.mjs'
import { injectSite, pagesForTags } from './inject.mjs'
import { headSnippet } from './meta.mjs'
import { writePreview } from './preview.mjs'
import { DEFAULT_JOBS, renderCards } from './render.mjs'
import { REWRITE_HOSTS, printRewrites } from './rewrites.mjs'
import { verifySite } from './verify.mjs'

const HELP = `share-cards: link-preview images and share tags for every page of a site

  cards check                         is Node, playwright-core and a browser ready?
  cards init [dir] [--mjs]            write a starter cards.config.json (or .mjs)
  cards render [dir]                  draw every card that changed  [--force] [--only /path] [--jobs ${DEFAULT_JOBS}]
  cards inject [dir]                  write one HTML file per page  [--dist d] [--html file] [--out d] [--add-missing]
  cards verify [dir]                  check images, text and built pages  [--dist d] [--no-html] [--require-html]
  cards preview [dir]                 contact sheet PNG and a chat-style link preview  [--out d]
  cards build [dir]                   render, inject, then verify
  cards rewrites <host> [dir]         print host rules: ${REWRITE_HOSTS.join(' | ')}  [--spa]
  cards tags [dir]                    print the <head> tags a page shell needs  [--page /path]
  cards eject <template> [file]       copy a built-in template to edit: ${BUILT_IN_TEMPLATES.join(' | ')}
  cards test                          run the unit tests

[dir] is the folder holding the config (default: here), or the config file itself.`

const VALUE_FLAGS = new Set(['only', 'jobs', 'dist', 'html', 'out', 'page'])

/** ['render', 'site', '--only', '/a', '--force'] -> { rest: ['render', 'site'], flags: { only: ['/a'], force: true } } */
export function parseArgs(argv) {
  const rest = [], flags = {}
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (!arg.startsWith('--')) { rest.push(arg); continue }
    const [name, inline] = arg.slice(2).split(/=(.*)/s)
    if (!VALUE_FLAGS.has(name)) { flags[name] = true; continue }
    const value = inline ?? argv[++i]
    if (value === undefined) throw new Error(`--${name} needs a value`)
    flags[name] = [...(flags[name] || []), value]
  }
  return { rest, flags }
}

const last = (list) => (list ? list[list.length - 1] : undefined)
const say = (line) => console.log(line)
const listed = (title, lines) => { if (lines.length) { say(title); for (const line of lines) say(`  - ${line}`) } }

async function check() {
  let ok = true
  const major = Number(process.versions.node.split('.')[0])
  say(`${major >= 18 ? 'ok  ' : 'FAIL'} Node ${process.versions.node}${major >= 18 ? '' : ' (18 or newer is needed)'}`)
  ok &&= major >= 18
  try {
    const { chromium, from } = findPlaywright()
    say(`ok   playwright-core from ${from}`)
    for (const candidate of browserCandidates(chromium)) say(`     ${candidate.present ? 'found  ' : 'missing'} ${candidate.label}`)
    const { browser, label } = await launchBrowser({ chromium, from })
    await browser.close()
    say(`ok   a browser starts: ${label}`)
  } catch (error) {
    ok = false
    say(`FAIL ${error.message}`)
  }
  say(`ok   templates: ${BUILT_IN_TEMPLATES.join(', ')} (${TEMPLATES_DIR})`)
  say(ok ? 'Ready.' : 'Not ready. Only render and preview need a browser; inject, verify, rewrites and tags work without one.')
  return ok ? 0 : 1
}

async function render(config, flags) {
  const jobs = Number(last(flags.jobs) ?? DEFAULT_JOBS)
  if (!Number.isInteger(jobs) || jobs < 1) throw new Error('--jobs must be a whole number of 1 or more')
  const result = await renderCards(config, { force: Boolean(flags.force), only: flags.only || [], jobs, log: say })
  say(`${result.drawn.length} drawn, ${result.skipped.length} unchanged${result.failures.length ? `, ${result.failures.length} failed` : ''}`)
  listed('Warnings:', result.warnings)
  listed('Failed:', result.failures)
  return result.failures.length ? 1 : 0
}

function inject(config, flags) {
  const dist = last(flags.dist) ? resolve(last(flags.dist)) : config.dist
  const files = injectSite(config, { dist, html: last(flags.html) && resolve(last(flags.html)), out: last(flags.out) && resolve(last(flags.out)), addMissing: Boolean(flags['add-missing']) })
  for (const file of files) say(`wrote ${file.file}`)
  say(`${files.length} page${files.length === 1 ? '' : 's'} written`)
  return 0
}

function verify(config, flags) {
  const dist = last(flags.dist) ? resolve(last(flags.dist)) : config.dist
  const html = flags['no-html'] ? false : flags['require-html'] ? true : 'auto'
  const { errors, warnings, checked } = verifySite(config, { dist, html })
  listed('Warnings:', warnings)
  listed('Problems:', errors)
  say(`${checked.pages} page${checked.pages === 1 ? '' : 's'} checked, cards total ${checked.totalKB} KB, built pages ${checked.html ? 'checked' : 'not checked (no built site found)'}`)
  say(errors.length ? `FAILED: ${errors.length} problem${errors.length === 1 ? '' : 's'}` : 'All good.')
  return errors.length ? 1 : 0
}

async function main(argv) {
  const { rest, flags } = parseArgs(argv)
  const [command = 'help', first, second] = rest
  if (command === 'help' || flags.help) { say(HELP); return 0 }
  if (command === 'check') return check()
  if (command === 'test') {
    const tests = readdirSync(join(SKILL, 'tests')).filter((name) => name.endsWith('.test.mjs')).map((name) => join(SKILL, 'tests', name))
    return spawnSync(process.execPath, ['--test', ...tests], { stdio: 'inherit' }).status ?? 1
  }
  if (command === 'init') {
    const dir = resolve(first || '.')
    mkdirSync(dir, { recursive: true })
    say(`wrote ${writeStarter(dir, { mjs: Boolean(flags.mjs) })}`)
    say('Next: edit the pages, then run "cards render" and "cards preview".')
    return 0
  }
  if (command === 'eject') {
    if (!BUILT_IN_TEMPLATES.includes(first)) throw new Error(`Pick a template to copy: ${BUILT_IN_TEMPLATES.join(', ')}`)
    const target = resolve(second || `${first}-card.html`)
    if (existsSync(target)) throw new Error(`${target} already exists`)
    copyFileSync(join(TEMPLATES_DIR, `${first}.html`), target)
    say(`wrote ${target}\nSet "template": "./${second || `${first}-card.html`}" in the config to use it.`)
    return 0
  }
  if (command === 'rewrites') {
    if (!REWRITE_HOSTS.includes(first)) throw new Error(`Say which host: cards rewrites <${REWRITE_HOSTS.join(' | ')}> [dir]`)
    say(printRewrites(await loadConfig(second), first, { spaFallback: Boolean(flags.spa) }))
    return 0
  }

  const config = await loadConfig(first)
  if (command === 'render') return render(config, flags)
  if (command === 'inject') return inject(config, flags)
  if (command === 'verify') return verify(config, flags)
  if (command === 'preview') {
    const { files } = await writePreview(config, { out: last(flags.out) && resolve(last(flags.out)), log: say })
    for (const file of files) say(`wrote ${file}`)
    return 0
  }
  if (command === 'build') return (await render(config, flags)) || inject(config, flags) || verify(config, flags)
  if (command === 'tags') {
    const pages = pagesForTags(config)
    const page = flags.page ? pages.find((entry) => entry.path === last(flags.page)) : pages[0]
    if (!page) throw new Error(`No page ${last(flags.page)} in the config`)
    say(headSnippet(page, config))
    return 0
  }
  throw new Error(`Unknown command "${command}".\n\n${HELP}`)
}

const isDirectRun = Boolean(process.argv[1]) && existsSync(process.argv[1]) && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href
if (isDirectRun) {
  main(process.argv.slice(2)).then((code) => { process.exitCode = code }, (error) => { console.error(error.message); process.exitCode = 1 })
}
