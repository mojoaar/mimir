import { tool, type Plugin } from "@opencode-ai/plugin";
import { callTool, detectRepo } from "./client.js";

const z = tool.schema;

const DIGEST_HEADER = "## What this project already knows (Mimir)\n\n";

/**
 * Two tools plus one injection point. The tools are for anything the agent
 * asks for later; the transform hook is what puts the project's digest in
 * front of it before the first turn, so a session starts informed without
 * spending a tool call. The hook is experimental in the plugin API and
 * fail-soft by design: a slow or missing Mimir must never hold up a session.
 */
const injectedFor = new Set<string>()

export const MimirPlugin: Plugin = async (input) => {
  const directory = input.directory;

  return {
    "experimental.chat.system.transform": async ({ sessionID }, output) => {
      if (!process.env.MIMIR_URL || !process.env.MIMIR_TOKEN) return;

      // This hook runs immediately before every model dispatch, not once per
      // session, so a session is fetched once and then left alone.
      const session = sessionID ?? "default";
      if (injectedFor.has(session)) return;

      const result = await callTool(
        "memory_digest",
        { repo: detectRepo(directory) ?? undefined, budget_tokens: 800 },
        { timeoutMs: 1500 },
      ).catch(() => null);

      if (!result?.ok) return;
      const digest = result.result as { text?: string };
      const text = digest.text?.trim();
      if (text) {
        output.system.push(`${DIGEST_HEADER}${text}`);
        injectedFor.add(session);
      }
    },

    tool: {
      mimir_digest: tool({
        description:
          "Load what this project already knows from Mimir. Call once at the start of a session, before searching for anything.",
        args: {
          budget_tokens: z
            .number()
            .int()
            .positive()
            .optional()
            .describe("Rough size cap, default 800"),
        },
        async execute(args, context) {
          const result = await callTool(
            "memory_digest",
            {
              budget_tokens: args.budget_tokens,
              repo: detectRepo(context.directory) ?? undefined,
            },
            { timeoutMs: 5000 },
          );
          if (!result.ok)
            return `Mimir is unavailable (${result.error}). Carry on without it.`;
          const digest = result.result as { text?: string };
          return (
            digest.text?.trim() ||
            "Mimir has nothing stored for this project yet."
          );
        },
      }),

      mimir_remember: tool({
        description:
          'Store one durable fact in Mimir. Use a path like "deploy/rollback" or "auth/token-rotation"; rewriting the same path replaces what was there.',
        args: {
          path: z
            .string()
            .describe("Slash-separated memory path, e.g. deploy/rollback"),
          body: z
            .string()
            .describe(
              "What to remember, written so it reads without the conversation",
            ),
          kind: z
            .enum(["note", "fact", "decision", "gotcha", "snippet"])
            .optional(),
        },
        async execute(args, context) {
          const result = await callTool(
            "memory_write",
            {
              path: args.path,
              body: args.body,
              kind: args.kind,
              repo: detectRepo(context.directory) ?? undefined,
            },
            { timeoutMs: 8000 },
          );
          if (!result.ok) return `Could not store that (${result.error}).`;
          const written = result.result as { path?: string; created?: boolean };
          return `${written.created ? "Stored" : "Updated"} ${written.path ?? args.path}.`;
        },
      }),
    },
  };
};

export default MimirPlugin;
