export type RpcErrorObject = {
  code: number
  message: string
  data: { code: string }
}

/** JSON-RPC error with a stable machine-readable `data.code` the clients can branch on. */
export function rpcError(code: number, dataCode: string, message: string): RpcErrorObject {
  return { code, message, data: { code: dataCode } }
}

export const PARSE_ERROR = -32700
export const INVALID_REQUEST = -32600
export const METHOD_NOT_FOUND = -32601
export const INVALID_PARAMS = -32602
export const INTERNAL_ERROR = -32603
export const SERVICE_ERROR = -32000

/** Argument problem the caller can fix. */
export function invalidParams(message: string): Error & { code: 'invalid_params' } {
  return Object.assign(new Error(message), { code: 'invalid_params' as const })
}
