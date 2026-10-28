import type { NextRequest } from 'next/server'
import { parseTheme, themeColor, type ThemeValue } from '@/lib/theme'

// Every line is a different flavour of "the model looked and found nothing".
// Which one a visitor sees is decided by the path, so the same wrong URL always
// gets the same joke and no page needs state to stay deterministic.
const QUIPS = [
  'Retrieved 0 documents. Reranked them anyway.',
  'This page did not survive the summarisation.',
  'Embedded, searched, and politely declined.',
  'The model is confident this page existed. The model is hallucinating.',
  'Not in the weights, not in the index, not in the runbook.',
  'Sampled at temperature 0.7. You got this instead.',
  'No memory at this path. Forgotten, or never learned.',
  'The context window closed before this URL arrived.',
]

/** The body is one static string, so there is nothing here to escape. */
export function missingPage(pathname: string, theme: ThemeValue): string {
  const dark = theme.endsWith('-dark')
  const bg = themeColor(theme)
  const fg = dark ? '#e6ecf5' : '#16181d'
  const muted = dark ? '#9aa7bd' : '#4a5260'
  const line = QUIPS[[...pathname].reduce((sum, ch) => sum + ch.charCodeAt(0), 0) % QUIPS.length]

  return `<!doctype html>
<html lang="en" data-theme="${theme}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>404 - nothing at ${pathname.replace(/[<>&"]/g, '')}</title>
<style>
  html { color-scheme: ${dark ? 'dark' : 'light'}; }
  body { margin: 0; background: ${bg}; color: ${fg};
         font: 16px/1.6 ui-sans-serif, system-ui, -apple-system, sans-serif; }
  main { max-width: 40rem; margin: 0 auto; padding: 6rem 1.25rem; }
  .code { font-family: ui-monospace, SFMono-Regular, monospace; font-size: .8rem;
          letter-spacing: .08em; color: ${muted}; }
  h1 { font-size: 1.6rem; line-height: 1.25; margin: .5rem 0 1rem; }
  p { color: ${muted}; margin: 0 0 1rem; }
  blockquote { margin: 1.5rem 0; padding: .75rem 1rem; border-left: 3px solid ${fg};
               font-family: ui-monospace, SFMono-Regular, monospace; font-size: .9rem;
               color: ${fg}; }
  code { font-family: ui-monospace, SFMono-Regular, monospace; font-size: .85rem; }
  a { color: inherit; text-underline-offset: 3px; }
  nav { display: flex; flex-wrap: wrap; gap: 1.25rem; margin-top: 2rem; font-size: .9rem; }
</style>
</head>
<body>
<main>
  <p class="code">404 · NO COMPLETION</p>
  <h1>Mimir looked. Nothing came back.</h1>
  <blockquote>${line}</blockquote>
  <p>There is no page at <code>${pathname.replace(/[<>&"]/g, '')}</code>.</p>
  <p>Memory lives behind a project, not behind a URL. If you were looking for something an agent stored, open the project and search it.</p>
  <nav>
    <a href="/">Home</a>
    <a href="/app">Your projects</a>
    <a href="/docs">Documentation</a>
  </nav>
</main>
</body>
</html>`
}

export function GET(request: NextRequest) {
  const theme = parseTheme(request.cookies.get('mimir_theme')?.value)
  return new Response(missingPage(request.nextUrl.pathname, theme), {
    status: 404,
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
  })
}
