import {
  closeSync,
  openSync,
  existsSync,
  readFileSync,
  readdirSync,
  readSync,
  statSync,
} from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import { callTool, detectRepo, resolveConfig } from "./client.js";
import type {
  ContextEvent,
  ContextResult,
  DeveloperMessage,
  ExtensionAPI,
  ExtensionContext,
} from "./omp.js";
import { registerTools } from "./tools.js";

export const DIGEST_HEADER = "## What this project already knows (Mimir)\n\n";
export const NUDGE_HEADER = "## Memory check (Mimir)\n\n";

/**
 * A fact written before a compaction is cheap; one that has already been
 * summarised away is gone. So the reminder comes every twenty messages, and
 * again the moment the transcript shrinks, which is what a compaction looks
 * like from the message list this hook is handed.
 */
const NUDGE_EVERY = 20;
const NUDGE =
  "If this session settled a decision, a convention or a gotcha that is not in Mimir yet, " +
  "call mimir_remember now at one clear path, or hand the conversation over with mimir_learn, " +
  "before the detail is compacted away.";

export const MAX_TRANSCRIPT = 32_000;
/** A compaction of nothing is not worth a model call. */
export const MIN_TRANSCRIPT = 500;
const LEARN_HINT =
  "This session was just compacted. Keep what was decided, what broke and any convention, and skip what Mimir already has.";
const LEARN_NOW_HINT =
  "The user asked for this session to be kept now. Keep what was decided, what broke and any convention, and skip what Mimir already has.";
const NOTHING_TO_SEND = "Nothing worth handing over yet.";
const UNREADABLE = "Mimir could not read this session, so nothing was sent.";
const ALREADY = "This session was already handed over.";
const SENT = "Mimir is writing what this session settled.";
const QUEUE_OFF = "Mimir took it, but its queue is not running.";
const UNREACHABLE = "Mimir is unreachable, so nothing was sent.";

/** Message text is shaped differently by each provider, so read what we can and skip the rest. */
export function transcript(messages: unknown[]): string {
  const lines: string[] = [];
  for (const message of messages) {
    if (typeof message !== "object" || message === null) continue;
    const record = message as {
      role?: unknown;
      content?: unknown;
      parts?: unknown;
    };
    const role = typeof record.role === "string" ? record.role : "message";
    const body = textOf(record.content) || textOf(record.parts);
    if (body) lines.push(`${role}: ${body}`);
  }
  return lines.join("\n\n").slice(-MAX_TRANSCRIPT);
}

function textOf(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (!Array.isArray(value)) return "";
  return value
    .map((part) => {
      if (typeof part === "string") return part;
      const text = (part as { text?: unknown })?.text;
      return typeof text === "string" ? text : "";
    })
    .join("\n")
    .trim();
}

/**
 * A stored session keeps `role` and content parts on both sides, which is a
 * different shape from the provider messages `transcript` reads.
 */
export function sessionTranscript(messages: readonly unknown[]): string {
  const lines: string[] = [];
  for (const value of messages) {
    if (typeof value !== "object" || value === null) continue;
    const record = value as {
      role?: unknown;
      text?: unknown;
      content?: unknown;
    };
    if (record.role !== "user" && record.role !== "assistant") continue;
    const body =
      typeof record.text === "string" && record.text.trim() !== ""
        ? record.text.trim()
        : textOf(
            Array.isArray(record.content)
              ? record.content.filter(
                  (part) =>
                    typeof part === "string" ||
                    (part as { type?: unknown })?.type === "text",
                )
              : record.content,
          );
    if (body) lines.push(`${record.role}: ${body}`);
  }
  return lines.join("\n\n").slice(-MAX_TRANSCRIPT);
}

const SESSIONS = () => join(homedir(), ".omp", "agent", "sessions");

/** The `session` line sits after `title`, so read a little ahead for it. */
function sessionHeader(file: string): { type?: unknown; cwd?: unknown } | null {
  const fd = openSync(file, "r");
  try {
    const buffer = Buffer.alloc(16_384);
    const read = readSync(fd, buffer, 0, buffer.length, 0);
    for (const line of buffer.subarray(0, read).toString("utf8").split("\n")) {
      if (!line.includes('"type"')) continue;
      try {
        const entry = JSON.parse(line) as { type?: unknown };
        if (entry.type === "session") return entry;
      } catch {
        // The buffer can end mid-line; the session line is written early.
      }
    }
    return null;
  } finally {
    closeSync(fd);
  }
}

/**
 * omp 18.13.3 hands the extension no session reader and no session id, so the
 * transcript comes from the file it writes. The newest file whose `session`
 * entry names this directory is the session being appended to.
 */
