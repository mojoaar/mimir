// Claude Code reads a SessionStart hook's stdout as JSON. Plain text was
// tolerated once; on 2.1 and later it is a hook error, so the digest has to
// arrive in hookSpecificOutput.additionalContext.
import { isMain } from "./transcript.mjs";

export function sessionPayload(body) {
  return JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "SessionStart",
      additionalContext: body,
    },
  });
}

export function digestUrl(url, project) {
  return `${url.replace(/\/$/, "")}/api/v1/projects/${encodeURIComponent(project)}/digest?budget_tokens=800&format=text`;
}

async function main() {
  const url = process.env.MIMIR_URL;
  const token = process.env.MIMIR_TOKEN;
  const project = process.env.MIMIR_PROJECT;
  if (!url || !token || !project) return;

  try {
    const res = await fetch(digestUrl(url, project), {
      headers: { Authorization: `Bearer ${token}`, Accept: "text/plain" },
      signal: AbortSignal.timeout(3000),
    });
    const body = res.ok ? (await res.text()).trim() : "";
    if (body) process.stdout.write(sessionPayload(body));
  } catch {
    // A missing digest must never block or delay a session.
  }
}

if (isMain(import.meta.url)) {
  await main();
  process.exit(0);
}
