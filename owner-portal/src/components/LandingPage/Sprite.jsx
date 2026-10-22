import { useEffect, useLayoutEffect, useRef } from 'react'
import { animCat, prefersReducedMotion, sprite, spriteOpts } from './sprites'

// <Sprite name="camera" s={3} /> — s is the integer pixel scale. Pass `label` to expose it to screen readers.
export default function Sprite({ name, s, ol, fill, label, className = '', style, ...rest }) {
  const ref = useRef(null)
  useLayoutEffect(() => {
    const cv = ref.current
    sprite(cv, name, spriteOpts(name, ol, fill))
    if (s) cv.style.width = cv.width * s + 'px'
  }, [name, s, ol, fill])
  return (
    <canvas
      ref={ref}
      className={`sp ${className}`}
      style={style}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      {...rest}
    />
  )
}

// The pixel cat: blinks every few seconds, tail swishes.
export function Cat({ scale, className = '', style, ...rest }) {
  const ref = useRef(null)
  useEffect(() => animCat(ref.current, { scale, reduced: prefersReducedMotion() }), [scale])
  return <canvas ref={ref} className={`sp ${className}`} style={style} aria-hidden="true" {...rest} />
}
