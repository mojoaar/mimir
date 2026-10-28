import { chatComplete, type ProviderError } from '@/lib/providers/client'
import { resolveExtractionProvider } from '@/lib/providers/resolve'
import { withAdmin } from '@/lib/db/tx'
import { MEMORY_KINDS } from '@/lib/memory/types'
import { buildDigest } from '@/lib/memory/digest'
import { writeMemory } from '@/lib/memory/service'
import { registerWorker } from './boss'
import { EXTRACT_TIMEOUT_MS } from './constants'

const SYSTEM = `You distil a working session into long-term memory for one software project. Reply with JSON only, no prose and no code fences: {"memories":[{"path":string,"title":string,"body":string,"kind":string}]}. Write at most three. Each is one durable outcome: a decision and its reason, a convention, a gotcha, or a procedure. "path" is lowercase and slash-separated, and says where the fact belongs, for example deploy/rollback. "title" is one imperative line of at most 80 characters. "body" states the fact with the reason or the trap, in under 2000 characters. "kind" is one of ${MEMORY_KINDS.join(', ')}. Reply {"memories":[]} when the session settled nothing durable. Never include secrets, tokens, passwords or customer data, and do not restate what the digest already says.`

const MAX_MEMORIES = 3
const TITLE_MAX = 120
const BODY_MAX = 4000
// The digest exists to stop the model restating what is already stored, and it
// competes with the transcript for the context window, so keep it small.
const DIGEST_BUDGET = 600

export type LearnData = { projectId: string; transcript: string; hint?: string | null }
export type LearnResult = { written: number }

export type LearnedMemory = { path: string; title: string; body: string; kind: string }

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null
}

/** Returns [] for anything that is not a usable list of memories. */
export function parseLearn(reply: string): LearnedMemory[] {
  const body = reply
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
  let parsed: unknown
  try {
    parsed = JSON.parse(body)
  } catch {
    return []
  }
  if (typeof parsed !== 'object' || parsed === null) return []
  const list = (parsed as { memories?: unknown }).memories
  if (!Array.isArray(list)) return []

  const out: LearnedMemory[] = []
  for (const item of list) {
    if (typeof item !== 'object' || item === null) continue
    const record = item as Record<string, unknown>
    const path = text(record.path)
    const title = text(record.title)
    const memoryBody = text(record.body)
    if (!path || !title || !memoryBody) continue
    // An unknown kind is not worth dropping the memory over: it stores as a note.
    const kind = text(record.kind)
    out.push({
      path,
      title: title.slice(0, TITLE_MAX),
      body: memoryBody.slice(0, BODY_MAX),
      kind: kind && (MEMORY_KINDS as readonly string[]).includes(kind) ? kind : 'note',
    })
    if (out.length === MAX_MEMORIES) break
  }
  return out
}

/**
 * Reads a transcript and writes what the project model judged durable. Runs as
 * the owner, like extraction: the session was already authorised when the job
 * was queued, and a sessionless app connection sees no rows under RLS.
 */
export async function runLearn(data: LearnData): Promise<LearnResult> {
  const { projectId, transcript, hint } = data
  const project = await withAdmin(async (client) => {
    const { rows } = await client.query<{ owner_user_id: string; learning_enabled: boolean }>(
      'select owner_user_id, learning_enabled from projects where id = $1',
      [projectId],
    )
    return rows[0] ?? null
  })
  if (project?.learning_enabled !== true) return { written: 0 }

  const provider = await resolveExtractionProvider(projectId)
  if (!provider) return { written: 0 }

  const digest = await buildDigest({ userId: project.owner_user_id, projectId, budgetTokens: DIGEST_BUDGET })
  const known = digest.text.trim() === '' ? '(nothing yet)' : digest.text.trim()
  const lookFor = hint ? `Look for: ${hint}\n\n` : ''
  const content = `What this project already knows:\n\n${known}\n\n${lookFor}Session:\n\n${transcript.slice(0, 32768)}`

  let reply: string
  try {
    reply = await chatComplete(
      provider,
      [
        { role: 'system', content: SYSTEM },
        { role: 'user', content },
      ],
      { timeoutMs: EXTRACT_TIMEOUT_MS, purpose: 'extract' },
    )
  } catch (error) {
    if ((error as ProviderError).detail === 'empty_completion') {
      console.error('learn skipped: the model returned no answer')
      return { written: 0 }
    }
    // Anything else is worth a retry, which pg-boss gives us for free.
    throw error
  }

  let written = 0
  for (const memory of parseLearn(reply)) {
    await writeMemory({
      userId: project.owner_user_id,
      projectId,
      path: memory.path,
      title: memory.title,
      body: memory.body,
      kind: memory.kind,
      source: 'learn',
    })
    written += 1
  }
  return { written }
}

export function registerLearnWorker(): void {
  registerWorker('learn', async (data) => {
    await runLearn(data as LearnData)
  })
}

registerLearnWorker()
