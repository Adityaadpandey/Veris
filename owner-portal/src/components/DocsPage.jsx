import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, NavLink, Navigate, useParams } from 'react-router-dom'
import './LandingPage/landing.css'
import './authenticity.css'
import './docs.css'
import SiteNav from './SiteNav'
import { guides } from './docs/pagesGuides'
import { system } from './docs/pagesSystem'
import { reference } from './docs/pagesReference'

const PAGES = [...guides, ...system, ...reference]
const GROUPS = [...new Set(PAGES.map((p) => p.group))]

function OnThisPage({ slug }) {
  const [heads, setHeads] = useState([])
  useEffect(() => {
    const els = [...document.querySelectorAll('.docs-article h2')]
    setHeads(els.map((e) => ({ id: e.id, text: e.textContent })))
  }, [slug])
  if (heads.length < 2) return null
  return (
    <aside className="docs-otp" aria-label="On this page">
      <b>On this page</b>
      <ul>{heads.map((h) => <li key={h.id}><a href={`#${h.id}`}>{h.text}</a></li>)}</ul>
    </aside>
  )
}

export default function DocsPage() {
  const { slug } = useParams()
  const index = PAGES.findIndex((p) => p.slug === slug)
  const page = PAGES[index]
  const prev = PAGES[index - 1]
  const next = PAGES[index + 1]
  const menuRef = useRef(null)
  const grouped = useMemo(() => GROUPS.map((g) => [g, PAGES.filter((p) => p.group === g)]), [])

  // The page list is always open on wide screens, and starts collapsed on phones.
  useEffect(() => { if (menuRef.current) menuRef.current.open = matchMedia('(min-width: 761px)').matches }, [slug])
  useEffect(() => { window.scrollTo(0, 0); if (page) document.title = `${page.title} · Veris docs` }, [page])
  useEffect(() => {
    if (!page || !window.location.hash) return
    document.getElementById(window.location.hash.slice(1))?.scrollIntoView()
  }, [page])

  if (!slug) return <Navigate to="/docs/overview" replace />
  if (!page) return <Navigate to="/docs/overview" replace />

  return (
    <div className="vl va">
      <SiteNav />
      <main className="wrap va-main docs">
        <div className="docs-grid">
          <nav className="docs-side" aria-label="Documentation">
            <details className="docs-menu" ref={menuRef}>
              <summary>Documentation</summary>
              {grouped.map(([g, items]) => (
                <div key={g} className="docs-group">
                  <b>{g}</b>
                  <ul>{items.map((p) => (
                    <li key={p.slug}><NavLink to={`/docs/${p.slug}`} className={({ isActive }) => (isActive ? 'on' : '')}>{p.title}</NavLink></li>
                  ))}</ul>
                </div>
              ))}
            </details>
          </nav>

          <article className="docs-article">
            <p className="docs-crumb">{page.group}</p>
            <h1>{page.title}</h1>
            <p className="docs-lede">{page.summary}</p>
            <div className="docs-content">{page.body}</div>

            <div className="docs-pager">
              {prev ? <Link to={`/docs/${prev.slug}`} className="prev"><small>Previous</small>{prev.title}</Link> : <span />}
              {next ? <Link to={`/docs/${next.slug}`} className="next"><small>Next</small>{next.title}</Link> : <span />}
            </div>
          </article>

          <OnThisPage slug={slug} />
        </div>
      </main>

      <footer className="va-foot">
        <Link to="/">Back to home</Link>
        <span>Veris is a prototype and runs on the Ethereum Sepolia and Arc testnets.</span>
      </footer>
    </div>
  )
}
