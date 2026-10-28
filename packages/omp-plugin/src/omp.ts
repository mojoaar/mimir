/**
 * The slice of oh-my-pi's extension API this plugin touches, declared here on
 * purpose: `@oh-my-pi/pi-coding-agent` unpacks to about 50 MB and we use four
 * members of it. Shapes match its published types (18.x); `test/fake.ts` is the
 * other half of that promise, so a drift shows up as a failing test rather than
 * a silent no-op. If this grows past a handful of members, take the dependency.
 */

export type StringSchema = {
  describe(text: string): StringSchema
  optional(): StringSchema
}

export type Zod = {
  object(shape: Record<string, StringSchema>): unknown
  string(): StringSchema
}

export type ExtensionContext = { cwd: string }

export type DeveloperMessage = {
  role: 'developer'
  content: string
  timestamp: number
  synthetic?: boolean
}

/** The messages about to go to the model. Treated as opaque: we only append. */
export type Message = Record<string, unknown>

export type ContextEvent = { messages: Message[] }
export type ContextResult = { messages: Message[] } | undefined

export type TextBlock = { type: 'text'; text: string }

export type ToolResult = {
  content: TextBlock[]
  details: Record<string, unknown>
}

export type ToolDefinition = {
  name: string
  label: string
  description: string
  parameters: unknown
  /** `read` skips the write confirmation omp shows for anything that mutates. */
  approval?: 'read' | 'write' | 'exec'
  execute(
    toolCallId: string,
    params: Record<string, unknown>,
    signal: AbortSignal | undefined,
    onUpdate: unknown,
    ctx: ExtensionContext,
  ): Promise<ToolResult>
}

export type ExtensionAPI = {
  zod: Zod
  on<E = unknown>(event: string, handler: (event: E, ctx: ExtensionContext) => unknown | Promise<unknown>): void
  registerTool(tool: ToolDefinition): void
}
