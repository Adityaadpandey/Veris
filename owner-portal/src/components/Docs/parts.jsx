import { useState } from 'react'

export const slug = (text) =>
  String(text).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

export function H3({ children }) {
  const id = slug(children)
  return (
    <h3 id={id}>
      {children}
      <a className="vd-anchor" href={`#${id}`} aria-label={`Link to ${children}`}>#</a>
    </h3>
  )
}

export function Code({ lang, title, children }) {
  const [copied, setCopied] = useState(false)
  const text = String(children).replace(/^\n/, '').replace(/\s+$/, '')
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    } catch {
      /* clipboard unavailable */
    }
  }
  return (
    <figure className="vd-code">
      <figcaption>
        <span>{title || lang || ''}</span>
        <button type="button" onClick={copy} aria-label="Copy code to clipboard">{copied ? 'Copied' : 'Copy'}</button>
      </figcaption>
      <pre tabIndex={0}><code>{text}</code></pre>
    </figure>
  )
}

export function Table({ head, rows, wide }) {
  return (
    <div className={`vd-table${wide ? ' wide' : ''}`} tabIndex={0}>
      <table>
        <thead><tr>{head.map((h) => <th key={h}>{h}</th>)}</tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function Callout({ kind = 'note', title, children }) {
  return (
    <aside className={`vd-callout ${kind}`}>
      <strong>{title || { note: 'Note', warn: 'Warning', tip: 'Tip', status: 'Status' }[kind]}</strong>
      <div>{children}</div>
    </aside>
  )
}

export function Badge({ kind, children }) {
  return <span className={`vd-badge ${kind}`}>{children}</span>
}

export function Endpoint({ method, path, children }) {
  return (
    <div className="vd-endpoint">
      <div className="vd-endpoint-head">
        <span className={`vd-method ${method.toLowerCase()}`}>{method}</span>
        <code>{path}</code>
      </div>
      <div className="vd-endpoint-body">{children}</div>
    </div>
  )
}

export function Steps({ children }) {
  return <ol className="vd-steps">{children}</ol>
}
