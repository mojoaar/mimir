'use client'

import { useState } from 'react'

import { flipTheme, THEME_COOKIE, themeColor, type ThemeValue } from '@/lib/theme'

/**
 * The server reads the cookie on the next request, and setting data-theme here
 * repaints the current page without a reload, so the two never disagree. The
 * icon shows what the press gives you, not what you are in now.
 */
export function ThemeToggle({ value }: { value: ThemeValue }) {
  const [theme, setTheme] = useState(value)
  const next = flipTheme(theme)
  const light = next.endsWith('-light')
  const label = light ? 'Switch to the light theme' : 'Switch to the dark theme'

  function onClick() {
    document.documentElement.dataset.theme = next
    document.cookie = `${THEME_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`
    const meta = document.querySelector('meta[name="theme-color"]')
    if (meta) meta.setAttribute('content', themeColor(next))
    setTheme(next)
  }

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="rounded-md border border-[var(--border)] p-2 text-[var(--text-muted)] hover:text-[var(--fg)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        {light ? (
          <>
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
          </>
        ) : (
          <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
        )}
      </svg>
    </button>
  )
}
