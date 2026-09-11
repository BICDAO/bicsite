'use client'

import { usePathname } from 'next/navigation'
import { useEffect } from 'react'

/**
 * Adds .is-in to [data-reveal] elements once their top enters the viewport (Webflow scroll-into-view).
 * Uses bounding rects, not IntersectionObserver: offset elements inside overflow:hidden parents
 * are fully clipped and would never report as intersecting.
 */
export function RevealObserver() {
  const pathname = usePathname()
  useEffect(() => {
    let pending = [...document.querySelectorAll<HTMLElement>('[data-reveal]:not(.is-in)')]
    let frame = 0
    const check = () => {
      frame = 0
      pending = pending.filter((el) => {
        if (el.getBoundingClientRect().top >= window.innerHeight) return true
        el.classList.add('is-in')
        return false
      })
      if (!pending.length) stop()
    }
    const onScroll = () => {
      frame ||= requestAnimationFrame(check)
    }
    const stop = () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    check()
    return () => {
      stop()
      cancelAnimationFrame(frame)
    }
  }, [pathname])
  return null
}
