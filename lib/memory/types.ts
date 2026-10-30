export const MEMORY_KINDS = [
  'note',
  'fact',
  'decision',
  'gotcha',
  'procedure',
  'snippet',
  'import',
] as const
export type MemoryKind = (typeof MEMORY_KINDS)[number]

export type MemoryRow = {
  id: string
  path: string
  title: string
  summary: string | null
  body: string
  kind: string
  client: string | null
  session: string | null
  updatedAt: Date
}

/** Path is the shipped default; the two dates are newest first. */
export type TreeOrder = 'path' | 'added' | 'updated'

export type TreeEntry = {
  path: string
  title: string
  hasSummary: boolean
  createdAt: Date
  updatedAt: Date
}

export type WriteInput = {
  userId: string
  projectId: string
  path: string
  body: string
  title?: string
  kind?: string
  source?: string
  client?: string
  session?: string
  /**
   * A vector made by the caller, for a bulk import that embeds a chunk at a
   * time. `null` means the call was already tried and failed, so the write
   * must not try again for every file.
   */
  embedding?: { literal: string; model: string } | null
}

export type WriteResult = { path: string; created: boolean }
