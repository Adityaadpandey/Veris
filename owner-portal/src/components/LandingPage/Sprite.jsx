import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { paint, paintHills } from './sprites'

// A pixel sprite. `u` is the on-screen size of one sprite pixel, in CSS px.
export default function Sprite({ name, u = 4, arg, className = '', style, ...rest }) {
  const ref = useRef(null)
  useLayoutEffect(() => { paint(ref.current, name, arg) }, [name, arg])
  return <canvas ref={ref} width={1} height={1} className={`px ${className}`} style={{ '--u': u, ...style }} aria-hidden="true" {...rest} />
}

export function Hill({ layer, className = '' }) {
  const ref = useRef(null)
  useLayoutEffect(() => { paintHills(ref.current, layer) }, [layer])
  return <canvas ref={ref} width={1} height={1} className={`hill ${className}`} aria-hidden="true" />
}

// The pixel cat. It blinks every few seconds and its tail swishes (CSS).
export function PixelCat({ u = 10, className = '', style }) {
  const [shut, setShut] = useState(false)
  useEffect(() => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined
    let t1, t2
    const loop = () => {
      t1 = setTimeout(() => {
        setShut(true)
        t2 = setTimeout(() => { setShut(false); loop() }, 160)
      }, 2200 + Math.random() * 2600)
    }
    loop()
    return () => { clearTimeout(t1); clearTimeout(t2) }
  }, [])
  return (
    <div className={`cat ${className}`} style={{ '--u': u, ...style }}>
      <Sprite name={shut ? 'catblink' : 'cat'} u={u} />
      <Sprite name="tail" u={u} className="tail" />
    </div>
  )
}
