import { useEffect, useRef } from 'react'
import Sprite from './Sprite'

const CASES = [
  {
    icon: 'camera', title: 'Journalists and fact-checkers',
    stat: "64.4% of BOOM's May 2025 fact-checks were old or unrelated footage passed off as new.",
    problem: 'Verification is slow and tiring.',
    solution: 'Every photo carries a record of when it was really taken. A claim link answers in seconds, without revealing who took the photo or where they stood.',
  },
  {
    icon: 'book', title: 'Courts, police and forensics',
    stat: 'Section 63, Bharatiya Sakshya Adhiniyam, 2023',
    problem: "Electronic records need a certificate with the file's hash, usually calculated long after the photo was taken.",
    solution: 'The SHA-256 hash is made at capture, anchored with the device signature and time. The hashes either match or they do not.',
  },
  {
    icon: 'lock', title: 'Insurers, banks and platforms',
    stat: '₹8,000–10,000 cr health-insurance fraud and leakage a year (BCG, Medi Assist).',
    problem: 'Edited photos of damaged goods and property are already used to push refunds and false claims.',
    solution: 'Field photos are signed when taken, so fewer manual reviews, faster decisions and fewer disputes.',
  },
  {
    icon: 'check', title: 'Photographers',
    stat: 'Own it: an ERC-1155 certificate, in your wallet.',
    problem: 'Metadata gets stripped and files get copied without credit.',
    solution: "The certificate stays tied to the photographer's record. Proof of authorship when a photo is reused, licensed or disputed, even for freelancers no editor has met.",
  },
  {
    icon: 'heart', title: 'Everyone else',
    stat: "Check, don't guess: replace judging by eye with a record.",
    solution: 'Veris answers with a lookup anyone can repeat. It runs on hashes and content IDs, and clips onto equipment people already own, so nothing gets thrown away.',
  },
]

const FOCUSABLE = 'a[href],button:not([disabled]),[tabindex]:not([tabindex="-1"])'

// Modal listing who Veris is for. Escape, backdrop click or the close button dismiss it; focus is trapped inside.
export default function UseCasesModal({ onClose }) {
  const dialogRef = useRef(null)

  useEffect(() => {
    const prev = document.activeElement
    const dialog = dialogRef.current
    dialog.querySelector('button').focus()
    document.documentElement.classList.add('vl-lock')

    const onKey = (e) => {
      if (e.key === 'Escape') { onClose(); return }
      if (e.key !== 'Tab') return
      const items = dialog.querySelectorAll(FOCUSABLE)
      const first = items[0]
      const last = items[items.length - 1]
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.documentElement.classList.remove('vl-lock')
      prev && prev.focus && prev.focus({ preventScroll: true })
    }
  }, [onClose])

  return (
    <div className="ucm-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="ucm" role="dialog" aria-modal="true" aria-labelledby="ucm-title" ref={dialogRef}>
        <button type="button" className="btn ucm-x" onClick={onClose} aria-label="Close use cases">✕</button>
        <div className="ucm-head">
          <Sprite name="sparkle" s={3} />
          <h2 id="ucm-title">Use cases</h2>
          <p>Anyone whose photos have to be believed.</p>
        </div>
        <div className="ucm-grid">
          {CASES.map((c) => (
            <article key={c.title} className="ucm-card">
              <Sprite name={c.icon} s={3} />
              <h3>{c.title}</h3>
              <p className="ucm-stat">{c.stat}</p>
              {c.problem && <p className="ucm-prob">{c.problem}</p>}
              <p className="ucm-with"><b>WITH VERIS</b>{c.solution}</p>
            </article>
          ))}
        </div>
      </div>
    </div>
  )
}
