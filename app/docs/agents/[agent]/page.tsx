import { notFound } from 'next/navigation';
import Link from 'next/link';
import type { Metadata } from 'next';
import { connection } from 'next/server';
import { INSTRUCTION_BLOCK, agentById } from '@/lib/docs/agents';
import { DOCS_NAV } from '@/lib/docs/nav';
import { publicMetadata } from '@/lib/seo';
import { getSiteSettings } from '@/lib/settings/site';
import { Callout } from '@/components/docs/callout';
import { Code } from '@/components/docs/code';
import { H1, H2, P, Prose, Ul } from '@/components/docs/prose';

export const instant = false;

export async function generateMetadata({ params }: { params: Promise<{ agent: string }> }): Promise<Metadata> {
  const { agent } = await params;
  const doc = agentById(agent);
  if (!doc) return {};
  await connection();
  return publicMetadata({
    title: `${doc.name} - Mimir`,
    description: `Connect ${doc.name} to Mimir over MCP.`,
    path: `/docs/agents/${doc.id}`,
  });
}

export default async function AgentPage({ params }: { params: Promise<{ agent: string }> }) {
  const { agent } = await params;
  const doc = agentById(agent);
  if (!doc) notFound();

  const site = await getSiteSettings();
  const url = site.publicUrl.replace(/\/$/, '');

  return (
    <Prose>
      <p className="text-[var(--text-muted)]">
        {DOCS_NAV.find((group) => group.title === 'Agents')?.links.length ?? 0} agents ·{' '}
        <Link href="/docs/agents" className="underline">
          all agents
        </Link>
      </p>
      <H1>Connect {doc.name}</H1>
      <P>
        {doc.name} talks to Mimir over the Model Context Protocol at <code>{url}/mcp</code>. The token is an API key
        from Settings → API keys in the Mimir app; export it as <code>MIMIR_TOKEN</code> before starting the agent.
      </P>

      <H2>1. Add the server</H2>
      <P>
        File: <code>{doc.file}</code>
      </P>
      <Code language={doc.id === 'codex' ? 'toml' : 'json'}>{doc.snippet(url)}</Code>

      {doc.tier === 1 ? (
        <Callout kind="tip">
          {doc.id === 'claude-code'
            ? 'Claude Code also supports a session-start hook, so memory arrives before the first prompt instead of after it.'
            : null}
          See the hooks directory.
        </Callout>
      ) : (
        <Callout kind="note">
          {doc.name} has no plugin hook here, so the instruction block in step 3 is what makes the agent use memory on
          its own.
        </Callout>
      )}

      <H2>2. Verify</H2>
      <P>
        Ask the agent to run <code>memory_tree</code>. It should list the projects your token can see, or nothing at
        all on a fresh install - either answer proves the connection works.
      </P>

      <H2>3. Tell it how to behave</H2>
      <P>Paste this into the agent&apos;s rules or instructions file, once per machine.</P>
      <Code language="text">{INSTRUCTION_BLOCK}</Code>

      <H2>Notes</H2>
      <Ul>
        {doc.notes.map((note) => (
          <li key={note}>{note}</li>
        ))}
      </Ul>
    </Prose>
  );
}
