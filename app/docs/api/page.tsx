import { connection } from 'next/server'
import { Code } from '@/components/docs/code'
import { H1, H2, P, Prose, Table } from '@/components/docs/prose'
import { publicMetadata } from '@/lib/seo'

export const instant = false

export async function generateMetadata() {
  await connection()

  return publicMetadata({
    title: 'REST API',
    description:
      'Every MCP tool has an HTTP route under /api/v1, authenticated with the same bearer token - with request and response examples.',
    path: '/docs/api',
  })
}

export default function ApiPage() {
  return (
    <Prose>
      <H1>REST API</H1>
      <P>
        The REST surface mirrors the MCP tools one to one. Authentication is the same bearer token, the same limits
        apply, and every call writes one audit row. Use it when an agent or a script cannot speak MCP, or when you want
        to look at a response with <code>curl</code> before wiring it into an agent.
      </P>

      <H2>Authentication</H2>
      <Code language="bash">{`export MIMIR_URL=https://mimir.example.com
export MIMIR_TOKEN=mimir_...        # from your Profile page, shown once`}</Code>
      <P>
        Send the token as <code>Authorization: Bearer $MIMIR_TOKEN</code> on every request. A missing or revoked token
        answers:
      </P>
      <Code language="json">{`{ "error": "unauthorized", "code": "unauthorized" }`}</Code>

      <H2>Conventions</H2>
      <P>
        Projects are addressed by slug; memories by path, split into URL segments. Bodies are JSON, responses are JSON
        unless a digest is requested as text. Dates are ISO 8601 with a UTC offset. A failure always carries both a
        human message in <code>error</code> and a stable machine code in <code>code</code>.
      </P>

      <H2>Walk through it</H2>
      <P>
        <strong>1. Which projects can I reach?</strong> The answer already respects grants, so a caller only ever sees
        what it may read.
      </P>
      <Code language="bash">{`curl -s "$MIMIR_URL/api/v1/projects" \\
  -H "Authorization: Bearer $MIMIR_TOKEN"`}</Code>
      <Code language="json">{`{
  "projects": [
    {
      "id": "0f0c…",
      "slug": "mimir",
      "name": "mimir",
      "role": "write",
      "memoryCount": 42,
      "archived": false
    }
  ]
}`}</Code>

      <P>
        <strong>2. What does this project know?</strong> The tree is titles only - the cheap orientation read before a
        search.
      </P>
      <Code language="bash">{`curl -s "$MIMIR_URL/api/v1/projects/mimir/tree?path=deploys&depth=2" \\
  -H "Authorization: Bearer $MIMIR_TOKEN"`}</Code>
      <Code language="json">{`{
  "memories": [
    {
      "path": "deploys/rollback",
      "title": "How to roll back a release",
      "hasSummary": true,
      "updatedAt": "2026-10-25T18:04:11.000Z"
    }
  ]
}`}</Code>

      <P>
        <strong>3. Read one memory.</strong> The path is the URL; encode spaces and unusual characters as usual.
      </P>
      <Code language="bash">{`curl -s "$MIMIR_URL/api/v1/projects/mimir/memory/deploys/rollback" \\
  -H "Authorization: Bearer $MIMIR_TOKEN"`}</Code>
      <Code language="json">{`{
  "id": "5b1e…",
  "path": "deploys/rollback",
  "title": "How to roll back a release",
  "summary": "Compose: down, check out the previous tag, up.",
  "body": "Roll back with docker compose down, then up on the previous tag.",
  "kind": "note",
  "updatedAt": "2026-10-25T18:04:11.000Z"
}`}</Code>

      <P>
        <strong>4. Write one.</strong> Writing an existing path replaces the body and keeps the old one as a version. A
        provider that is down does not fail this call - the memory is stored and the summary and vector arrive later.
      </P>
      <Code language="bash">{`curl -s -X PUT "$MIMIR_URL/api/v1/projects/mimir/memory/deploys/rollback" \\
  -H "Authorization: Bearer $MIMIR_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{
    "body": "Roll back with docker compose down, then up on the previous tag.",
    "title": "How to roll back a release",
    "kind": "runbook"
  }'`}</Code>
      <Code language="json">{`{ "path": "deploys/rollback", "created": false }`}</Code>

      <P>
        <strong>5. Search.</strong> Keyword and meaning, fused; <code>path_prefix</code> keeps a deployment note out of
        an authentication answer.
      </P>
      <Code language="bash">{`curl -s -X POST "$MIMIR_URL/api/v1/projects/mimir/search" \\
  -H "Authorization: Bearer $MIMIR_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{ "query": "how do I roll back", "path_prefix": "deploys", "limit": 5 }'`}</Code>
      <Code language="json">{`{
  "results": [
    {
      "path": "deploys/rollback",
      "title": "How to roll back a release",
      "summary": "Compose: down, check out the previous tag, up.",
      "score": 0.0328
    }
  ]
}`}</Code>
      <P>
        <code>score</code> is a fused rank score, not a probability: it is only comparable within one response, and a
        higher number is better.
      </P>

      <P>
        <strong>6. Session start.</strong> The digest is what an agent should read first; <code>format=text</code> gives
        a shell hook something it can inject without JSON parsing.
      </P>
      <Code language="bash">{`curl -s "$MIMIR_URL/api/v1/projects/mimir/digest?budget_tokens=400&format=text" \\
  -H "Authorization: Bearer $MIMIR_TOKEN"`}</Code>
      <Code language="text">{`deploys
- deploys/rollback - How to roll back a release
  Compose: down, check out the previous tag, up.

conventions
- conventions/state-management - Zustand, one store per feature
… 38 more memories, truncated to fit 400 tokens`}</Code>

      <P>
        <strong>7. History and restore.</strong> A version id comes from the versions list; a restore writes the old
        body back as a new version, so it can itself be undone.
      </P>
      <Code language="bash">{`curl -s "$MIMIR_URL/api/v1/projects/mimir/versions?path=deploys/rollback" \\
  -H "Authorization: Bearer $MIMIR_TOKEN"

curl -s -X POST "$MIMIR_URL/api/v1/projects/mimir/versions/9ac2…/restore" \\
  -H "Authorization: Bearer $MIMIR_TOKEN"`}</Code>
      <Code language="json">{`{
  "versions": [
    {
      "id": "9ac2…",
      "path": "deploys/rollback",
      "title": "How to roll back a release",
      "kind": "note",
      "source": "agent",
      "updatedAt": "2026-10-25T17:40:02.000Z",
      "createdAt": "2026-10-25T17:40:02.000Z",
      "bytes": 61
    }
  ]
}

{ "restored": true, "path": "deploys/rollback" }`}</Code>

      <P>
        <strong>8. Import a batch.</strong> Paths that are too large, empty or malformed are skipped and reported
        rather than failing the whole call.
      </P>
      <Code language="bash">{`curl -s -X POST "$MIMIR_URL/api/v1/projects/mimir/ingest" \\
  -H "Authorization: Bearer $MIMIR_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{
    "prefix": "docs",
    "files": [
      { "path": "architecture.md", "body": "# Architecture\nOne container…" },
      { "path": "empty.md", "body": "" }
    ]
  }'`}</Code>
      <Code language="json">{`{
  "written": 1,
  "skipped": [{ "path": "docs/empty.md", "reason": "body must not be empty" }]
}`}</Code>

      <H2>Routes</H2>
      <Table
        head={['Method and path', 'Body', 'Returns']}
        rows={[
          ['GET /api/v1/me', '-', '{ id, email, name, role, mfaEnabled }'],
          ['GET /api/v1/projects', '-', '{ projects: [{ id, slug, name, role, memoryCount, archived }] }'],
          ['GET /api/v1/projects/:slug/tree?path=&depth=', '-', '{ memories: [{ path, title, hasSummary, updatedAt }] }'],
          ['GET /api/v1/projects/:slug/memory/:path', '-', 'one memory'],
          ['PUT /api/v1/projects/:slug/memory/:path', '{ body, title?, kind? }', '{ path, created }'],
          ['DELETE /api/v1/projects/:slug/memory/:path', '-', '{ deleted: true }'],
          ['POST /api/v1/projects/:slug/search', '{ query, path_prefix?, limit? }', '{ results: [{ path, title, summary, score }] }'],
          ['GET /api/v1/projects/:slug/digest?budget_tokens=&format=text', '-', '{ text, memoryCount, truncated }'],
          ['GET /api/v1/projects/:slug/versions?path=', '-', '{ versions: [{ id, path, title, kind, source, updatedAt, createdAt, bytes }] }'],
          ['POST /api/v1/projects/:slug/versions/:id/restore', '-', '{ restored: true, path }'],
          ['POST /api/v1/projects/:slug/ingest', '{ files: [{ path, body }], prefix? }', '{ written, skipped: [{ path, reason }] }'],
        ]}
      />

      <H2>Errors</H2>
      <Table
        head={['Code', 'Status', 'Meaning']}
        rows={[
          ['unauthorized', '401', 'No token, or a token that was revoked'],
          ['forbidden', '403', 'A valid user without the grant this call needs'],
          ['not_found', '404', 'No such project, memory or version, or one you cannot see'],
          ['invalid_params', '400', 'A field is missing or the wrong type'],
          ['invalid_path', '400', 'A memory path is malformed after normalisation'],
          ['body_too_large', '413', 'The memory body is over 256 KB'],
          ['rate_limited', '429', 'The per-user rate limit; read Retry-After'],
          ['internal', '500', '{ "error": "internal error" } - the database message never leaves the server'],
        ]}
      />

      <H2>Limits</H2>
      <P>
        256 KB per memory body, 1 MiB per request, 100 files and 2 MB per ingest, 60 calls per minute per user. A
        project over its limits is not throttled per project - the ceiling is the caller.
      </P>
    </Prose>
  )
}
