export type AgentId =
  | 'opencode'
  | 'claude-code'
  | 'codex'
  | 'cursor'
  | 'gemini-cli'
  | 'pi'
  | 'antigravity'
  | 'hermes'
  | 'muse';

export type AgentDoc = {
  id: AgentId;
  name: string;
  tier: 1 | 2 | 3;
  file: string;
  snippet: (url: string) => string;
  notes: string[];
};

const TOKEN = 'MIMIR_TOKEN';

export const AGENTS: AgentDoc[] = [
  {
    id: 'opencode',
    name: 'OpenCode',
    tier: 1,
    file: 'opencode.json (project or ~/.config/opencode/opencode.json)',
    snippet: (url) =>
      JSON.stringify(
        {
          $schema: 'https://opencode.ai/config.json',
          mcp: {
            mimir: {
              type: 'remote',
              url: `${url}/mcp`,
              enabled: true,
              headers: { Authorization: `Bearer \${env:${TOKEN}}` },
            },
          },
        },
        null,
        2,
      ),
    notes: [
      'The plugin package registers mimir_digest and mimir_remember; ask the agent to call mimir_digest first, or use the MCP config above by hand.',
      'Set MIMIR_TOKEN in your shell before starting OpenCode.',
    ],
  },
  {
    id: 'claude-code',
    name: 'Claude Code',
    tier: 1,
    file: '.mcp.json at the repository root',
    snippet: (url) =>
      JSON.stringify(
        {
          mcpServers: {
            mimir: {
              type: 'http',
              url: `${url}/mcp`,
              headers: { Authorization: `Bearer \${${TOKEN}}` },
            },
          },
        },
        null,
        2,
      ),
    notes: [
      `Or add it from the CLI: claude mcp add --transport http mimir <your-url>/mcp --header "Authorization: Bearer $${TOKEN}"`,
      'Add the session-start hook to inject the project digest when a session begins: point SessionStart at hooks/mimir-session-start.sh (see hooks/README.md).',
    ],
  },
  {
    id: 'codex',
    name: 'Codex',
    tier: 2,
    file: '~/.codex/config.toml',
    snippet: (url) =>
      `[mcp_servers.mimir]\nurl = "${url}/mcp"\nbearer_token_env_var = "${TOKEN}"\n`,
    notes: [
      'Codex reads the token from the named environment variable, so the key never sits in the file.',
    ],
  },
  {
    id: 'cursor',
    name: 'Cursor',
    tier: 2,
    file: '~/.cursor/mcp.json',
    snippet: (url) =>
      JSON.stringify(
        {
          mcpServers: {
            mimir: {
              url: `${url}/mcp`,
              headers: { Authorization: `Bearer \${env:${TOKEN}}` },
            },
          },
        },
        null,
        2,
      ),
    notes: ['Reload the window after editing the file.'],
  },
  {
    id: 'gemini-cli',
    name: 'Gemini CLI',
    tier: 2,
    file: '~/.gemini/settings.json',
    snippet: (url) =>
      JSON.stringify(
        {
          mcpServers: {
            mimir: {
              httpUrl: `${url}/mcp`,
              headers: { Authorization: `Bearer \${${TOKEN}}` },
            },
          },
        },
        null,
        2,
      ),
    notes: [
      'Gemini CLI uses httpUrl for streamable HTTP servers; url is for stdio commands.',
      'Put the instruction block below in ~/.gemini/GEMINI.md so it is loaded for every session.',
    ],
  },
  {
    id: 'pi',
    name: 'Pi',
    tier: 2,
    file: 'the harness mcp config',
    snippet: (url) =>
      JSON.stringify(
        {
          mcpServers: {
            mimir: {
              url: `${url}/mcp`,
              headers: { Authorization: `Bearer \${${TOKEN}}` },
            },
          },
        },
        null,
        2,
      ),
    notes: ['Same shape as the other mcpServers clients; paste the instruction block into the agent rules file.'],
  },
  {
    id: 'antigravity',
    name: 'Antigravity',
    tier: 2,
    file: 'the workspace mcp config',
    snippet: (url) =>
      JSON.stringify(
        {
          mcpServers: {
            mimir: {
              url: `${url}/mcp`,
              headers: { Authorization: `Bearer \${${TOKEN}}` },
            },
          },
        },
        null,
        2,
      ),
    notes: ['Antigravity reads mcpServers from the workspace config; the instruction block belongs in the agent rules.'],
  },
  {
    id: 'hermes',
    name: 'Hermes',
    tier: 2,
    file: 'the harness mcp config',
    snippet: (url) =>
      JSON.stringify(
        {
          mcpServers: {
            mimir: {
              url: `${url}/mcp`,
              headers: { Authorization: `Bearer \${${TOKEN}}` },
            },
          },
        },
        null,
        2,
      ),
    notes: ['Hermes speaks plain JSON-RPC over HTTP, so any streamable-HTTP client works.'],
  },
  {
    id: 'muse',
    name: 'Muse',
    tier: 2,
    file: 'the harness mcp config',
    snippet: (url) =>
      JSON.stringify(
        {
          mcpServers: {
            mimir: {
              url: `${url}/mcp`,
              headers: { Authorization: `Bearer \${${TOKEN}}` },
            },
          },
        },
        null,
        2,
      ),
    notes: ['Any client that cannot read mcpServers can still call the REST mirror at /api/v1 with the same token.'],
  },
];

export const INSTRUCTION_BLOCK = `You have a long-term memory store called Mimir.
At the start of a session, call memory_digest with the current repository to load what is already known.
Before answering a question about this project's conventions, call memory_search with a path_prefix (for example "conventions").
When you learn something durable — a decision, a convention, a gotcha — call memory_write with a path that says where it belongs.
Do not store secrets, tokens or customer data.`;

export function agentById(id: string): AgentDoc | undefined {
  return AGENTS.find((agent) => agent.id === id);
}
