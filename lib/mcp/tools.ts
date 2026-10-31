import type { AuthUser } from "@/lib/auth/types";
import type { RequestMeta } from "@/lib/auth/login";
import {
  resolveProject,
  listProjects,
  ProjectNotFoundError,
} from "@/lib/projects/service";
import { MEMORY_KINDS } from "@/lib/memory/types";
import {
  writeMemory,
  readMemory,
  treeMemory,
  deleteMemory,
} from "@/lib/memory/service";
import { searchMemories } from "@/lib/memory/search";
import { listVersions, restoreVersion } from "@/lib/memory/versions";
import { buildDigest, EMPTY_HINT } from "@/lib/memory/digest";
import { ingestFiles, type IngestFile } from "@/lib/memory/ingest";
import { learningReadiness } from "@/lib/projects/learning";
import { invalidParams } from "./errors";

export type McpMeta = RequestMeta & { repo?: string | null };

export type ToolContext = { user: AuthUser; meta: McpMeta };

export type ToolDef = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  /** Audit action recorded for every call, one row per call. */
  action: string;
  handler: (
    args: Record<string, unknown>,
    ctx: ToolContext,
  ) => Promise<unknown>;
};

const PROJECT_ARG = {
  type: "string",
  description: "Project slug. Optional - omit when sending `repo`.",
};
const REPO_ARG = {
  type: "string",
  description:
    "Normalised git remote (host.tld/owner/repo) or the absolute working directory, which is matched against the folders you claimed. The client computes it; the server never sees your working directory.",
};

