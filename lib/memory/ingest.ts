import { Buffer } from 'node:buffer'
import { embed } from '@/lib/providers/client'
import { resolveEmbeddingProvider } from '@/lib/providers/resolve'
import { EMBEDDING_DIM } from '@/lib/settings/embedding'
import { EMBED_TEXT_LIMIT, toVectorLiteral } from './embeddings'
import { InvalidInput, MAX_BODY_BYTES, normalisePath, titleFromBody } from './path'
import { writeMemory } from './service'

export const MAX_INGEST_FILES = 100
export const MAX_INGEST_BYTES = 2 * 1024 * 1024

/**
 * A repository import is a hundred small files, and one provider call per file
 * is a hundred round trips. Sixteen is the size embeddings APIs are usually
 * built for, and it keeps a failure to a sixth of the import.
 */
const EMBED_BATCH = 16

export type IngestFile = { path: string; body: string }
export type IngestSkip = { path: string; reason: string }
export type IngestResult = { written: number; skipped: IngestSkip[] }

type IngestInput = {
  userId: string
  projectId: string
  files: IngestFile[]
  prefix?: string
}

type Prepared = { path: string; body: string }

/**
 * Writes a batch of repo files into memory. The caps are checked before the
 * first write, so a rejected batch leaves nothing behind; a single bad file
 * name is reported in `skipped` rather than discarding the whole import.
 */
export async function ingestFiles(input: IngestInput): Promise<IngestResult> {
  const { userId, projectId, files } = input
  const prefix = input.prefix ?? 'import'

  if (!Array.isArray(files)) throw new InvalidInput('files must be an array')
  if (files.length > MAX_INGEST_FILES) {
    throw new InvalidInput(`a batch may hold at most ${MAX_INGEST_FILES} files`)
  }

  let bytes = 0
  for (const file of files) {
    const entry = file as Partial<IngestFile> | null | undefined
    if (!entry || typeof entry.path !== 'string' || typeof entry.body !== 'string') {
      throw new InvalidInput('every file needs a string path and a string body')
    }
    const size = Buffer.byteLength(entry.body)
    if (size > MAX_BODY_BYTES) {
      throw new InvalidInput(`"${entry.path}" is ${size} bytes; the limit is ${MAX_BODY_BYTES}`)
    }
    bytes += size
  }
  if (bytes > MAX_INGEST_BYTES) {
    throw new InvalidInput(`a batch may hold at most ${MAX_INGEST_BYTES} bytes`)
  }

  const skipped: IngestSkip[] = []
  const prepared: Prepared[] = []

  for (const file of files) {
    try {
      const path = normalisePath(prefix ? `${prefix}/${file.path}` : file.path)
      prepared.push({ path, body: file.body })
    } catch (error) {
      skipped.push({ path: file.path, reason: (error as Error).message })
    }
  }

  const provider = await resolveEmbeddingProvider()
  const vectors = new Map<string, { literal: string; model: string } | null>()

  if (provider) {
    for (let at = 0; at < prepared.length; at += EMBED_BATCH) {
      const chunk = prepared.slice(at, at + EMBED_BATCH)
      // The text is what writeMemory would embed on its own, so a batched
      // vector and a single one describe the same thing.
      const texts = chunk.map((entry) =>
        [entry.path, titleFromBody(entry.body), entry.body].join('\n').slice(0, EMBED_TEXT_LIMIT),
      )
      let made: number[][] | null = null
      try {
        made = await embed(provider, texts, {
          dimension: EMBEDDING_DIM,
          inputType: 'document',
          purpose: 'embed.ingest',
        })
      } catch (error) {
        console.error(`ingest embedding unavailable (${(error as Error).message})`)
      }

      chunk.forEach((entry, index) => {
        const values = made?.[index]
        const usable =
          Array.isArray(values) &&
          values.length === EMBEDDING_DIM &&
          values.every((value) => typeof value === 'number' && Number.isFinite(value))
        vectors.set(
          entry.path,
          usable ? { literal: toVectorLiteral(values), model: provider.model } : null,
        )
      })
    }
  }

  let written = 0

  for (const entry of prepared) {
    try {
      await writeMemory({
        userId,
        projectId,
        path: entry.path,
        body: entry.body,
        kind: 'import',
        source: 'ingest',
        // Undefined means "embed it yourself"; null means this chunk already
        // tried and failed, so the write lands without a vector.
        embedding: vectors.has(entry.path) ? (vectors.get(entry.path) ?? null) : undefined,
      })
      written += 1
    } catch (error) {
      const code = (error as { code?: string }).code
      if (code === 'invalid_path' || code === 'invalid_params' || code === 'body_too_large') {
        skipped.push({ path: entry.path, reason: (error as Error).message })
        continue
      }
      throw error
    }
  }

  return { written, skipped }
}
