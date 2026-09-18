'use client'

import { useEffect, useState } from 'react'

/**
 * A clock that ticks in state, so "read 12s ago" can be computed in render
 * without calling `Date.now()` there — the hooks lint rules treat that as an
 * impure read during render, and they are right: two renders of the same
 * state would disagree.
 */
export function useNow(intervalMs = 5_000): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs)
    return () => window.clearInterval(id)
  }, [intervalMs])
  return now
}
