import { useEffect, useRef } from 'react'
import storyHtml from './storyHtml'
import initStory from './story'
import { prefersReducedMotion } from './sprites'

// "The story behind Veris": the pinned, scroll-driven journalist story. Mounted only while open.
export default function StorySection({ startAct, onBack, onOwner }) {
  const ref = useRef(null)
  const reduced = prefersReducedMotion()
  const cb = useRef({ onBack, onOwner })
  cb.current = { onBack, onOwner }

  useEffect(() => initStory(ref.current, {
    reduced,
    startAct,
    onBack: () => cb.current.onBack(),
    onOwner: () => cb.current.onOwner(),
  }), [reduced, startAct])

  return (
    <div
      id="story"
      ref={ref}
      className={`vdark${reduced ? ' rm' : ''}`}
      dangerouslySetInnerHTML={{ __html: storyHtml }}
    />
  )
}
