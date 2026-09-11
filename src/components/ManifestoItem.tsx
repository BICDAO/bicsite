'use client'

import { useRef, useState } from 'react'

import { Marked } from './Marked'

/** Click-to-expand manifesto row (height 0 ↔ auto, 500ms ease-in-out). */
export function ManifestoItem({ n, title, body }: { n: string; title?: string | null; body?: string | null }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const toggle = (e: React.MouseEvent) => {
    e.preventDefault()
    const el = ref.current
    if (!el) return
    el.style.height = `${el.scrollHeight}px`
    if (open) requestAnimationFrame(() => (el.style.height = '0px'))
    setOpen(!open)
  }

  return (
    <a href="#" role="button" aria-expanded={open} onClick={toggle} className="awards-v1-single-warp _01 w-inline-block">
      <div className="awards-v1-single-flex-wrap">
        <div className="awards-v1-single-title-wrap">
          <div className="awards-single-text">{n}</div>
          <div className="awards-single-text">
            <Marked text={title} />
          </div>
        </div>
      </div>
      <div
        ref={ref}
        className="awards-v1-single-flex-wrap-dropdown"
        onTransitionEnd={() => open && ref.current && (ref.current.style.height = 'auto')}
      >
        <div className="awards-v1-single-title-wrap-dropdown">
          <div className="awards-single-text dropdown">01</div>
          <div className="awards-single-text">
            <em>{body}</em>
          </div>
        </div>
      </div>
    </a>
  )
}
