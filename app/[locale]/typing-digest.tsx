'use client'

import { useEffect, useRef, useState } from 'react'

/**
 * Types the digest once per page load. The server sends the finished text, so a
 * reader without JavaScript, a crawler and a screenshot all see the real card;
 * this only redraws it, and only when the visitor has not asked for less motion.
 */
export function TypingDigest({ text }: { text: string }) {
  const [shown, setShown] = useState(text)
  const started = useRef(false)

  useEffect(() => {
    if (started.current) return
    started.current = true
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    let at = 0
    setShown('')
    const timer = window.setInterval(() => {
      at += 3
      setShown(text.slice(0, at))
      if (at >= text.length) window.clearInterval(timer)
    }, 24)
    return () => window.clearInterval(timer)
  }, [text])

  return (
    <pre className="min-h-[17rem] overflow-x-auto whitespace-pre-wrap break-words p-4 font-mono text-xs leading-relaxed text-[var(--text-muted)]">
      {shown}
      {shown.length < text.length ? (
        <span aria-hidden="true" className="animate-pulse text-[var(--accent)]">
          {'\u2588'}
        </span>
      ) : null}
    </pre>
  )
}
