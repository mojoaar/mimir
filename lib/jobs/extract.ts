import { chatComplete, type ProviderError } from '@/lib/providers/client'
import { resolveExtractionProvider } from '@/lib/providers/resolve'
import { withAdmin } from '@/lib/db/tx'
import { registerWorker } from './boss'
import { EXTRACT_TIMEOUT_MS } from './constants'

const SYSTEM = `You write compact metadata for a software engineering memory store. Reply with JSON only, no prose and no code fences: {"title": string, "summary": string}. "title" is one imperative line of at most 80 characters naming what the memory states. "summary" is one or two sentences, at most 300 characters, stating the fact so it can be understood without the body.`

const TITLE_MAX = 120
const SUMMARY_MAX = 400
// A whole body can be 256 KB; the extraction prompt only needs the gist.
const BODY_LIMIT = 8000
const BATCH = 20

export type ExtractData = { projectId: string }
export type ExtractResult = { extracted: number }

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null
}

/** Returns null for anything that is not a usable {title, summary} pair. */
export function parseExtraction(reply: string): { title: string; summary: string } | null {
  const body = reply
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
  let parsed: unknown
  try {
    parsed = JSON.parse(body)
  } catch {
    return null
  }
  if (typeof parsed !== 'object' || parsed === null) return null
  // Models do not always honour the lower-case keys the prompt asks for.
  const record = Object.fromEntries(
    Object.entries(parsed as Record<string, unknown>).map(([key, value]) => [key.toLowerCase(), value]),
  )
  const title = text(record.title)
  const summary = text(record.summary)
  if (!title || !summary) return null
  return { title: title.slice(0, TITLE_MAX), summary: summary.slice(0, SUMMARY_MAX) }
}

type PendingRow = { id: string; path: string; body: string }

/**
 * Runs as the owner: the project was already authorised when its provider was
 * resolved, and a sessionless app connection sees no rows under RLS.
 */
export async function runExtract(data: ExtractData): Promise<ExtractResult> {
  const { projectId } = data
  const { rows: projects } = await withAdmin((client) =>
    client.query<{ learning_enabled: boolean }>('select learning_enabled from projects where id = $1', [
      projectId,
    ]),
  )
  if (projects[0]?.learning_enabled !== true) return { extracted: 0 }

  const provider = await resolveExtractionProvider(projectId)
  if (!provider) return { extracted: 0 }

  const { rows } = await withAdmin((client) =>
    client.query<PendingRow>(
      `select id, path, body from memories
        where project_id = $1 and summary is null and deleted_at is null
        order by updated_at desc
        limit ${BATCH}`,
      [projectId],
    ),
  )

  let extracted = 0
  for (const row of rows) {
    let reply: string
    try {
      reply = await chatComplete(
        provider,
        [
          { role: 'system', content: SYSTEM },
          { role: 'user', content: `path: ${row.path}\n\n${row.body.slice(0, BODY_LIMIT)}` },
        ],
        { timeoutMs: EXTRACT_TIMEOUT_MS },
      )
    } catch (error) {
      // A thinking model can spend its whole budget reasoning and reply with
      // nothing. That is one useless row, not a broken provider, so the batch
      // carries on instead of stalling behind it forever.
      if ((error as ProviderError).detail === 'empty_completion') {
        console.error('extract skipped: the model returned no answer')
        continue
      }
      // The provider is down or refusing: stop, and the rest stay pending.
      console.error(`extract stopped (${(error as Error).message})`)
      break
    }
    const parsed = parseExtraction(reply)
    if (!parsed) {
      console.error('extract skipped: the reply was not usable metadata')
      continue
    }
    await withAdmin((client) =>
      client.query('update memories set title = $3, summary = $4 where id = $1 and project_id = $2', [
        row.id,
        projectId,
        parsed.title,
        parsed.summary,
      ]),
    )
    extracted += 1
  }
  return { extracted }
}

export function registerExtractWorker(): void {
  registerWorker('extract', async (data) => {
    await runExtract(data as ExtractData)
  })
}

registerExtractWorker()
