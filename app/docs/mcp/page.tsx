import { connection } from 'next/server'
import { Code } from '@/components/docs/code'
import { H1, H2, P, Prose, Table, Ul } from '@/components/docs/prose'
import { publicMetadata } from '@/lib/seo'
import { TOOL_NAMES } from '@/lib/mcp/tools'

export const instant = false

export async function generateMetadata() {
  await connection()

  return publicMetadata({
    title: 'MCP endpoint',
    description: 'Connect an agent to Mimir over MCP: one URL, one bearer token, and a repository header.',
    path: '/docs/mcp',
  })
}

export default function McpPage() {
  return (
    <Prose>
      <H1>MCP endpoint</H1>
      <P>
        Mimir speaks MCP over HTTP at <code>/mcp</code>. It is stateless: every request carries its own token, so a
        stock reverse proxy works without SSE configuration.
      </P>

      <H2>Two values</H2>
      <Code language="bash">{`MIMIR_URL=https://mimir.example.com
MIMIR_TOKEN=mimir_...        # mint one under Settings → API keys`}</Code>

      <H2>Repository header</H2>
      <P>
        Send <code>X-Mimir-Repo: github.com/owner/repo</code> so the agent lands in the same project another agent
        created yesterday. Without it, pass <code>repo</code> or <code>project</code> as a tool argument. A server
        never sees a working directory, so the client is the only thing that can compute this.
      </P>

      <H2>Tools</H2>
      <Table head={['Tool', 'Purpose']} rows={TOOL_NAMES.map((name) => [name, purpose(name)])} />

      <H2>What to tell the agent</H2>
      <Ul>
        <li>
          Call <code>memory_digest</code> once at the start of a session, then <code>memory_search</code> before
          re-deriving something the project already knows.
        </li>
        <li>
          Call <code>memory_write</code> when you learn something durable: a convention, a gotcha, a decision and its
          reason. Not a log of what you just did.
        </li>
        <li>Keep paths stable. One path is one memory; writing it again replaces the body.</li>
      </Ul>

      <P>Per-agent configuration lives under Agents in the sidebar.</P>
    </Prose>
  )
}

function purpose(name: string): string {
  switch (name) {
    case 'memory_tree':
      return 'List a project’s paths with their one-line titles.'
    case 'memory_read':
      return 'Read one memory at L0, L1 or L2.'
    case 'memory_search':
      return 'Hybrid search, optionally scoped to a path prefix.'
    case 'memory_digest':
      return 'A budgeted session-start digest of the project.'
    case 'memory_write':
      return 'Create or replace a memory.'
    case 'memory_delete':
      return 'Soft-delete a memory.'
    case 'project_list':
      return 'List the projects you can reach.'
    case 'memory_ingest':
      return 'Import a batch of files as memories.'
    default:
      return ''
  }
}
