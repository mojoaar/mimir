import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { digestUrl, sessionPayload } from "./session-start.mjs";
import { HINT, learnUrl, shouldSend } from "./pre-compact.mjs";
import { MAX_TRANSCRIPT, readTranscript } from "./transcript.mjs";

const hooks = resolve("packages/claude-plugin/hooks");

function transcriptFile(lines: unknown[]): string {
  const dir = mkdtempSync(join(tmpdir(), "claude-transcript-"));
  const file = join(dir, "session.jsonl");
  writeFileSync(
    file,
    lines
      .map((line) => (typeof line === "string" ? line : JSON.stringify(line)))
      .join("\n"),
  );
  return file;
}

function run(script: string, env: Record<string, string> = {}, input = "{}") {
  try {
    const stdout = execFileSync("node", [join(hooks, script)], {
      input,
      encoding: "utf8",
      env: {
        ...process.env,
        MIMIR_URL: "",
        MIMIR_TOKEN: "",
        MIMIR_PROJECT: "",
        ...env,
      },
    });
    return { stdout: stdout.trim(), status: 0 };
  } catch (error) {
    const failed = error as { status?: number; stdout?: string };
    return { stdout: (failed.stdout ?? "").trim(), status: failed.status ?? 1 };
  }
}

describe("the SessionStart payload", () => {
  it("wraps the digest in the JSON Claude Code requires, without mangling it", () => {
    // Quotes and backslashes are the two things a naive string would break.
    const body = '"Deploy" and \\ backslash\nsecond line';

    const out = JSON.parse(sessionPayload(body));

    expect(out.hookSpecificOutput.hookEventName).toBe("SessionStart");
    expect(out.hookSpecificOutput.additionalContext).toBe(body);
  });

  it("asks the digest endpoint for text with a trailing slash or without", () => {
    expect(digestUrl("https://m.test/", "sigrun")).toBe(
      "https://m.test/api/v1/projects/sigrun/digest?budget_tokens=800&format=text",
    );
    expect(digestUrl("https://m.test", "sigrun")).toBe(
      "https://m.test/api/v1/projects/sigrun/digest?budget_tokens=800&format=text",
    );
  });

  it("prints nothing when any of the three settings is missing", () => {
    expect(
      run("session-start.mjs", { MIMIR_TOKEN: "k", MIMIR_PROJECT: "p" }).stdout,
    ).toBe("");
    expect(
      run("session-start.mjs", {
        MIMIR_URL: "http://127.0.0.1:9",
        MIMIR_PROJECT: "p",
      }).stdout,
    ).toBe("");
  });
});

describe("the transcript reader", () => {
  it("keeps the human turns and drops tool blocks, sidechains and command echoes", () => {
    const path = transcriptFile([
      {
        type: "user",
        message: { role: "user", content: "use the tag not latest" },
      },
      {
        type: "assistant",
        message: {
          role: "assistant",
          content: [
            { type: "thinking", thinking: "hmm" },
            { type: "text", text: "noted" },
            { type: "tool_use", name: "bash", input: { command: "ls" } },
          ],
        },
      },
      {
        type: "assistant",
        isSidechain: true,
        message: { role: "assistant", content: "side note" },
      },
      {
        type: "user",
        message: {
          role: "user",
          content: "<local-command-caveat>noise</local-command-caveat>",
        },
      },
      { type: "summary", summary: "not a message" },
      "not json at all",
    ]);

    const transcript = readTranscript(path);

    expect(transcript).toContain("user: use the tag not latest");
    expect(transcript).toContain("assistant: noted");
    expect(transcript).not.toContain("tool_use");
    expect(transcript).not.toContain("side note");
    expect(transcript).not.toContain("local-command");
  });

  it("keeps only the tail of a long session", () => {
    const turns = Array.from({ length: 200 }, (_, i) => ({
      type: "user",
      message: { role: "user", content: `turn ${i} ${"x".repeat(200)}` },
    }));

    const transcript = readTranscript(transcriptFile(turns));

    expect(transcript.length).toBeLessThanOrEqual(MAX_TRANSCRIPT);
    expect(transcript).toContain("turn 199");
    expect(transcript).not.toContain("turn 0 ");
  });

  it("returns nothing for a file that cannot be read", () => {
    expect(readTranscript("/does/not/exist.jsonl")).toBe("");
  });
});

describe("the compaction handover", () => {
  it("sends nothing below the floor and everything above it", () => {
    expect(shouldSend("x".repeat(499))).toBe(false);
    expect(shouldSend("x".repeat(500))).toBe(true);
  });

  it("posts to the learn route of the configured project", () => {
    expect(learnUrl("https://m.test/", "sigrun")).toBe(
      "https://m.test/api/v1/projects/sigrun/learn",
    );
    expect(HINT).toContain("decided");
  });

  it("exits quietly when unconfigured, so a compaction is never blocked", () => {
    expect(run("pre-compact.mjs").status).toBe(0);
  });
});
