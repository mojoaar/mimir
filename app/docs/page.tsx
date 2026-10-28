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
          Mimir is long-term memory for coding agents. It stores what an agent learned as a tree of paths in your own
          Postgres, gives back one line per memory at session start, and searches the full text when the agent asks a
          question.
        </P>
        <P>
          It is one container and one database. Agents reach it over MCP, or over a small REST API; both use the same
          bearer token and both write the same audit row. There is no hosted service behind it - the model calls go
          straight from your install to the provider you chose, with your key.
        </P>

        <H2>Why “Mimir”</H2>
        <P>
          Mímir was the Norse god whose well held wisdom and memory; Odin traded an eye for a single draught from it.
          The name is the same word as <em>memory</em> and <em>remember</em> - and a memory worth an eye is the right
          standard for one your agents drink from. The mark is that eye in the well, with an M in the pupil.
        </P>

        <H2>The loop it fits into</H2>
        <Code language="text">{`memory_digest  what do I already know about this repo?
memory_search  find the memory about token rotation
memory_write   remember that deploys run from main`}</Code>
        <P>
          An agent calls the digest once at session start, searches before re-deriving something the project already
          knows, and writes when it learns something durable: a convention, a gotcha, a decision and its reason. The
          OpenCode plugin does the first call for it; every other agent is configured with the same two values and told
          the same habit.
        </P>

        <H2>What is in the box</H2>
        <Ul>
          <li>
            <strong>A store, not a chat log</strong> - projects, paths, 20 versions per path, soft delete, restore.
          </li>
          <li>
            <strong>Hybrid search</strong> - PostgreSQL full-text plus pgvector, fused by reciprocal rank fusion, with a
            path prefix to scope it. Keyword search works with no model configured at all.
          </li>
          <li>
            <strong>Your models</strong> - DeepSeek, OpenCode, Ollama, Octen, Mistral or any OpenAI-compatible endpoint,
            per person for chat and install-wide for embeddings. See{' '}
            <Link className="text-[var(--accent)] underline" href="/docs/providers">
              Providers and embeddings
            </Link>
            .
          </li>
          <li>
            <strong>A web app</strong> - browse the tree, read a memory, diff its versions, manage members, and see what
            the agents have been writing.
          </li>
          <li>
            <strong>Operations</strong> - users, teams, grants, MFA, an IP allowlist, an audit log, encrypted scheduled
            backups, and a usage page that shows what the model calls cost.
          </li>
          <li>
            <strong>A localised interface</strong> - English, Danish and German, per account for the app and by URL for
            the public pages.
          </li>
        </Ul>

        <H2>Start here</H2>
        <Ul>
          <li>
            <Link className="text-[var(--accent)] underline" href="/docs/self-hosting">
              Self-hosting
            </Link>{' '}
            - one container, one database, five minutes.
          </li>
          <li>
            <Link className="text-[var(--accent)] underline" href="/docs/how-it-works">
              How Mimir works
            </Link>{' '}
            - projects, paths, versions, digest, search, teams and audit.
          </li>
          <li>
            <Link className="text-[var(--accent)] underline" href="/docs/mcp">
              Connect over MCP
            </Link>{' '}
            - the endpoint and the token an agent needs.
          </li>
          <li>
            <Link className="text-[var(--accent)] underline" href="/docs/agents">
              Per-agent setup
            </Link>{' '}
            - copy-paste configs for OpenCode, Claude Code, Codex and the rest.
          </li>
          <li>
            <Link className="text-[var(--accent)] underline" href="/docs/api">
              HTTP API
            </Link>{' '}
            - the same operations without MCP, with request and response examples.
          </li>
          <li>
            <Link className="text-[var(--accent)] underline" href="/docs/tools">
              Tool reference
            </Link>{' '}
            - all eight tools, their arguments and what each one returns.
          </li>
          <li>
            <Link className="text-[var(--accent)] underline" href="/docs/changelog">
              Changelog
            </Link>{' '}
            - every release, newest first.
          </li>
        </Ul>

        <Callout kind="tip">
          Point an agent at Mimir once and it will use these on its own. If you only read one page after this one, read
          How Mimir works.
        </Callout>
      </Prose>
    </>
  );
}
