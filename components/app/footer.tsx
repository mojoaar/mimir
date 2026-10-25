import pkg from '../../package.json'

/**
 * The footer follows the column it sits under: the app reads at max-w-3xl and
 * the docs at max-w-6xl, so `wide` exists rather than inventing a third width.
 */
export default function AppFooter({ wide = false }: { wide?: boolean }) {
  return (
    <footer className="mt-auto border-t border-[var(--border)]">
      <div
        className={`mx-auto px-4 py-6 text-sm text-[var(--text-muted)] sm:px-6 ${
          wide ? 'max-w-6xl' : 'max-w-3xl'
        }`}
      >
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
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
          <a
            href="/docs"
            className="underline hover:text-[var(--fg)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
          >
            Docs
          </a>
          <span aria-hidden="true">·</span>
          <span>v{pkg.version}</span>
          <span aria-hidden="true">·</span>
          <span>© {new Date().getFullYear()}</span>
        </p>
      </div>
    </footer>
  )
}
