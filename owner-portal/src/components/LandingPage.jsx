import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import './LandingPage/landing.css'
import Loader from './LandingPage/Loader'
import PixelWipe from './LandingPage/PixelWipe'
import Landing from './LandingPage/Landing'
import Footer from './LandingPage/Footer'
import Story from './LandingPage/Story'

const BOOT_KEY = 'veris:booted'
const seen = () => { try { return sessionStorage.getItem(BOOT_KEY) === '1' } catch { return false } }
const markSeen = () => { try { sessionStorage.setItem(BOOT_KEY, '1') } catch { /* private mode */ } }

export default function LandingPage() {
  const [booting, setBooting] = useState(() => !seen())
  const [mode, setMode] = useState('landing') // 'landing' | 'story'
  const wipe = useRef(null)

  // the loader runs on the first visit of a session only, and locks scrolling while it plays
  useEffect(() => {
    if (!booting) return undefined
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [booting])

  const finishBoot = useCallback(() => {
    wipe.current.run(() => { markSeen(); setBooting(false) })
  }, [])

  const go = useCallback((next) => {
    wipe.current.run(() => setMode(next))
  }, [])

  useLayoutEffect(() => { window.scrollTo(0, 0) }, [mode])

  return (
    <div className={`vl${mode === 'story' ? ' is-story' : ''}`}>
      {booting && <Loader onFinish={finishBoot} />}
      {mode === 'landing' ? (
        <>
          <Landing onStory={() => go('story')} />
          <Footer onStory={() => go('story')} />
        </>
      ) : (
        <Story onBack={() => go('landing')} />
      )}
      <PixelWipe ref={wipe} />
    </div>
  )
}
