import Link from 'next/link'
import { notFound } from 'next/navigation'

import { requireUser } from '@/lib/auth/context'
import { listDeletedMemories, readMemory, treeMemory } from '@/lib/memory/service'
import { searchMemories } from '@/lib/memory/search'
import { getVersion, listVersions } from '@/lib/memory/versions'
import { getProject } from '@/lib/projects/service'

import { deleteMemoryAction, restoreMemoryAction, restoreVersionAction } from './actions'
import { MemoryEditor } from './editor'
import { diffLines, MemoryHistory } from './history'
import { MemoryTree } from './tree'

export const instant = false

const BODY_DISPLAY_LIMIT = 200_000

// A repeated parameter arrives as a string array; treat every occurrence as the
// first one rather than crashing on `.trim`.
type Param = string | string[] | undefined
type Search = { path?: Param; q?: Param; deleted?: Param; history?: Param; version?: Param; notice?: Param; error?: Param }

const first = (value: Param): string => (Array.isArray(value) ? (value[0] ?? '') : (value ?? ''))

// Memories live as deep as an agent writes them; the tree shows them all.
const TREE_DEPTH = 12

export default async function ProjectBrowser({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<Search>
}) {
  const user = await requireUser()
  const { slug } = await params
  const search = await searchParams
  const project = await getProject(user.id, slug)
  if (!project) notFound()

  const query = first(search.q).trim()
  const showDeleted = first(search.deleted) === '1'
  const showHistory = first(search.history) === '1'
  const requested = first(search.path)
  const notice = first(search.notice)
  const failure = first(search.error)

  let memory = null
  if (requested) {
    try {
      memory = await readMemory(user.id, project.id, requested)
    } catch (error) {
      // A bad path is a 404; anything else (database down) must not look like one.
      if ((error as { code?: string }).code !== 'invalid_path') throw error
      notFound()
    }
    if (!memory) notFound()
  }

  const [entries, deleted, hits, versions] = await Promise.all([
    treeMemory(user.id, project.id, '', TREE_DEPTH),
    listDeletedMemories(user.id, project.id),
    query ? searchMemories({ userId: user.id, projectId: project.id, query, limit: 50 }) : Promise.resolve([]),
    memory ? listVersions(user.id, project.id, memory.path) : Promise.resolve([]),
  ])

  const versionId = first(search.version)
  const found = versionId ? await getVersion(user.id, project.id, versionId) : null
  // A version id can be pasted from a different memory in the same project;
  // diffing it here would show one memory's history beside another's body.
  const selectedVersion = found && memory && found.path === memory.path ? found : null
  const diff = selectedVersion && memory ? diffLines(selectedVersion.body, memory.body) : null

  const base = `/app/projects/${slug}`
  const canWrite = project.role === 'owner' || project.role === 'write'

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <Link href="/app" className="text-sm text-[var(--text-muted)] underline">
          ← Projects
        </Link>
        <Link href={`${base}/settings`} className="text-sm text-[var(--text-muted)] underline">
          Settings
        </Link>
      </div>

      {notice ? <p className="text-sm text-[var(--accent)]">{notice}</p> : null}
      {failure ? <p className="text-sm text-[var(--danger)]">{failure}</p> : null}

      <header className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold tracking-tight">{project.name}</h1>
        <p className="text-sm text-[var(--text-muted)]">
          {project.slug} · {project.role}
        </p>
      </header>

      <form action={base} className="flex flex-wrap gap-2">
        <label htmlFor="memory-search" className="sr-only">
          Search this project
        </label>
        <input
          id="memory-search"
          type="search"
          name="q"
          defaultValue={query}
          placeholder="Search this project"
          className="min-w-0 flex-1 rounded border border-[var(--border)] bg-[var(--bg-raised)] px-3 py-2 text-sm"
        />
        <button type="submit" className="rounded bg-[var(--accent)] px-3 py-2 text-sm text-[var(--accent-fg)]">
          Search
        </button>
      </form>

      <div className="flex flex-col gap-6 lg:flex-row">
        <aside className="lg:w-80 lg:shrink-0">
          <MemoryTree
            slug={slug}
            entries={entries}
            active={memory?.path}
            deletedCount={deleted.length}
            showDeleted={showDeleted}
          />
        </aside>

        <section className="min-w-0 flex-1">
          {showDeleted ? (
            <DeletedList slug={slug} projectId={project.id} rows={deleted} canWrite={canWrite} />
          ) : query ? (
            <SearchResults hits={hits} base={base} />
          ) : memory ? (
            <article className="flex flex-col gap-3">
              <p className="text-sm text-[var(--text-muted)]">{memory.path.split('/').join(' / ')}</p>
              <h2 className="text-lg font-semibold">{memory.title}</h2>
              {memory.summary ? (
                <p className="text-sm text-[var(--text-muted)]">{memory.summary}</p>
              ) : (
                <p className="text-sm text-[var(--text-muted)]">No summary yet.</p>
              )}
              <p className="flex flex-wrap items-center gap-3 text-xs text-[var(--text-muted)]">
                <span>
                  {memory.kind} · updated {memory.updatedAt.toISOString()}
                </span>
                <Link
                  href={`${base}?path=${encodeURIComponent(memory.path)}&history=1`}
                  className="underline"
                >
                  History ({versions.length})
                </Link>
              </p>
              {canWrite ? (
                <>
                  <MemoryEditor
                    slug={slug}
                    projectId={project.id}
                    path={memory.path}
                    title={memory.title}
                    body={memory.body}
                    learning={project.learningEnabled}
                  />
                  <form action={deleteMemoryAction} className="flex items-center gap-3">
                    <input type="hidden" name="slug" value={slug} />
                    <input type="hidden" name="projectId" value={project.id} />
                    <input type="hidden" name="path" value={memory.path} />
                    <button
                      type="submit"
                      className="rounded border border-[var(--danger)] px-3 py-1 text-sm text-[var(--danger)]"
                    >
                      Delete
                    </button>
                    <span className="text-xs text-[var(--text-muted)]">
                      Recoverable for 30 days.
                    </span>
                  </form>
                </>
              ) : (
                <>
                  <pre className="max-h-[60vh] overflow-auto whitespace-pre-wrap break-words rounded border border-[var(--border)] bg-[var(--bg-raised)] p-3 text-sm">
                    {memory.body.length > BODY_DISPLAY_LIMIT
                      ? `${memory.body.slice(0, BODY_DISPLAY_LIMIT)}\n\n[truncated for display]`
                      : memory.body}
                  </pre>
                  <p className="text-xs text-[var(--text-muted)]">You have read access to this project.</p>
                </>
              )}
              {showHistory ? (
                <MemoryHistory
                  slug={slug}
                  projectId={project.id}
                  path={memory.path}
                  versions={versions}
                  canWrite={canWrite}
                  selected={selectedVersion}
                  diff={diff}
                  restore={restoreVersionAction}
                />
              ) : null}
            </article>
          ) : (
            <p className="text-sm text-[var(--text-muted)]">Choose a memory, or search.</p>
          )}
        </section>
      </div>
    </main>
  )
}

