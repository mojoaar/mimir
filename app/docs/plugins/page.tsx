import { connection } from 'next/server'
import { Code } from '@/components/docs/code'
import { H1, H2, P, Prose, Table, Ul } from '@/components/docs/prose'
import { publicMetadata } from '@/lib/seo'

export const instant = false

export async function generateMetadata() {
  await connection()

  return publicMetadata({
    title: 'Plugins',
    description: 'What a Mimir plugin adds that MCP cannot, and how to install it in OpenCode or Oh My Pi.',
    path: '/docs/plugins',
  })
}

export default function PluginsPage() {
  return (
    <Prose>
      <H1>Plugins</H1>
      <P>
        Two harnesses can carry Mimir themselves: OpenCode and Oh My Pi. A plugin is one package you install into the
        agent, and it does something a server cannot. The server answers when asked. A plugin can speak first.
      </P>

      <H2>MCP or plugin</H2>
      <Table
        head={['', 'MCP server', 'Plugin']}
        rows={[
          ['Install', 'One entry in the client config', 'One package per harness'],
          ['Digest at the first turn', 'No, the agent has to call memory_digest', 'Yes, injected once per session'],
          ['Reminder before compaction', 'No', 'Yes, at twenty turns or after a compaction'],
          ['Tools', 'All eleven, including tree, read, versions, ingest and delete', 'Four: digest, remember, search and learn'],
          ['Works in', 'Any MCP client', 'OpenCode and Oh My Pi'],
          ['When Mimir is down', 'The tool call fails', 'Silent, and the session carries on'],
        ]}
      />
      <P>
        They are not alternatives. Install the plugin and keep the MCP server if you like: in OpenCode the plugin
        leaves its own tools out when a server already answers at the same URL, and the digest arrives either way. In
        Oh My Pi both are registered under different names, so one session can use both.
      </P>
      <P>
        The plugin is also the only way to answer &quot;what does this project already know&quot; without the agent
        thinking to ask.
      </P>

      <H2>OpenCode</H2>
      <P>
        The plugin reads its URL from <code>options.url</code> or <code>MIMIR_URL</code>, and its token from{' '}
        <code>options.token</code>, <code>options.tokenFile</code> or <code>MIMIR_TOKEN</code>. Without a URL it
        loads and stays inactive, and the only clue is one line in the OpenCode log.
      </P>
      <Code language="json">{`{
  "plugins": [
    {
      "package": "@mojoaar/opencode-mimir",
      "options": {
        "url": "https://mimir.example.com",
        "tokenFile": "~/.config/opencode/.secrets/mimir-token",
        "tools": "auto"
      }
    }
  ]
}`}</Code>
      <P>
        The short form, <code>opencode plugin add @mojoaar/opencode-mimir</code>, carries no options, so it only
        works when <code>MIMIR_URL</code> and <code>MIMIR_TOKEN</code> are exported in the environment OpenCode runs
        in. Otherwise use the options block above.
      </P>
      <P>
        It registers five tools: <code>mimir_digest</code>, <code>mimir_remember</code>, <code>mimir_search</code>,{' '}
        <code>mimir_read</code> and <code>mimir_learn</code>. <code>tools</code> decides whether they are added. <code>auto</code>, the
        default, leaves them out when an MCP server already points at the same <code>/mcp</code>, <code>always</code>{' '}
        adds them anyway, and <code>never</code> adds none. The digest and the reminder arrive whatever you pick.
      </P>
      <P>To load a project that already has documentation, the package ships an importer:</P>
      <Code language="bash">npx @mojoaar/opencode-mimir ingest .</Code>
      <P>
        It walks the folder and loads the documentation and configuration, meaning READMEs, <code>docs/</code>,
        markdown, compose files and <code>package.json</code>, under the <code>import</code> path prefix. Source code
        is skipped, because the agent already has it. <code>--project</code> names a folder that is not a git
        repository, <code>--all</code> imports every text file, <code>--dry-run</code> prints what would be sent, and{' '}
        <code>--url</code> and <code>--token</code> override the environment.
      </P>

      <H2>Oh My Pi</H2>
      <Code language="bash">omp plugin install @mojoaar/omp-mimir</Code>
      <P>
        Then point it at your install. It reads the environment, and the token may live in a file instead, at{' '}
        <code>~/.omp/mimir-token</code> by default:
      </P>
      <Code language="bash">{`export MIMIR_URL=https://mimir.example.com
export MIMIR_TOKEN=mimir_...`}</Code>
      <P>
        It registers the same five tools: <code>mimir_digest</code>, <code>mimir_remember</code>,{' '}
        <code>mimir_search</code>, <code>mimir_read</code> and <code>mimir_learn</code>. MCP tools stay available beside them as{' '}
        <code>mcp__mimir__memory_write</code> and the rest, so the plugin does not take the server away.{' '}
        <code>MIMIR_REPO</code> overrides the repository read from <code>git remote get-url origin</code>, which is
        what a folder that is not a repository needs. A new session, or <code>/reload-plugins</code>, picks it up.
      </P>

      <H2>When the context is compacted</H2>
      <P>
        When the conversation is compacted, the client hands the messages being replaced to <code>memory_learn</code>,
        and the project model writes at most three memories from them. OpenCode does it on its own compaction, Oh My
        Pi on its compaction event, so a context compressed by another plugin does not count. It happens once per
        compaction, it spends tokens on the project owner&apos;s provider, and it stays quiet when learning is off for
        that project.
      </P>

      <H2>When you want it now</H2>
      <P>
        Both plugins take <code>/mimir-learn</code>. It sends the conversation so far to <code>memory_learn</code> at
        that moment, so a session that ends before it ever compacts can still leave something behind. It writes at
        most three memories, uses the project owner&apos;s provider, says so when there is nothing worth sending, and
        never sends the same session twice.
      </P>

      <H2>Did it work</H2>
      <P>
        Start a session and ask what the project already knows. A working plugin puts a{' '}
        <code>## What this project already knows (Mimir)</code> block in front of the first turn, so the agent can
        answer with paths and dates without calling a tool.
      </P>
      <Ul>
        <li>No block: check that the package is installed in that harness and that the session is new enough to load it.</li>
        <li>
          A block with no content: the two values reach Mimir, but the project is empty, or <code>repo</code> points
          at a name nothing has been written under yet.
        </li>
        <li>
          Nothing at all, and no complaint: that is the design. Both plugins fail soft, so an unreachable server never
          holds up a session.
        </li>
      </Ul>
    </Prose>
  )
}