function sessionFile(cwd: string): string | null {
  // A machine that has never run omp has no sessions directory at all, which
  // means there is nothing to read, not that the read failed.
  if (!existsSync(SESSIONS())) return null;
  let best: { file: string; mtime: number } | null = null;
  for (const entry of readdirSync(SESSIONS(), { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const dir = join(SESSIONS(), entry.name);
    for (const name of readdirSync(dir)) {
      if (!name.endsWith(".jsonl")) continue;
      const file = join(dir, name);
      try {
        const first = sessionHeader(file);
        if (first?.cwd !== cwd) continue;
        const mtime = statSync(file).mtimeMs;
        if (!best || mtime > best.mtime) best = { file, mtime };
      } catch {
        // A half-written or unrelated file is not the one we want.
      }
    }
  }
  return best?.file ?? null;
}

/**
 * `null` means a read was attempted and failed, `''` means there is nothing to
 * read, and anything else is the transcript. The command tells those apart.
 */
export async function readHistory(
  ctx: ExtensionContext,
): Promise<string | null> {
  try {
    if (typeof ctx.sessionManager?.getMessages === "function") {
      const messages = await ctx.sessionManager.getMessages();
      return Array.isArray(messages) ? sessionTranscript(messages) : null;
    }
    const file = ctx.getSessionFile?.() ?? sessionFile(ctx.cwd);
    if (!file) return "";
    const messages: unknown[] = [];
    for (const line of readFileSync(file, "utf8").split("\n")) {
      if (!line.trim()) continue;
      const entry = JSON.parse(line) as { type?: unknown; message?: unknown };
      if (entry.type === "message" && entry.message)
        messages.push(entry.message);
    }
    return sessionTranscript(messages);
  } catch {
    return null;
  }
}

/**
 * One injection point and four tools. The digest goes in front of the model
 * before the first call, so a session starts informed without spending a tool
 * call. Everything here is fail-soft: a slow or missing Mimir must never hold
 * up a session.
 */
export const UNCONFIGURED =
  "mimir: no url, so no digest, tools or /mimir-learn. Set MIMIR_URL and put the token in ~/.omp/mimir-token, or set MIMIR_TOKEN_FILE.";

export default function mimir(pi: ExtensionAPI): void {
  const config = resolveConfig();
  if (!config) {
    // This API has no logger, and an inert plugin is otherwise invisible.
    console.warn(UNCONFIGURED);
    return;
  }

  // A folder without a git remote still needs a stable key, or every write
  // lands in a fresh project. The server maps absolute paths to `local:<hash>`.
  let repository: string | null = null;
  const repo = (cwd: string) => (repository ??= detectRepo(cwd) ?? cwd);

  let injected = false;
  let state = { messages: 0, nudgedAt: 0 };
  let pending = "";
  // One handover per process: a second command would send the whole session
  // again, and the server would dedupe nothing.
  let handedOver = false;

  const reset = () => {
    injected = false;
    state = { messages: 0, nudgedAt: 0 };
  };
  pi.on("session_start", () => {
    pending = "";
    handedOver = false;
    reset();
  });

  // omp says when a compaction is happening, which OpenCode does not, so the
  // handover lives on this event rather than on a shrink in the message count.
  // It fires before the shortened list is seen, which is why reset leaves the
  // snapshot alone. The reset itself is what makes the digest come back, since
  // the compaction took it with everything else.
  pi.on("session_compact", async (_event, eventCtx) => {
    const compacted = pending;
    pending = "";
    reset();
    if (compacted.length < MIN_TRANSCRIPT) return;
    await callTool(
      "memory_learn",
      // No session id: this API does not hand one to the event.
      {
        repo: repo(eventCtx.cwd),
        transcript: compacted,
        hint: LEARN_HINT,
        client: "oh-my-pi",
      },
      { ...config, timeoutMs: 4000 },
    ).catch(() => null);
  });

  pi.on<ContextEvent>("context", async (event, ctx): Promise<ContextResult> => {
    const out = [...event.messages];
    let changed = false;

    // One attempt per session: a failed digest must not be re-paid before
    // every model call, which is how often this fires.
    if (!injected) {
      injected = true;
      const found = await callTool(
        "memory_digest",
        { repo: repo(ctx.cwd), budget_tokens: 800 },
        { ...config, timeoutMs: 1500 },
      ).catch(() => null);
      const text = found?.ok
        ? (found.result as { text?: string }).text?.trim()
        : "";
      if (text) {
        out.push(message(`${DIGEST_HEADER}${text}`));
        changed = true;
      }
    }

    const messages = event.messages.length;
    // Keep the newest snapshot so a compaction that arrives without warning
    // still has something to hand over.
    if (messages >= state.messages) pending = transcript(event.messages);
    const due =
      messages < state.messages || messages - state.nudgedAt >= NUDGE_EVERY;
    state = { messages, nudgedAt: due ? messages : state.nudgedAt };
    if (due) {
      out.push(message(`${NUDGE_HEADER}${NUDGE}`));
      changed = true;
    }

    return changed ? { messages: out } : undefined;
  });

  registerTools(pi, config, (ctx) => repo(ctx.cwd));

  // A manual handover, for the sessions that end before they ever compact.
  pi.registerCommand("mimir-learn", {
    description: "Hand this session to Mimir now.",
    async handler(_args, eventCtx) {
      if (handedOver) {
        if (eventCtx.hasUI) eventCtx.ui.notify(ALREADY);
        return;
      }

      // The stored session is complete; the snapshot only exists because the
      // host used to offer no reader, and it is all a resumed session has.
      const stored = await readHistory(eventCtx);
      const text = stored || pending;
      let notice =
        stored === null && pending.trim() === "" ? UNREADABLE : NOTHING_TO_SEND;
      if (text.trim() !== "") {
        const sent = await callTool(
          "memory_learn",
          { repo: repo(eventCtx.cwd), transcript: text, hint: LEARN_NOW_HINT },
          { ...config, timeoutMs: 4000 },
        ).catch(() => null);
        const queued = sent?.ok
          ? (sent.result as { queued?: boolean }).queued
          : undefined;
        if (!sent?.ok) notice = UNREACHABLE;
        else if (queued === false) notice = QUEUE_OFF;
        else {
          notice = SENT;
          handedOver = true;
          // Kept on failure above, so a retry has something to send.
          pending = "";
        }
      }
      if (eventCtx.hasUI) eventCtx.ui.notify(notice);
    },
  });
}

/**
 * `developer` is omp's instruction role: the digest is context, not a turn the
 * user typed, and `synthetic` keeps it out of anything that counts real messages.
 */
function message(text: string): DeveloperMessage {
  return {
    role: "developer",
    content: text,
    timestamp: Date.now(),
    synthetic: true,
  };
}
