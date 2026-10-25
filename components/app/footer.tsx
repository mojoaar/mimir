import Link from 'next/link'

import pkg from '../../package.json'

// Fixed at start-up: reading the clock during render aborts the docs prerender.
const YEAR = new Date().getFullYear()

/**
 * The footer follows the column it sits under: the app reads at max-w-5xl and
 * the docs at max-w-6xl, so `wide` exists rather than inventing a third width.
 */
export default function AppFooter({ wide = false }: { wide?: boolean }) {
  return (
    <footer className="mt-auto border-t border-[var(--border)]">
      <div
        className={`mx-auto px-4 py-6 text-sm text-[var(--text-muted)] sm:px-6 ${
          wide ? 'max-w-6xl' : 'max-w-5xl'
        }`}
      >
        <p className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-center">
          <span>Crafted with ❤️ &amp; 🤖 by Morten Johansen</span>
          <span aria-hidden="true">·</span>
          <a
            href="https://github.com/mojoaar/mimir"
            className="underline hover:text-[var(--fg)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
          >
            GitHub
          </a>
          <span aria-hidden="true">·</span>
          <span>MIT</span>
          <span aria-hidden="true">·</span>
          <Link
            href="/docs"
            className="underline hover:text-[var(--fg)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
          >
            Docs
          </Link>
          <span aria-hidden="true">·</span>
          <span>v{pkg.version}</span>
          <span aria-hidden="true">·</span>
          <span>© {YEAR}</span>
        </p>
      </div>
    </footer>
  )
}
