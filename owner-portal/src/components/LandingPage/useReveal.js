import { useEffect } from 'react'

// Adds `.in` to every `.rv` inside the ref'd element once it scrolls into view.
export default function useReveal(ref, deps = []) {
  useEffect(() => {
    const root = ref.current
    if (!root) return undefined
    const els = [...root.querySelectorAll('.rv')]
    if (!('IntersectionObserver' in window)) { els.forEach((e) => e.classList.add('in')); return undefined }
    const io = new IntersectionObserver((es) => es.forEach((en) => {
      if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target) }
    }), { threshold: 0.12, rootMargin: '0px 0px -6% 0px' })
    els.forEach((e) => io.observe(e))
    return () => io.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
}
