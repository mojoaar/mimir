import { readFile } from 'node:fs/promises'
import path from 'node:path'
import Link from 'next/link'
import { connection } from 'next/server'
import { H1, H2, P, Prose } from '@/components/docs/prose'
import { publicMetadata } from '@/lib/seo'

export const instant = false

export async function generateMetadata() {
  await connection()

  return publicMetadata({
    title: 'Changelog',
    description: 'Every Mimir release, in order.',
    path: '/docs/changelog',
  })
}

export default async function ChangelogPage() {
  const markdown = await readFile(path.join(process.cwd(), 'CHANGELOG.md'), 'utf8')
  const releases = parseReleases(markdown)

  return (
    <Prose>
      <H1>Changelog</H1>
      <P>
        Mimir follows semantic versioning and Keep a Changelog. Releases are also published on GitHub with a
        multi-architecture image.
      </P>
      {releases.map((release) => (
        <section key={release.title}>
          <H2>{release.title}</H2>
          {release.lines.map((line) => (
            <P key={line}>{line}</P>
          ))}
        </section>
      ))}
      <H2>Raw file</H2>
      <P>
        The file itself is at <Link href="/changelog.md">/changelog.md</Link>, as Markdown.
      </P>
    </Prose>
  )
}

type Release = { title: string; lines: string[] }

function parseReleases(markdown: string): Release[] {
  const releases: Release[] = []
  let current: Release | null = null
  let lastWasBullet = false

  for (const raw of markdown.split('\n')) {
    const line = raw.trim()

    if (line.startsWith('## ')) {
      current = { title: line.slice(3), lines: [] }
      releases.push(current)
      lastWasBullet = false
      continue
    }

    if (!current) continue
    if (!line || line.startsWith('#')) {
      lastWasBullet = false
      continue
    }

    const text = line.replace(/\*\*|`/g, '')

    // The file is hard-wrapped at about 120 characters, so a line that does not
    // open a new item continues the one above it. Without this every wrapped
    // bullet renders as several paragraphs, with the bullet on the first only.
    if (/^[-*]\s+/.test(line)) {
      current.lines.push(`• ${text.replace(/^[-*]\s+/, '')}`)
      lastWasBullet = true
    } else if (lastWasBullet) {
      current.lines[current.lines.length - 1] += ` ${text}`
    } else {
      current.lines.push(text)
    }
  }

  return releases.filter((release) => release.lines.length > 0)
}
