import type { AuthUser } from '@/lib/auth/types'
import type { RequestMeta } from '@/lib/auth/login'
import { resolveProject, listProjects } from '@/lib/projects/service'
import { MEMORY_KINDS } from '@/lib/memory/types'
import {
  writeMemory,
  readMemory,
  treeMemory,
  deleteMemory,
} from '@/lib/memory/service'
import { searchMemories } from '@/lib/memory/search'
import { buildDigest } from '@/lib/memory/digest'
import { invalidParams } from './errors'

export type McpMeta = RequestMeta & { repo?: string | null }

export type ToolContext = { user: AuthUser; meta: McpMeta }

export type ToolDef = {
  name: string
  description: string
  inputSchema: Record<string, unknown>
  /** Audit action recorded for every call, one row per call. */
  action: string
  handler: (args: Record<string, unknown>, ctx: ToolContext) => Promise<unknown>
}

const PROJECT_ARG = {
  type: 'string',
  description: 'Project slug. Optional — omit when sending `repo`.',
}
const REPO_ARG = {
  type: 'string',
  description:
    'Normalised git remote: host.tld/owner/repo. The client computes it; the server never sees your working directory.',
}

export function str(args: Record<string, unknown>, key: string): string | undefined {
  const v = args[key]
  return typeof v === 'string' && v.length > 0 ? v : undefined
}

export function num(args: Record<string, unknown>, key: string): number | undefined {
  const v = args[key]
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined
}

async function projectFor(
  args: Record<string, unknown>,
  ctx: ToolContext,
  create: boolean,
) {
  const repo = str(args, 'repo') ?? ctx.meta.repo ?? undefined
  return resolveProject(ctx.user.id, { project: str(args, 'project'), repo, create })
}

const TOOLS: ToolDef[] = [
  {
    name: 'memory_tree',
    action: 'memory.read',
    description:
      'List memory paths and their one-line titles under a prefix. Directories are virtual: they are the distinct prefixes of stored paths.',
    inputSchema: {
      type: 'object',
      properties: {
        project: PROJECT_ARG,
        repo: REPO_ARG,
        path: { type: 'string', description: 'Directory prefix, e.g. "auth". Defaults to the root.' },
        depth: { type: 'number', description: 'Levels below the prefix to include. Default 3.' },
      },
    },
    handler: async (args, ctx) => {
      const p = await projectFor(args, ctx, false)
      return treeMemory(ctx.user.id, p.id, str(args, 'path') ?? '', num(args, 'depth') ?? 3)
    },
  },
  {
    name: 'memory_read',
    action: 'memory.read',
    description:
      'Read one memory by its exact path. Cheaper than searching when you already know where the answer lives.',
    inputSchema: {
      type: 'object',
      properties: { project: PROJECT_ARG, repo: REPO_ARG, path: { type: 'string' } },
      required: ['path'],
    },
    handler: async (args, ctx) => {
      const path = str(args, 'path')
      if (!path) throw invalidParams('path is required')
      const p = await projectFor(args, ctx, false)
      const memory = await readMemory(ctx.user.id, p.id, path)
      if (!memory) throw Object.assign(new Error('not_found'), { code: 'not_found' })
      return memory
    },
  },
  {
    name: 'memory_search',
    action: 'memory.read',
    description:
      'Hybrid search over memory. Returns titles and summaries only — read the path if you need the body. Scope it with path_prefix so auth knowledge does not pollute a deploy question.',
    inputSchema: {
      type: 'object',
      properties: {
        project: PROJECT_ARG,
        repo: REPO_ARG,
        query: { type: 'string' },
        path_prefix: { type: 'string' },
        limit: { type: 'number' },
      },
      required: ['query'],
    },
    handler: async (args, ctx) => {
      const query = str(args, 'query')
      if (!query) throw invalidParams('query is required')
      const p = await projectFor(args, ctx, false)
      return searchMemories({
        userId: ctx.user.id,
        projectId: p.id,
        query,
        pathPrefix: str(args, 'path_prefix'),
        limit: num(args, 'limit'),
      })
    },
  },
  {
    name: 'memory_digest',
    action: 'memory.read',
    description:
      'Call this once at the start of a session. Returns the project digest — titles of recent memories plus summaries of the newest few — packed into a token budget. No search terms needed.',
    inputSchema: {
      type: 'object',
      properties: {
        project: PROJECT_ARG,
        repo: REPO_ARG,
        budget_tokens: { type: 'number', description: 'Default 800.' },
      },
    },
    handler: async (args, ctx) => {
      const p = await projectFor(args, ctx, false)
      return buildDigest({
        userId: ctx.user.id,
        projectId: p.id,
        budgetTokens: num(args, 'budget_tokens'),
      })
    },
  },
  {
    name: 'memory_write',
    action: 'memory.write',
    description:
      'Write or update one memory at a path. Writes upsert: writing the same path again replaces it, so update what we know rather than appending variants.',
    inputSchema: {
      type: 'object',
      properties: {
        project: PROJECT_ARG,
        repo: REPO_ARG,
        path: { type: 'string', description: 'e.g. auth/jwt/refresh-rotation' },
        body: { type: 'string', maxLength: 262144 },
        title: { type: 'string', description: 'One line. Defaults to the first line of the body.' },
        kind: { type: 'string', enum: MEMORY_KINDS },
      },
      required: ['path', 'body'],
    },
    handler: async (args, ctx) => {
      const path = str(args, 'path')
      const body = str(args, 'body')
      if (!path || body === undefined) throw invalidParams('path and body are required')
      const p = await projectFor(args, ctx, true)
      return writeMemory({
        userId: ctx.user.id,
        projectId: p.id,
        path,
        body,
        title: str(args, 'title'),
        kind: str(args, 'kind'),
        source: 'agent',
      })
    },
  },
  {
    name: 'memory_delete',
    action: 'memory.delete',
    description:
      'Delete a memory. It is hidden immediately and purged after 30 days, so a mistaken delete is recoverable.',
    inputSchema: {
      type: 'object',
      properties: { project: PROJECT_ARG, repo: REPO_ARG, path: { type: 'string' } },
      required: ['path'],
    },
    handler: async (args, ctx) => {
      const path = str(args, 'path')
      if (!path) throw invalidParams('path is required')
      const p = await projectFor(args, ctx, false)
      return { deleted: await deleteMemory(ctx.user.id, p.id, path) }
    },
  },
  {
    name: 'project_list',
    action: 'project.list',
    description: 'List the projects you own or have been given access to, with your role in each.',
    inputSchema: { type: 'object', properties: {} },
    handler: async (_args, ctx) => listProjects(ctx.user.id),
  },
]

export { TOOLS }

export const TOOL_NAMES = TOOLS.map((t) => t.name)

export function findTool(name: string): ToolDef | undefined {
  return TOOLS.find((t) => t.name === name)
}
