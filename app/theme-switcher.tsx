'use client'

import { THEME_COOKIE, THEME_LABELS, themeColor, type ThemeValue } from '@/lib/theme'

/**
 * The cookie is read by the server on the next request; setting data-theme here
 * repaints the current page without a reload, so the two never disagree.
 */
export function ThemeSwitcher({ value }: { value: ThemeValue }) {
  function onChange(next: ThemeValue) {
    document.documentElement.dataset.theme = next
    document.cookie = `${THEME_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`
    const meta = document.querySelector('meta[name="theme-color"]')
    if (meta) meta.setAttribute('content', themeColor(next))
  }

  return (
    <label className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
      <span className="sr-only">Theme</span>
      <select
        defaultValue={value}
        onChange={(e) => onChange(e.target.value as ThemeValue)}
        className="rounded border border-[var(--border)] bg-[var(--bg-raised)] px-2 py-1 text-xs text-[var(--fg)]"
      >
        {(Object.keys(THEME_LABELS) as ThemeValue[]).map((key) => (
          <option key={key} value={key}>
            {THEME_LABELS[key]}
          </option>
        ))}
      </select>
    </label>
  )
}
