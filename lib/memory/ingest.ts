import { Buffer } from 'node:buffer'
import { InvalidInput, MAX_BODY_BYTES, normalisePath } from './path'
import { writeMemory } from './service'

export const MAX_INGEST_FILES = 100
export const MAX_INGEST_BYTES = 2 * 1024 * 1024

export type IngestFile = { path: string; body: string }
export type IngestResult = { written: number; skipped: string[] }

type IngestInput = {
  userId: string
  projectId: string
  files: IngestFile[]
  prefix?: string
}

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

  const skipped: string[] = []
  let written = 0

  for (const file of files) {
    let path: string
    try {
      path = normalisePath(prefix ? `${prefix}/${file.path}` : file.path)
    } catch {
      skipped.push(file.path)
      continue
    }

    try {
      await writeMemory({ userId, projectId, path, body: file.body, kind: 'import', source: 'ingest' })
      written += 1
    } catch (error) {
      const code = (error as { code?: string }).code
      if (code === 'invalid_path' || code === 'invalid_params' || code === 'body_too_large') {
        skipped.push(file.path)
        continue
      }
      throw error
    }
  }

  return { written, skipped }
}
