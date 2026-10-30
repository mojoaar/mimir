import { withUser } from '@/lib/db/tx'
import { requireProjectRole } from '@/lib/projects/access'

export type Digest = {
  text: string
  memoryCount: number
  truncated: boolean
}

type DigestRow = {
  path: string
  title: string
  summary: string | null
  kind: string
  updated_at: Date
}

export type DigestInput = {
  userId: string
  projectId: string
  budgetTokens?: number
}

const DEFAULT_BUDGET = 800
const RECENT_SUMMARIES = 5
const PROCEDURE_LIMIT = 5
const MAX_ROWS = 200
// A label on every line would cost a third of the budget and say nothing: a
// note is the default. These two change how the line is read, so they are named.
const LABELLED = new Set(['gotcha', 'decision'])

/**
 * Session-start injection. No query, no embedding, one indexed read: an agent
 * opening a session has no search terms yet, so selection is deterministic -
 * most recently updated first, L0 for everything, L1 for the newest five.
 */
export async function buildDigest(input: DigestInput): Promise<Digest> {
  const budget = Math.max(input.budgetTokens ?? DEFAULT_BUDGET, 1)
  await requireProjectRole(input.userId, input.projectId, 'read')

  const { rows, procedures } = await withUser(input.userId, async (client) => {
    const read = (filter: string, limit: number) =>
      client.query<DigestRow>(
        `select path, title, summary, kind, updated_at
         from memories
         where project_id = $1 and deleted_at is null ${filter}
         order by updated_at desc, path
         limit ${limit}`,
        [input.projectId],
      )

    // Imported files are a repository dump, not knowledge: a hundred of them
    // would fill the budget and push the decisions out of it.
    const ordinary = await read("and kind <> 'import'", MAX_ROWS)
    // Procedures are fetched by kind so age cannot hide a runbook.
    const books = await read("and kind = 'procedure'", PROCEDURE_LIMIT)

    if (ordinary.rows.length === 0 && books.rows.length === 0) {
      // A project holding nothing but an import still deserves an answer.
      const fallback = await read('', MAX_ROWS)
      return { rows: fallback.rows, procedures: [] }
    }

    return { rows: ordinary.rows, procedures: books.rows }
  })

  if (rows.length === 0 && procedures.length === 0) {
    return { text: '', memoryCount: 0, truncated: false }
  }

  const recent = new Set(rows.slice(0, RECENT_SUMMARIES).map((row) => row.path))

  // A runbook stays valid until it is replaced, while a gotcha is only as good
  // as its last verification. So procedures lead, whatever their age.
  const promoted = new Set(procedures.map((row) => row.path))

  const groups = new Map<string, typeof rows>()
  for (const row of rows) {
    const top = row.path.includes('/') ? row.path.slice(0, row.path.indexOf('/')) : row.path
    const bucket = groups.get(top)
    if (bucket) bucket.push(row)
    else groups.set(top, [row])
  }

  let text = ''
  let included = 0
  let truncated = false

  if (procedures.length > 0) {
    const head = '### Procedures\n'
    let block = ''

    for (const row of procedures) {
      const day = row.updated_at.toISOString().slice(0, 10)
      const chunk = `## ${row.path} (${day})\n${row.summary ?? row.title}\n\n`
      if (Math.ceil((head.length + block.length + chunk.length) / 4) > budget) {
        truncated = true
        break
      }
      block += chunk
      included++
    }

    if (block) text = head + block
    if (truncated) return { text: text.trimEnd(), memoryCount: included, truncated }
  }

  outer: for (const [dir, entries] of groups) {
    const header = `### ${dir}\n`
    let emittedHeader = false

    for (const row of entries) {
      // Already listed at the top, where being a procedure counts more than age.
      if (promoted.has(row.path)) continue

      // The date is the whole point of a session-start digest: a fact from six
      // months ago and one from yesterday read the same without it.
      const day = row.updated_at.toISOString().slice(0, 10)
      const label = LABELLED.has(row.kind) ? ` [${row.kind}]` : ''
      const chunk = recent.has(row.path)
        ? `## ${row.path} (${day})${label}\n${row.summary ?? row.title}\n\n`
        : `- ${row.path.includes('/') ? row.path.slice(dir.length + 1) : row.path}${label} - ${row.title} · ${day}\n`
      const candidate = emittedHeader ? text + chunk : text + header + chunk

      if (Math.ceil(candidate.length / 4) > budget) {
        truncated = true
        break outer
      }

      text = candidate
      emittedHeader = true
      included++
    }
  }

  return { text: text.trimEnd(), memoryCount: included, truncated }
}
