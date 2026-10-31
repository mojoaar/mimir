/**
 * The slice of oh-my-pi's extension API this plugin touches, declared here on
 * purpose: `@oh-my-pi/pi-coding-agent` unpacks to about 50 MB and we use four
 * members of it. Shapes match its published types (18.x); `test/fake.ts` is the
 * other half of that promise, so a drift shows up as a failing test rather than
 * a silent no-op. If this grows past a handful of members, take the dependency.
 */

export type StringSchema = {
  describe(text: string): StringSchema;
  optional(): StringSchema;
};

export type BooleanSchema = {
  describe(text: string): BooleanSchema;
  optional(): BooleanSchema;
};

export type Zod = {
  object(shape: Record<string, StringSchema | BooleanSchema>): unknown;
  string(): StringSchema;
  boolean(): BooleanSchema;
};

export type ExtensionContext = {
  cwd: string;
  /** False in rpc, json and print modes, where there is nobody to notify. */
  hasUI: boolean;
  ui: { notify(text: string): void };
  /**
   * Probed on omp 18.13.3: the host hands a sessionManager with only
   * `onEntryAppended`, and no `getSessionFile`, so both stay optional and the
   * plugin falls back to the session file on disk.
   */
  sessionManager?: { getMessages?: () => Promise<unknown[]> };
  getSessionFile?: () => string | null;
};

export type DeveloperMessage = {
  role: "developer";
  content: string;
  timestamp: number;
  synthetic?: boolean;
};

/** The messages about to go to the model. Treated as opaque: we only append. */
export type Message = Record<string, unknown>;

export type ContextEvent = { messages: Message[] };
export type ContextResult = { messages: Message[] } | undefined;

export type TextBlock = { type: "text"; text: string };

export type ToolResult = {
  content: TextBlock[];
  details: Record<string, unknown>;
};

export type ToolDefinition = {
  name: string;
  label: string;
  description: string;
  parameters: unknown;
  /** `read` skips the write confirmation omp shows for anything that mutates. */
  approval?: "read" | "write" | "exec";
  execute(
    toolCallId: string,
    params: Record<string, unknown>,
    signal: AbortSignal | undefined,
    onUpdate: unknown,
    ctx: ExtensionContext,
  ): Promise<ToolResult>;
};

export type CommandDefinition = {
  description?: string;
  handler(args: unknown, ctx: ExtensionContext): Promise<void> | void;
};

export type ExtensionAPI = {
  zod: Zod;
  on<E = unknown>(
    event: string,
    handler: (event: E, ctx: ExtensionContext) => unknown | Promise<unknown>,
  ): void;
  registerTool(tool: ToolDefinition): void;
  registerCommand(name: string, definition: CommandDefinition): void;
};
