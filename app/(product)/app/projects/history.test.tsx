import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { diffLines, MemoryHistory } from './[slug]/history'
import type { VersionSummary } from '@/lib/memory/versions'

const versions: VersionSummary[] = [
  {
    id: '3',
    path: 'auth/rotation',
    title: 'Tokens rotate every 30 days',
    kind: 'fact',
    source: 'agent',
    client: null,
    session: null,
    updatedAt: new Date('2026-10-20T10:00:00Z'),
    createdAt: new Date('2026-10-21T10:00:00Z'),
    bytes: 120,
  },
  {
    id: '2',
    path: 'auth/rotation',
    title: 'Tokens last 30 days',
    kind: 'fact',
    source: 'agent',
    client: null,
    session: null,
    updatedAt: new Date('2026-10-19T10:00:00Z'),
    createdAt: new Date('2026-10-20T10:00:00Z'),
    bytes: 100,
  },
]

const noop = () => {}

type PanelProps = Omit<Parameters<typeof MemoryHistory>[0], 'labels'>

function render(overrides: Partial<PanelProps> = {}) {
  const props: PanelProps = {
    slug: 'mimir',
    projectId: 'p1',
    path: 'auth/rotation',
    versions,
    canWrite: true,
    selected: null,
    diff: null,
    restore: noop,
    ...overrides,
  }

  return renderToStaticMarkup(
    <MemoryHistory
      {...props}
      labels={{
        title: `History (${props.versions.length})`,
        back: 'Back to memory',
        empty: 'Nothing yet. The next edit keeps this body.',
        replaced: `Replaced ${props.selected?.updatedAt.toISOString() ?? ''} - changes from that body to what is live now.`,
        restore: 'Restore this version',
        kept: 'The current body is kept in history.',
      }}
    />,
  )
}

describe('diffLines', () => {
  it('marks the changed line as one removal and one addition', () => {
    const lines = diffLines('a\nb\nc', 'a\nB\nc')

    expect(lines).toContainEqual({ kind: 'remove', text: 'b' })
    expect(lines).toContainEqual({ kind: 'add', text: 'B' })
    expect(lines.filter((l) => l.kind === 'same').map((l) => l.text)).toEqual(['a', 'c'])
  })

  it('has nothing to say about an identical body', () => {
    expect(diffLines('same\n', 'same\n').every((l) => l.kind === 'same')).toBe(true)
  })
})

describe('the history panel', () => {
  it('lists every version with its time and size', () => {
    const html = render()

    expect(html).toContain('History (2)')
    expect(html).toContain('2026-10-20T10:00:00.000Z')
    expect(html).toContain('120 B')
    expect(html).toContain('version=3')
  })

  it('offers a restore only to someone who can write', () => {
    const selected = { selected: versions[0]!, diff: [{ kind: 'same' as const, text: 'a' }] }

    expect(render(selected)).toContain('Restore this version')
    expect(render({ ...selected, canWrite: false })).not.toContain('Restore this version')
  })

  it('shows the diff of the selected version with prefixed lines', () => {
    const html = render({
      selected: versions[0]!,
      diff: [
        { kind: 'same', text: 'a' },
        { kind: 'remove', text: 'old' },
        { kind: 'add', text: 'new' },
      ],
    })

    expect(html).toContain('- old')
    expect(html).toContain('+ new')
    expect(html).toContain('Replaced 2026-10-20T10:00:00.000Z')
  })

  it('says what happens when there is no history yet', () => {
    expect(render({ versions: [] })).toContain('The next edit keeps this body.')
  })
})
