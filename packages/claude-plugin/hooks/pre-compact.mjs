import { readFileSync } from "node:fs";
import { isMain, readTranscript } from "./transcript.mjs";

export const MIN_TRANSCRIPT = 500;
export const HINT = "Keep what was decided, what broke and any convention.";

export function shouldSend(transcript) {
  return transcript.trim().length >= MIN_TRANSCRIPT;
}

export function learnUrl(url, project) {
  return `${url.replace(/\/$/, "")}/api/v1/projects/${encodeURIComponent(project)}/learn`;
}

async function main() {
  const url = process.env.MIMIR_URL;
  const token = process.env.MIMIR_TOKEN;
  const project = process.env.MIMIR_PROJECT;

  let event = {};
  try {
    event = JSON.parse(readFileSync(0, "utf8"));
  } catch {
    return;
  }

  const path = event.transcript_path;
  if (!url || !token || !project || typeof path !== "string") return;

  const transcript = readTranscript(path);
  if (!shouldSend(transcript)) return;

  try {
    await fetch(learnUrl(url, project), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ transcript, hint: HINT }),
      signal: AbortSignal.timeout(4000),
    });
  } catch {
    // Compaction must proceed whether or not Mimir heard about it.
  }
}

if (isMain(import.meta.url)) {
  await main();
  process.exit(0);
}
