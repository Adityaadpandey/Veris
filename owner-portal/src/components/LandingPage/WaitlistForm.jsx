import { useId, useState } from 'react'
import Sprite from './Sprite'
import { WAITLIST_URL } from './links'

const ROLES = ['Photographer', 'Journalist or editor', 'Insurer or investigator', 'Developer', 'Something else']
const DEVICES = ['Hotshoe', 'Clip-on', 'Standalone', 'Not sure yet']

// variant "hero": email + button on one line. variant "full": adds two optional questions.
export default function WaitlistForm({ variant = 'full', id }) {
  const uid = useId()
  const [state, setState] = useState('idle') // idle | sending | done | error
  const [msg, setMsg] = useState('')

  async function submit(e) {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    if (f.get('website')) return // honeypot
    const body = { email: String(f.get('email') || '').trim(), role: f.get('role') || '', device: f.get('device') || '', source: variant, website: f.get('website') || '' }
    setState('sending'); setMsg('')
    try {
      if (!WAITLIST_URL) {
        if (!import.meta.env.DEV) throw new Error('The waitlist is not connected yet. Please try again soon.')
        console.warn('VITE_WAITLIST_URL is not set: simulating a successful sign-up.', body)
      } else {
        const res = await fetch(WAITLIST_URL, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(body) })
        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          throw new Error(data.error || 'Something went wrong saving your email. Please try again.')
        }
      }
      setState('done')
    } catch (err) {
      setState('error'); setMsg(err.message)
    }
  }

  if (state === 'done') {
    return (
      <div className={`wl wl-${variant} wl-done`} role="status" id={id}>
        <Sprite name="happy" u={variant === 'hero' ? 3 : 5} />
        <p className="hand">you're on the list!</p>
        <span>We'll email you once when early access opens.</span>
      </div>
    )
  }

  return (
    <form className={`wl wl-${variant}`} onSubmit={submit} id={id} noValidate={false}>
      <div className="wl-row">
        <label className="sr" htmlFor={`${uid}-email`}>Email address</label>
        <input id={`${uid}-email`} name="email" type="email" required autoComplete="email" placeholder="you@example.com" aria-describedby={msg ? `${uid}-err` : undefined} />
        <button className="btn btn-primary" type="submit" disabled={state === 'sending'}>
          {state === 'sending' ? 'Joining…' : 'Join the waitlist'}
        </button>
      </div>
      {variant === 'full' && (
        <div className="wl-extra">
          <label>I'd use Veris as a
            <select name="role" defaultValue="">
              <option value="">Pick one (optional)</option>
              {ROLES.map((r) => <option key={r}>{r}</option>)}
            </select>
          </label>
          <label>I'm most curious about the
            <select name="device" defaultValue="">
              <option value="">Pick one (optional)</option>
              {DEVICES.map((r) => <option key={r}>{r}</option>)}
            </select>
          </label>
        </div>
      )}
      <input className="hp" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" />
      <p className="wl-note" id={`${uid}-err`} role={msg ? 'alert' : undefined}>
        {msg || 'One email when early access opens. No spam.'}
      </p>
    </form>
  )
}
