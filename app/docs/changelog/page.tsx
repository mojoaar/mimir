import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { connection } from 'next/server'
import { Code } from '@/components/docs/code'
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
      <Code language="text">{markdown.trim().slice(0, 400)}</Code>
    </Prose>
  )
}

type Release = { title: string; lines: string[] }

function parseReleases(markdown: string): Release[] {
  const releases: Release[] = []
  let current: Release | null = null

  for (const raw of markdown.split('\n')) {
    const line = raw.trim()

    if (line.startsWith('## ')) {
      current = { title: line.slice(3), lines: [] }
      releases.push(current)
      continue
    }

    if (!current) continue
    if (!line || line.startsWith('#')) continue

    current.lines.push(line.replace(/^[-*]\s+/, '• ').replace(/\*\*/g, ''))
  }

  return releases.filter((release) => release.lines.length > 0)
}
