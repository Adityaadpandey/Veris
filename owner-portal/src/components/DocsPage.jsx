import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { GROUPS, SECTIONS } from './Docs/sections'
import './Docs/docs.css'

const VERIFY_URL = 'https://veris.live/claim'

function snippet(text, q) {
  const i = text.toLowerCase().indexOf(q)
  if (i < 0) return text.slice(0, 120)
  const start = Math.max(0, i - 50)
  return (start ? '…' : '') + text.slice(start, i + q.length + 90) + '…'
}

export default function DocsPage() {
  const [active, setActive] = useState(SECTIONS[0].id)
  const [subs, setSubs] = useState({})
  const [activeSub, setActiveSub] = useState('')
  const [query, setQuery] = useState('')
  const [menuOpen, setMenuOpen] = useState(false)
  const texts = useRef({})
  const searchRef = useRef(null)

  useEffect(() => {
    document.title = 'Veris docs'
    const found = {}
    SECTIONS.forEach((s) => {
      const el = document.getElementById(s.id)
      if (!el) return
      texts.current[s.id] = (s.title + ' ' + s.keywords + ' ' + el.textContent).replace(/\s+/g, ' ')
      found[s.id] = [...el.querySelectorAll('h3')].map((h) => ({ id: h.id, text: h.firstChild.textContent }))
    })
    setSubs(found)
    if (window.location.hash) {
      const t = document.getElementById(decodeURIComponent(window.location.hash.slice(1)))
      if (t) t.scrollIntoView()
    }
  }, [])

  // Scrollspy: the last section / subsection whose heading has passed the top offset.
  useEffect(() => {
    let raf = 0
    const update = () => {
      raf = 0
      let cur = SECTIONS[0].id
      SECTIONS.forEach((s) => {
        const el = document.getElementById(s.id)
        if (el && el.getBoundingClientRect().top <= 120) cur = s.id
      })
      setActive(cur)
      let sub = ''
      document.querySelectorAll(`#${cur} h3`).forEach((h) => { if (h.getBoundingClientRect().top <= 120) sub = h.id })
      setActiveSub(sub)
    }
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(update) }
    window.addEventListener('scroll', onScroll, { passive: true })
    update()
    return () => { window.removeEventListener('scroll', onScroll); cancelAnimationFrame(raf) }
  }, [])

  // "/" or Ctrl/Cmd+K focuses search, Escape clears it.
  useEffect(() => {
    const onKey = (e) => {
      const typing = /input|textarea/i.test(document.activeElement?.tagName || '')
      if ((e.key === '/' && !typing) || ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k')) {
        e.preventDefault()
        setMenuOpen(true)
        searchRef.current?.focus()
      } else if (e.key === 'Escape') {
        setQuery('')
        setMenuOpen(false)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  const q = query.trim().toLowerCase()
  const results = useMemo(() => {
    if (!q) return []
    return SECTIONS.filter((s) => (texts.current[s.id] || s.title).toLowerCase().includes(q))
      .map((s) => ({ s, text: snippet(texts.current[s.id] || s.title, q) }))
  }, [q])

  const closeMenu = useCallback(() => { setMenuOpen(false); setQuery('') }, [])
  const idx = SECTIONS.findIndex((s) => s.id === active)
  const prev = SECTIONS[idx - 1]
  const next = SECTIONS[idx + 1]

  return (
    <div className="vd">
      <a className="vd-skip" href="#main">Skip to content</a>
      <header className="vd-top">
        <button type="button" className="vd-menu" aria-label="Toggle navigation" aria-expanded={menuOpen} onClick={() => setMenuOpen((o) => !o)}>
          <span /><span /><span />
        </button>
        <Link to="/" className="vd-brand" aria-label="Veris home">Veris <span>Docs</span></Link>
        <div className="vd-search">
          <input
            ref={searchRef}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search the docs"
            aria-label="Search the docs"
          />
          <kbd>/</kbd>
        </div>
        <nav className="vd-links" aria-label="Site">
          <Link to="/">Home</Link>
          <a href={VERIFY_URL} target="_blank" rel="noopener noreferrer">Verify a photo</a>
          <Link to="/dashboard" className="vd-cta">Owner portal</Link>
        </nav>
      </header>

      <div className="vd-body">
        {menuOpen && <div className="vd-scrim" onClick={closeMenu} />}
        <aside className={`vd-side${menuOpen ? ' open' : ''}`} aria-label="Documentation">
          {q ? (
            <div className="vd-results">
              <p className="vd-results-h">{results.length ? `${results.length} result${results.length > 1 ? 's' : ''}` : 'No results'}</p>
              {results.map(({ s, text }) => (
                <a key={s.id} href={`#${s.id}`} onClick={closeMenu}>
                  <strong>{s.title}</strong>
                  <span>{text}</span>
                </a>
              ))}
            </div>
          ) : (
            <nav>
              {GROUPS.map((g) => (
                <div className="vd-group" key={g.title}>
                  <p>{g.title}</p>
                  {g.items.map((s) => (
                    <div key={s.id}>
                      <a href={`#${s.id}`} className={active === s.id ? 'on' : ''} aria-current={active === s.id ? 'true' : undefined} onClick={closeMenu}>{s.title}</a>
                      {active === s.id && subs[s.id]?.length > 0 && (
                        <ul>
                          {subs[s.id].map((h) => (
                            <li key={h.id}><a href={`#${h.id}`} className={activeSub === h.id ? 'on' : ''} onClick={closeMenu}>{h.text}</a></li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ))}
                </div>
              ))}
            </nav>
          )}
        </aside>

        <main id="main" className="vd-main">
          {SECTIONS.map((s) => (
            <section key={s.id} id={s.id} aria-labelledby={`${s.id}-h`}>
              <p className="vd-eyebrow">{s.group}</p>
              <h2 id={`${s.id}-h`}>{s.title}</h2>
              {s.body}
            </section>
          ))}
          <div className="vd-pager">
            {prev ? <a href={`#${prev.id}`}><small>Previous</small>{prev.title}</a> : <span />}
            {next ? <a href={`#${next.id}`} className="next"><small>Next</small>{next.title}</a> : <span />}
          </div>
          <footer className="vd-foot">
            Veris is a prototype and runs on the Ethereum Sepolia testnet.
          </footer>
        </main>
      </div>
    </div>
  )
}
