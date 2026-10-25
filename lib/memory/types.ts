export const MEMORY_KINDS = ['note', 'fact', 'decision', 'gotcha', 'snippet', 'import'] as const
export type MemoryKind = (typeof MEMORY_KINDS)[number]

export type MemoryRow = {
  id: string
  path: string
  title: string
  summary: string | null
  body: string
  kind: string
  updatedAt: Date
}

export type TreeEntry = {
  path: string
  title: string
  hasSummary: boolean
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
}

export type WriteResult = { path: string; created: boolean }
