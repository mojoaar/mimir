'use client'

import { LOCALES, type Locale } from '@/lib/i18n/locales'

// Autonyms: a person looking for their own language reads it in their own
// language, so these three strings stay the same in every locale and are not
// part of the catalog.
const NAMES: Record<Locale, string> = {
  en: 'English',
  da: 'Dansk',
  de: 'Deutsch',
}

export function LanguageSwitcher({
  value,
  label,
  action,
}: {
  value: Locale
  label: string
  action: (formData: FormData) => Promise<void>
}) {
  return (
    <form action={action} className="contents">
      {/* Without JavaScript the select cannot submit itself, so this button is
          the whole control; with it, the change is already submitted. */}
      <button type="submit" className="sr-only">
        {label}
      </button>
      <select
        id="mimir-language"
        name="locale"
        aria-label={label}
        defaultValue={value}
        className="rounded border border-[var(--border)] bg-[var(--bg)] px-2 py-1 text-sm"
        onChange={(event) => {
          const form = event.currentTarget.form
          if (form) form.requestSubmit()
        }}
      >
        {LOCALES.map((locale) => (
          <option key={locale} value={locale}>
            {NAMES[locale]}
          </option>
        ))}
      </select>
    </form>
  )
}
