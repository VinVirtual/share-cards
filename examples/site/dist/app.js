// A single-page app in miniature: one HTML shell, and the page is chosen from the address in the browser.
// Link-preview crawlers never run this file, which is why every page needs its own HTML with its own tags.
const PAGES = {
  '/': { kicker: 'Example site', title: 'Borrow the tool, skip the shelf', body: 'Quillmoss is a made-up neighbourhood tool library. Reserve what you need, collect it, and bring it back for the next person.' },
  '/catalogue': { kicker: 'Catalogue', title: 'What is on the wall', body: 'Saws, levels, drills and ladders. Each one comes with a plain note on what it is good for and what to check before you start.' },
  '/how-it-works': { kicker: 'How it works', title: 'Reserve, collect, return', body: 'Pick a tool and a day. Collect it from the front desk. Hand it back clean, and tell us if anything felt loose.' },
  '/visit': { kicker: 'Visit', title: 'Find the front desk', body: 'The front desk is as made up as the rest of this site, but if it existed it would be open on weekend mornings.' },
}

const el = (tag, className, text) => {
  const node = document.createElement(tag)
  if (className) node.className = className
  node.textContent = text
  return node
}

function show(path) {
  const key = path.replace(/\/(index\.html)?$/, '') || '/'
  const page = PAGES[key] || { kicker: 'Not found', title: 'Nothing here', body: 'That page is not part of the example.' }
  document.getElementById('page').replaceChildren(el('p', 'kicker', page.kicker), el('h1', '', page.title), el('p', 'body', page.body))
  for (const link of document.querySelectorAll('nav a')) link.toggleAttribute('aria-current', link.getAttribute('href') === key)
}

document.addEventListener('click', (event) => {
  const link = event.target.closest('a[href^="/"]')
  if (!link) return
  event.preventDefault()
  history.pushState(null, '', link.getAttribute('href'))
  show(location.pathname)
})
addEventListener('popstate', () => show(location.pathname))
show(location.pathname)
