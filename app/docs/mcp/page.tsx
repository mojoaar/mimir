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
MIMIR_TOKEN=mimir_...        # mint one on your Profile page`}</Code>

      <H2>Repository header</H2>
      <P>
        Send <code>X-Mimir-Repo: github.com/owner/repo</code> so the agent lands in the same project another agent
        created yesterday. Without it, pass <code>repo</code> or <code>project</code> as a tool argument. A server
        never sees a working directory, so the client is the only thing that can compute this.
      </P>

      <H2>Raw HTTP</H2>
      <P>
        MCP here is JSON-RPC 2.0 over a plain <code>POST</code>. A client library hides this, but seeing it once makes
        debugging a token or a header much quicker.
      </P>
      <Code language="bash">{`curl -s "$MIMIR_URL/mcp" \\
  -H "Authorization: Bearer $MIMIR_TOKEN" \\
  -H "Content-Type: application/json" \\
  -H "X-Mimir-Repo: github.com/owner/repo" \\
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/call",
    "params": {
      "name": "memory_search",
      "arguments": { "query": "token rotation", "path_prefix": "auth" }
    }
  }'`}</Code>
      <Code language="json">{`{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "results": [
      {
        "path": "auth/token-rotation",
        "title": "Rotating the API token",
        "summary": "Rotate in the admin panel, then redeploy.",
        "score": 0.0328
      }
    ],
    "content": [{ "type": "text", "text": "[{\\"path\\":\\"auth/token-rotation\\",…}]" }],
    "isError": false
  }
}`}</Code>
      <Ul>
        <li>
          <code>initialize</code> answers with protocol version <code>2025-06-18</code> and{' '}
          <code>tools.listChanged: false</code>; <code>ping</code> answers with an empty result.
        </li>
        <li>
          <code>tools/list</code> returns each tool’s name, description and JSON schema. No token scope narrows the
          list; a grant narrows what a call may touch.
        </li>
        <li>
          A tool result carries the payload twice: as fields on <code>result</code> for a script, and as{' '}
          <code>content[0].text</code> for a standard MCP client.
        </li>
        <li>
          A failed call is a JSON-RPC error with a service code in <code>error.data.code</code>, and still writes one
          audit row. An expired token is HTTP 401 with <code>{'{"jsonrpc":"2.0","id":null,"error":{…}}'}</code>;
          a rate limit is 429 with <code>Retry-After</code>.
        </li>
      </Ul>

      <H2>Tools</H2>
      <Table head={['Tool', 'Purpose']} rows={TOOL_NAMES.map((name) => [name, purpose(name)])} />

      <H2>What the agent is told</H2>
      <P>
        The server sends a short protocol in its <code>initialize</code> response, so a client that shows it to the
        model needs no extra file:
      </P>
      <Ul>
        <li>
          Call <code>memory_digest</code> once at the start of a session, then <code>memory_search</code> before
          re-deriving something the project already knows.
        </li>
        <li>
          One memory is one outcome: what changed, why, and the trap you hit. Not a log of what you just did.
        </li>
        <li>
          Write it once at a stable path. One path is one memory; writing it again replaces the body.
        </li>
      </Ul>
      <P>
        Not every client passes those instructions to the model. If yours does not, paste the block from your agent’s
        page under Agents in the sidebar into <code>AGENTS.md</code>, <code>CLAUDE.md</code> or the equivalent - it
        says the same thing.
      </P>

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
    case 'memory_learn':
      return 'Hand over a session; the project model writes what is durable.'
    default:
      return ''
  }
}
