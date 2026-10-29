import Link from 'next/link';
import type { Metadata } from 'next';
import { connection } from 'next/server';
import { AGENTS } from '@/lib/docs/agents';
import { publicMetadata } from '@/lib/seo';
import { H1, H2, P, Prose, Ul } from '@/components/docs/prose';

export const instant = false;

export async function generateMetadata(): Promise<Metadata> {
  await connection();
  return publicMetadata({
    title: 'Agents',
    description: 'Connect OpenCode, Claude Code, Codex, Cursor, Gemini CLI and others to Mimir over MCP.',
    path: '/docs/agents',
  });
}

export default function AgentsIndex() {
  return (
    <Prose>
      <H1>Agents</H1>
      <P>
        Every agent below speaks the same MCP endpoint. Pick yours for the exact file and snippet; the tools are
        identical from there.
      </P>
      <Ul>
        {AGENTS.map((agent) => (
          <li key={agent.id}>
            <Link href={`/docs/agents/${agent.id}`} className="underline">
              {agent.name}
            </Link>{' '}
            - {agent.file}
          </li>
        ))}
      </Ul>
      <H2>What you get</H2>
      <Ul>
        <li>
          Any MCP client: the nine tools, and the digest when the agent asks for it. The server sends a short
          protocol on <code>initialize</code> - digest first, search before re-deriving, one memory per outcome.
          Clients differ in whether they show that to the model; if yours does not, paste the block from its page into
          the file it reads.
        </li>
        <li>
          The OpenCode and Oh My Pi plugins also inject the digest before the first turn, add a reminder to write once
          a session gets long, and register <code>mimir_digest</code>, <code>mimir_remember</code>,{' '}
          <code>mimir_search</code> and <code>mimir_learn</code>. The{' '}
          <Link href="/docs/plugins" className="text-[var(--accent)] underline">
            plugins page
          </Link>{' '}
          compares them with the server and shows both installs.
        </li>
        <li>
          The Claude Code hook in this repository does the first of those: it puts the digest into the session start.
        </li>
      </Ul>
    </Prose>
  );
}
