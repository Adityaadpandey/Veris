import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import './LandingPage/landing.css'
import PixelWipe from './LandingPage/PixelWipe'
import Landing from './LandingPage/Landing'
import Footer from './LandingPage/Footer'
import Story from './LandingPage/Story'

export default function LandingPage() {
  const [mode, setMode] = useState('landing') // 'landing' | 'story'
  const wipe = useRef(null)

  const go = useCallback((next) => {
    wipe.current.run(() => setMode(next))
  }, [])

  useLayoutEffect(() => { window.scrollTo(0, 0) }, [mode])

  return (
    <div className={`vl${mode === 'story' ? ' is-story' : ''}`}>
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
