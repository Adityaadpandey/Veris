// Small building blocks for the docs pages.
export const slugify = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

export const H2 = ({ children }) => <h2 id={slugify(String(children))}>{children}</h2>
export const H3 = ({ children }) => <h3 id={slugify(String(children))}>{children}</h3>

export function Code({ children, lang }) {
  return <pre data-lang={lang}><code>{children}</code></pre>
}

export function Table({ head, rows }) {
  return (
    <div className="tbl">
      <table>
        <thead><tr>{head.map((h) => <th key={h}>{h}</th>)}</tr></thead>
        <tbody>{rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>)}</tbody>
      </table>
    </div>
  )
}

export function Note({ kind = 'note', title, children }) {
  return (
    <aside className={`callout ${kind}`}>
      <b>{title || (kind === 'warn' ? 'Important' : 'Note')}</b>
      <div>{children}</div>
    </aside>
  )
}

export const C = ({ children }) => <code className="ic">{children}</code>
