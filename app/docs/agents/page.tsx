import Link from 'next/link';
import type { Metadata } from 'next';
import { connection } from 'next/server';
import { AGENTS } from '@/lib/docs/agents';
import { publicMetadata } from '@/lib/seo';
import { H1, P, Prose, Ul } from '@/components/docs/prose';

export const instant = false;

export async function generateMetadata(): Promise<Metadata> {
  await connection();
  return publicMetadata({
    title: 'Agents — Mimir',
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
            — {agent.file}
          </li>
        ))}
      </Ul>
    </Prose>
  );
}
