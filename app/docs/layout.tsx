import type { ReactNode } from 'react';
import Link from 'next/link';
import { cookies } from 'next/headers';
import { DOCS_NAV } from '@/lib/docs/nav';
import { parseTheme } from '@/lib/theme';
import AppFooter from '@/components/app/footer';

function Sidebar() {
  return (
    <nav aria-label="Documentation" className="space-y-6">
      {DOCS_NAV.map((group) => (
        <div key={group.title}>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
            {group.title}
          </p>
          <ul className="space-y-1">
            {group.links.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className="block rounded px-2 py-1 text-sm text-[var(--text-muted)] hover:bg-[var(--bg-raised)] hover:text-[var(--fg)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
                >
                  {link.title}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}

export default async function DocsLayout({ children }: { children: ReactNode }) {
  // Reading the theme cookie makes docs dynamic, which they must be: canonical
  // URLs and the OG image come from the database, and a prerendered copy would
  // bake in a localhost origin.
  const theme = parseTheme((await cookies()).get('mimir_theme')?.value);

  return (
    <div data-theme={theme} className="flex min-h-screen flex-col bg-[var(--bg)] text-[var(--fg)]">
      <header className="border-b border-[var(--border)]">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-4 px-4 py-3 sm:px-6">
          <Link href="/" className="font-semibold tracking-tight">
            Mimir
          </Link>
          <span className="text-sm text-[var(--text-muted)]">Documentation</span>
          <Link
            href="/app"
            className="ml-auto text-sm text-[var(--text-muted)] hover:text-[var(--fg)]"
          >
            Sign in
          </Link>
        </div>
      </header>

      <div className="mx-auto flex max-w-6xl gap-10 px-4 py-8 sm:px-6">
        <aside className="hidden w-[280px] shrink-0 lg:block">
          <div className="sticky top-8">
            <Sidebar />
          </div>
        </aside>

        <main className="min-w-0 flex-1">
          <details className="mb-6 rounded-lg border border-[var(--border)] p-3 lg:hidden">
            <summary className="cursor-pointer text-sm text-[var(--fg)]">Documentation</summary>
            <div className="mt-4">
              <Sidebar />
            </div>
          </details>

          <article className="max-w-[72ch]">{children}</article>
        </main>
      </div>
      <AppFooter wide />
    </div>
  );
}
