import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import raw from './story/story.html?raw'
import { initStory } from './story/engine'
import './story/story.css'

const imgs = import.meta.glob('../../assets/story/web/*.webp', { eager: true, import: 'default' })
const markup = raw.replace(/\{\{img:([\w-]+)\}\}/g, (_, k) => Object.entries(imgs).find(([p]) => p.endsWith(`/${k}.webp`))?.[1] ?? '')

// "The story behind Veris": a pinned, scroll-driven sequence. The markup lives in story.html and
// the scroll engine in story/engine.js, which animates it imperatively.
export default function Story({ onBack }) {
  const root = useRef(null)
  const navigate = useNavigate()

  useEffect(() => {
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches
    return initStory(root.current, { reduce, onNav: (href) => navigate(href) })
  }, [navigate])

  return (
    <div
      ref={root}
      className="vs"
      onClick={(e) => { if (e.target.closest('[data-back]')) onBack() }}
      dangerouslySetInnerHTML={{ __html: markup }}
    />
  )
}
