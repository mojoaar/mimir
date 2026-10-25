import Link from 'next/link';
import { connection } from 'next/server';
import { H1, H2, P, Prose, Ul } from '@/components/docs/prose';
import { Code } from '@/components/docs/code';
import { Callout } from '@/components/docs/callout';
import { publicMetadata } from '@/lib/seo';

export const instant = false;

export async function generateMetadata() {
  // The canonical origin lives in the database, so this metadata can only be
  // computed per request. connection() opts the route out of static generation.
  await connection();

  return publicMetadata({
    title: 'Documentation',
    description: 'Install Mimir, connect an agent over MCP, and use the REST API.',
    path: '/docs',
  });
}

export default function DocsIndex() {
  return (
    <>
      <H1>Mimir documentation</H1>
      <Prose>
        <P>
          Mimir is long-term memory for coding agents. It stores what an agent learned as a tree of
          paths, gives back one line per memory at session start, and searches the full text when the
          agent asks a question.
        </P>
        <H2>Start here</H2>
        <Ul>
          <li>
            <Link className="text-[var(--accent)] underline" href="/docs/self-hosting">
              Self-hosting
            </Link>{' '}
            — one container, one database, five minutes.
          </li>
          <li>
            <Link className="text-[var(--accent)] underline" href="/docs/mcp">
              Connect over MCP
            </Link>{' '}
            — the endpoint and the token an agent needs.
          </li>
          <li>
            <Link className="text-[var(--accent)] underline" href="/docs/agents/opencode">
              Per-agent setup
            </Link>{' '}
            — copy-paste configs for OpenCode, Claude Code, Codex and the rest.
          </li>
        </Ul>
        <H2>The three commands an agent uses</H2>
        <Code language="text">{`memory_digest  what do I already know about this repo?
memory_search  find the memory about token rotation
memory_write   remember that deploys run from main`}</Code>
        <Callout kind="tip">
          Point an agent at Mimir once and it will use these on its own. The plugin does the first
          call for it at session start.
        </Callout>
      </Prose>
    </>
  );
}
