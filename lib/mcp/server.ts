import type { AuthUser } from '@/lib/auth/types'
import { audit } from '@/lib/audit'
import { TOOLS, findTool, type McpMeta } from './tools'
import {
  INTERNAL_ERROR,
  INVALID_PARAMS,
  INVALID_REQUEST,
  METHOD_NOT_FOUND,
  PARSE_ERROR,
  SERVICE_ERROR,
  rpcError,
  type RpcErrorObject,
} from './errors'
import pkg from '../../package.json'

export const PROTOCOL_VERSION = '2025-06-18'

/**
 * Sent to the client in the initialize response. This is how a client without
 * a plugin learns the one thing that makes the product useful: ask for the
 * digest before doing anything else.
 */
export const INSTRUCTIONS = [
  'Mimir stores long-term project memory.',
  'At the start of a session, call memory_digest with `repo` to load what is already known about this project.',
  'Before answering a question about the codebase, call memory_search with a path_prefix when you know roughly where the answer lives.',
  'When you settle a decision, hit a gotcha, or establish a convention, call memory_write once at a clear path. Writes upsert, so update the existing path rather than adding variants.',
  'One memory is one outcome: what changed, why, and the trap you hit — not a log of what you did.',
].join(' ')

type JsonRpcId = string | number | null

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Project-not-found and forbidden are the same answer to a client: neither reveals that the other project exists. */
const SERVICE_CODES = new Set([
  'forbidden',
  'not_found',
  'invalid_path',
  'invalid_params',
  'body_too_large',
  'rate_limited',
])

function errorCodeFor(err: unknown): string {
  const code = (err as { code?: unknown }).code
  if (typeof code !== 'string') return 'internal'
  // An unrecognised code may be a postgres SQLSTATE or a driver message; it
  // must never be echoed to a client, only our own documented codes are.
  if (code === 'project_not_found') return 'forbidden'
  return SERVICE_CODES.has(code) ? code : 'internal'
}

/**
 * One JSON-RPC response, or null for a notification (which has no id and gets
 * no reply). Stateless: every call carries its own auth.
 */
export async function handleRpc(
  body: unknown,
  user: AuthUser,
  meta: McpMeta,
): Promise<unknown> {
  if (!isObject(body)) {
    return { jsonrpc: '2.0', id: null, error: rpcError(INVALID_REQUEST, 'invalid_request', 'expected a JSON-RPC object, not a batch') }
  }

  const id = (body.id ?? null) as JsonRpcId
  const method = body.method

  if (body.jsonrpc !== '2.0' || typeof method !== 'string') {
    return { jsonrpc: '2.0', id, error: rpcError(INVALID_REQUEST, 'invalid_request', 'jsonrpc must be "2.0" and method must be a string') }
  }

  // Notifications get no response at all.
  const isNotification = !('id' in body)

  if (method === 'notifications/initialized' || method === 'notifications/cancelled') {
    return null
  }

  if (method === 'initialize') {
    // Answer with the version we implement. Echoing the client's number would
    // claim support for a revision we never wrote.
    const result = {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: 'mimir', version: pkg.version },
      instructions: INSTRUCTIONS,
    }
    return isNotification ? null : { jsonrpc: '2.0', id, result }
  }

  if (method === 'ping') {
    return isNotification ? null : { jsonrpc: '2.0', id, result: {} }
  }

  if (method === 'tools/list') {
    const result = {
      tools: TOOLS.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })),
    }
    return isNotification ? null : { jsonrpc: '2.0', id, result }
  }

  if (method === 'tools/call') {
    return callTool(body, id, user, meta, isNotification)
  }

  if (isNotification) return null
  return { jsonrpc: '2.0', id, error: rpcError(METHOD_NOT_FOUND, 'method_not_found', `unknown method: ${method}`) }
}

async function callTool(
  body: Record<string, unknown>,
  id: JsonRpcId,
  user: AuthUser,
  meta: McpMeta,
  isNotification: boolean,
): Promise<unknown> {
  const params = isObject(body.params) ? body.params : {}
  const name = params.name
  const tool = typeof name === 'string' ? findTool(name) : undefined

  if (!tool) {
    if (isNotification) return null
    return { jsonrpc: '2.0', id, error: rpcError(INVALID_PARAMS, 'invalid_params', `unknown tool: ${String(name)}`) }
  }

  const args = isObject(params.arguments) ? params.arguments : {}

  let error: RpcErrorObject | null = null
  let result: unknown

  try {
    result = await tool.handler(args, { user, meta })
  } catch (err) {
    const code = errorCodeFor(err)
    error =
      code === 'internal'
        ? rpcError(INTERNAL_ERROR, 'internal', 'internal error')
        : rpcError(SERVICE_ERROR, code, (err as Error).message || code)
  }

  // One audit row per call, successful or not. A failed read is still an act of
  // reading, and the detail never carries a memory body.
  await audit({
    actorType: 'agent',
    actorId: user.id,
    action: tool.action,
    targetType: 'tool',
    targetId: tool.name,
    detail: error ? { tool: tool.name, ok: false, code: error.data.code } : { tool: tool.name, ok: true },
    ip: meta.ip ?? undefined,
    userAgent: meta.userAgent ?? undefined,
  })

  if (isNotification) return null

  if (error) {
    return { jsonrpc: '2.0', id, error }
  }

  // Standard MCP clients read `content[0].text`; script clients read the object
  // directly. Both are satisfied by carrying the payload and its text form.
  return {
    jsonrpc: '2.0',
    id,
    result: {
      ...(isObject(result) ? result : { items: result }),
      content: [{ type: 'text', text: JSON.stringify(result) }],
      isError: false,
    },
  }
}

export { PARSE_ERROR }