function SearchResults({ hits, base }: { hits: Awaited<ReturnType<typeof searchMemories>>; base: string }) {
  if (hits.length === 0) {
    return <p className="text-sm text-[var(--text-muted)]">No matches.</p>
  }
  return (
    <ul className="flex flex-col gap-2">
      {hits.map((hit) => (
        <li key={hit.path}>
          <Link
            href={`${base}?path=${encodeURIComponent(hit.path)}`}
            className="block rounded border border-[var(--border)] p-3 hover:bg-[var(--bg-raised)]"
          >
            <span className="block text-sm font-medium">{hit.title}</span>
            <span className="block text-xs text-[var(--text-muted)]">{hit.path}</span>
            {hit.summary ? (
              <span className="mt-1 block text-sm text-[var(--text-muted)]">{hit.summary}</span>
            ) : null}
          </Link>
        </li>
      ))}
    </ul>
  )
}

function DeletedList({
  slug,
  projectId,
  rows,
  canWrite,
}: {
  slug: string
  projectId: string
  rows: Awaited<ReturnType<typeof listDeletedMemories>>
  canWrite: boolean
}) {
  if (rows.length === 0) {
    return <p className="text-sm text-[var(--text-muted)]">Nothing in the bin.</p>
  }
  return (
    <ul className="flex flex-col gap-2">
      {rows.map((row) => (
        <li
          key={row.path}
          className="flex flex-wrap items-center justify-between gap-2 rounded border border-[var(--border)] p-3"
        >
          <span className="min-w-0">
            <span className="block text-sm">{row.title}</span>
            <span className="block text-xs text-[var(--text-muted)]">
              {row.path} · deleted {row.deletedAt.toISOString()}
            </span>
          </span>
          {canWrite ? (
            <form action={restoreMemoryAction}>
              <input type="hidden" name="slug" value={slug} />
              <input type="hidden" name="projectId" value={projectId} />
              <input type="hidden" name="path" value={row.path} />
              <button
                type="submit"
                className="rounded border border-[var(--border)] px-2 py-1 text-xs text-[var(--fg)]"
              >
                Restore
              </button>
            </form>
          ) : null}
        </li>
      ))}
      <li className="text-xs text-[var(--text-muted)]">
        Deleted memories are removed for good after 30 days. Open{' '}
        <Link href={`/app/projects/${slug}`} className="underline">
          live memory
        </Link>
        .
      </li>
    </ul>
  )
}