export function str(
  args: Record<string, unknown>,
  key: string,
): string | undefined {
  const v = args[key];
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

export function num(
  args: Record<string, unknown>,
  key: string,
): number | undefined {
  const v = args[key];
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

async function projectFor(
  args: Record<string, unknown>,
  ctx: ToolContext,
  create: boolean,
) {
  const repo = str(args, "repo") ?? ctx.meta.repo ?? undefined;
  return resolveProject(ctx.user.id, {
    project: str(args, "project"),
    repo,
    create,
  });
}

const TOOLS: ToolDef[] = [
  {
    name: "memory_tree",
    action: "memory.read",
    description:
      "List memory paths and their one-line titles under a prefix. Directories are virtual: they are the distinct prefixes of stored paths.",
    inputSchema: {
      type: "object",
      properties: {
        project: PROJECT_ARG,
        repo: REPO_ARG,
        path: {
          type: "string",
          description: 'Directory prefix, e.g. "auth". Defaults to the root.',
        },
        depth: {
          type: "number",
          description: "Levels below the prefix to include. Default 3.",
        },
      },
    },
    handler: async (args, ctx) => {
      const p = await projectFor(args, ctx, false);
      return treeMemory(
        ctx.user.id,
        p.id,
        str(args, "path") ?? "",
        num(args, "depth") ?? 3,
      );
    },
  },
  {
    name: "memory_read",
    action: "memory.read",
    description:
      "Read one memory by its exact path. Cheaper than searching when you already know where the answer lives.",
    inputSchema: {
      type: "object",
      properties: {
        project: PROJECT_ARG,
        repo: REPO_ARG,
        path: { type: "string" },
      },
      required: ["path"],
    },
    handler: async (args, ctx) => {
      const path = str(args, "path");
      if (!path) throw invalidParams("path is required");
      const p = await projectFor(args, ctx, false);
      const memory = await readMemory(ctx.user.id, p.id, path);
      if (!memory)
        throw Object.assign(new Error("not_found"), { code: "not_found" });
      return memory;
    },
  },
  {
    name: "memory_search",
    action: "memory.read",
    description:
      "Hybrid search over memory. Returns titles and summaries only - read the path if you need the body. Scope it with path_prefix so auth knowledge does not pollute a deploy question. Without project or repo it searches every project you can read.",
    inputSchema: {
      type: "object",
      properties: {
        project: PROJECT_ARG,
        repo: REPO_ARG,
        query: { type: "string" },
        path_prefix: { type: "string" },
        limit: { type: "number" },
      },
      required: ["query"],
    },
    handler: async (args, ctx) => {
      const query = str(args, "query");
      if (!query) throw invalidParams("query is required");
      // No project named means every project, which is the whole point of a
      // session asking "did I solve this somewhere else?". The client header is
      // deliberately not consulted: every configured agent sends one, so it
      // would make the cross-project search unreachable.
      const scoped = str(args, "project") || str(args, "repo");
      const projectId = scoped
        ? (await projectFor(args, ctx, false)).id
        : undefined;
      return searchMemories({
        userId: ctx.user.id,
        projectId,
        query,
        pathPrefix: str(args, "path_prefix"),
        limit: num(args, "limit"),
      });
    },
  },
  {
    name: "memory_digest",
    action: "memory.read",
    description:
      "Call this once at the start of a session. Returns the project digest - titles of recent memories plus summaries of the newest few - packed into a token budget. No search terms needed.",
    inputSchema: {
      type: "object",
      properties: {
        project: PROJECT_ARG,
        repo: REPO_ARG,
        budget_tokens: { type: "number", description: "Default 800." },
      },
    },
    handler: async (args, ctx) => {
      // A repository Mimir has never seen has no project row yet, and the
      // session-start call is exactly when that must not be an error.
      let p;
      try {
        p = await projectFor(args, ctx, false);
      } catch (error) {
        if (error instanceof ProjectNotFoundError) {
          return { text: EMPTY_HINT, memoryCount: 0, truncated: false };
        }
        throw error;
      }
      return buildDigest({
        userId: ctx.user.id,
        projectId: p.id,
        budgetTokens: num(args, "budget_tokens"),
      });
    },
  },
  {
    name: "memory_write",
    action: "memory.write",
    description:
      "Write or update one memory at a path. Writes upsert: writing the same path again replaces it, so update what we know rather than appending variants.",
    inputSchema: {
      type: "object",
      properties: {
        project: PROJECT_ARG,
        repo: REPO_ARG,
        path: { type: "string", description: "e.g. auth/jwt/refresh-rotation" },
        body: { type: "string", maxLength: 262144 },
        title: {
          type: "string",
          description: "One line. Defaults to the first line of the body.",
        },
        kind: { type: "string", enum: MEMORY_KINDS },
        client: {
          type: "string",
          maxLength: 64,
          description: "Which client wrote it, e.g. opencode",
        },
        session: {
          type: "string",
          maxLength: 128,
          description: "The client's session id, if it has one",
        },
      },
      required: ["path", "body"],
    },
    handler: async (args, ctx) => {
      const path = str(args, "path");
      const body = str(args, "body");
      if (!path || body === undefined)
        throw invalidParams("path and body are required");
      const p = await projectFor(args, ctx, true);
      const written = await writeMemory({
        userId: ctx.user.id,
        projectId: p.id,
        path,
        body,
        title: str(args, "title"),
        kind: str(args, "kind"),
        source: "agent",
        client: str(args, "client"),
        session: str(args, "session"),
      });
      return { ...written, projectCreated: p.created };
    },
  },
  {
    name: "memory_ingest",
    action: "memory.write",
    description:
      "Import a repository in one call: a batch of files, each written as a memory under the import prefix. Use this once when Mimir first meets a repo; use memory_write afterwards for what you learn.",
    inputSchema: {
      type: "object",
      properties: {
        project: PROJECT_ARG,
        repo: REPO_ARG,
        files: {
          type: "array",
          maxItems: 100,
          description: "Up to 100 files, 2 MB total. Each is {path, body}.",
          items: {
            type: "object",
            properties: {
              path: {
                type: "string",
                description: "Repo-relative path, e.g. docs/readme.md",
              },
              body: { type: "string", maxLength: 262144 },
            },
            required: ["path", "body"],
          },
        },
        path_prefix: { type: "string", description: "Defaults to import." },
      },
      required: ["files"],
    },
    handler: async (args, ctx) => {
      if (!Array.isArray(args.files))
        throw invalidParams("files must be an array");
      const p = await projectFor(args, ctx, true);
      const ingested = await ingestFiles({
        userId: ctx.user.id,
        projectId: p.id,
        files: args.files as IngestFile[],
        prefix: str(args, "path_prefix"),
      });
      return { ...ingested, projectCreated: p.created };
    },
  },
  {
    name: "memory_learn",
    action: "memory.learn",
    description:
      "Distil a session into memories. Send the part of the conversation worth keeping; the project model writes the one to three durable facts it finds. It answers at once and writes in the background, so check memory_digest later.",
    inputSchema: {
      type: "object",
      properties: {
        project: PROJECT_ARG,
        repo: REPO_ARG,
        transcript: {
          type: "string",
          maxLength: 32768,
          description: "The conversation excerpt, verbatim. Up to 32 KB.",
        },
        hint: {
          type: "string",
          maxLength: 500,
          description: 'What to look for, e.g. "the deploy rollback".',
        },
        client: {
          type: "string",
          maxLength: 64,
          description: "Which client wrote it, e.g. opencode",
        },
        session: {
          type: "string",
          maxLength: 128,
          description: "The client's session id, if it has one",
        },
      },
      required: ["transcript"],
    },
    handler: async (args, ctx) => {
      const transcript = str(args, "transcript");
      if (!transcript) throw invalidParams("transcript is required");
      const p = await projectFor(args, ctx, true);
      // A job queued on a project that cannot learn does nothing, so say which
      // of the two it is instead of answering with a promise that reads as done.
      const ready = await learningReadiness(p.id);
      if (!ready.learning)
        return { queued: false, reason: "learning is off for this project" };
      if (!ready.provider)
        return { queued: false, reason: "no language provider is configured" };
      const { sendJob } = await import("@/lib/jobs/boss");
      const id = await sendJob("learn", {
        projectId: p.id,
        transcript: transcript.slice(0, 32768),
        hint: str(args, "hint")?.slice(0, 500) ?? null,
        client: str(args, "client")?.slice(0, 64) ?? null,
        session: str(args, "session")?.slice(0, 128) ?? null,
      });
      return { queued: id !== null, projectCreated: p.created };
    },
  },
  {
    name: "memory_versions",
    action: "memory.read",
    description:
      "List the versions of one memory, newest first, with the size and who wrote each. Use it before overwriting a path you did not write.",
    inputSchema: {
      type: "object",
      properties: {
        project: PROJECT_ARG,
        repo: REPO_ARG,
        path: { type: "string", description: "The memory path" },
      },
      required: ["path"],
    },
    handler: async (args, ctx) => {
      const path = str(args, "path");
      if (!path) throw invalidParams("path is required");
      const p = await projectFor(args, ctx, false);
      return listVersions(ctx.user.id, p.id, path);
    },
  },
  {
    name: "memory_restore",
    action: "memory.write",
    description:
      "Put a version back. The current body is archived first, so restoring is itself undoable.",
    inputSchema: {
      type: "object",
      properties: {
        project: PROJECT_ARG,
        repo: REPO_ARG,
        versionId: { type: "string", description: "From memory_versions" },
      },
      required: ["versionId"],
    },
    handler: async (args, ctx) => {
      const versionId = str(args, "versionId");
      if (!versionId) throw invalidParams("versionId is required");
      const p = await projectFor(args, ctx, false);
      return restoreVersion(ctx.user.id, p.id, versionId);
    },
  },
  {
    name: "memory_delete",
    action: "memory.delete",
    description:
      "Delete a memory. It is hidden immediately and purged after 30 days, so a mistaken delete is recoverable.",
    inputSchema: {
      type: "object",
      properties: {
        project: PROJECT_ARG,
        repo: REPO_ARG,
        path: { type: "string" },
      },
      required: ["path"],
    },
    handler: async (args, ctx) => {
      const path = str(args, "path");
      if (!path) throw invalidParams("path is required");
      const p = await projectFor(args, ctx, false);
      return { deleted: await deleteMemory(ctx.user.id, p.id, path) };
    },
  },
  {
    name: "project_list",
    action: "project.list",
    description:
      "List the projects you own or have been given access to, with your role in each.",
    inputSchema: { type: "object", properties: {} },
    handler: async (_args, ctx) => listProjects(ctx.user.id),
  },
];

export { TOOLS };

export const TOOL_NAMES = TOOLS.map((t) => t.name);

export function findTool(name: string): ToolDef | undefined {
  return TOOLS.find((t) => t.name === name);
}
