// Runs inside the card page. The renderer adds this file to a template and calls fillCard(data).
// It fills every [data-slot], applies theme variables, and shrinks [data-fit] text until it fits.
;(() => {
  const kebab = (name) => name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)

  /** "Borrow a drill, *not* a shelf" -> text nodes and <em> for the starred part. Never parses HTML. */
  const setRichText = (el, text) => {
    el.textContent = ''
    for (const [i, part] of String(text).split('*').entries()) {
      if (!part) continue
      if (i % 2 === 1) { const em = document.createElement('em'); em.textContent = part; el.append(em) } else el.append(part)
    }
  }

  /** an odd number of stars means an emphasis was cut in half: close it */
  const closeStars = (text) => ((text.match(/\*/g) || []).length % 2 ? `${text}*` : text)

  const overflows = (box, el) => box.scrollHeight > box.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1 || box.scrollWidth > box.clientWidth + 1

  /** Largest size between max and min (px) at which `el` fits inside its [data-fit-box]. */
  const fit = (el, warnings) => {
    const [min, max] = el.dataset.fit.split(/[\s,]+/).map(Number)
    const box = el.closest('[data-fit-box]') || el.parentElement
    let size = max
    el.style.fontSize = `${size}px`
    while (size > min && overflows(box, el)) { size -= 2; el.style.fontSize = `${size}px` }
    if (!overflows(box, el)) return
    // still too long at the smallest size: drop the supporting line, then cut words off the end
    for (const extra of box.querySelectorAll('[data-fit-drop]')) extra.hidden = true
    if (!overflows(box, el)) { warnings.push('the description was left off to make room for a long title'); return }
    // last resort: drop words from the end until it fits, and mark the cut
    const words = el.dataset.fullText.split(/\s+/)
    let keep = words.length
    do { keep -= 1; setRichText(el, `${closeStars(words.slice(0, keep).join(' ')).replace(/[\s,;:.!?-]+$/, '')}…`) } while (keep > 1 && overflows(box, el))
    warnings.push(`the title is too long: ${words.length - keep} word${words.length - keep === 1 ? ' was' : 's were'} cut from the end; shorten it or set cardTitle`)
  }

  window.fillCard = async (data) => {
    const warnings = []
    const root = document.documentElement
    for (const [name, value] of Object.entries(data.theme || {})) root.style.setProperty(`--${kebab(name)}`, value)

    const images = []
    for (const el of document.querySelectorAll('[data-slot]')) {
      const value = data[el.dataset.slot]
      if (!value) { el.hidden = true; continue }
      if (el.tagName === 'IMG') { el.src = value; images.push(el) }
      else if (el.dataset.slot === 'title') { el.dataset.fullText = value; setRichText(el, value) }
      else el.textContent = value
    }
    for (const name of ['kicker', 'description', 'art', 'logo']) document.body.classList.add(`${data[name] ? 'has' : 'no'}-${name}`)

    for (const img of images) {
      try { await img.decode() } catch { throw new Error(`could not load the image for "${img.dataset.slot}" (${img.src})`) }
    }
    for (const font of data.fonts || []) {
      const loaded = await document.fonts.load(`${font.style} ${font.weight} 40px "${font.family}"`)
      if (!loaded.length) throw new Error(`the font "${font.family}" (${font.weight} ${font.style}) did not load`)
    }
    void document.body.offsetHeight // lay the page out so every font it uses starts loading
    await document.fonts.ready
    for (const el of document.querySelectorAll('[data-fit]')) fit(el, warnings)
    for (const el of document.querySelectorAll('[data-slot="description"]:not([hidden])')) {
      if (el.scrollHeight > el.clientHeight + 1) warnings.push('the description does not fit on the card and ends in "…"; set a shorter cardDescription')
    }
    await document.fonts.ready
    await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)))
    return { warnings }
  }
})()
