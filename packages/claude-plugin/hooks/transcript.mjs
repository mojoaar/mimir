// A Claude Code session is JSONL on disk. Only the human turns are worth
// sending to Mimir: tool results and sidechains are noise the model already
// saw, and they would blow the transcript budget.
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export const MAX_TRANSCRIPT = 32000;
const LOCAL = /^<(local-command|command-name)/;

export function isMain(metaUrl) {
  return (
    Boolean(process.argv[1]) && pathToFileURL(process.argv[1]).href === metaUrl
  );
}

function textOf(content) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((part) => part?.type === "text" && typeof part.text === "string")
    .map((part) => part.text)
    .join("\n");
}

export function readTranscript(path) {
  let raw;
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    return "";
  }

  const blocks = [];
  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    let entry;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }
    if (entry?.type !== "user" && entry?.type !== "assistant") continue;
    if (entry.isSidechain === true) continue;
    const text = textOf(entry.message?.content).trim();
    // Slash commands and their output are echoed as user records.
    if (!text || LOCAL.test(text)) continue;
    blocks.push(`${entry.type}: ${text}`);
  }

  return blocks.join("\n\n").slice(-MAX_TRANSCRIPT);
}
