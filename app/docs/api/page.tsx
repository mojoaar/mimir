import { connection } from 'next/server'
import { Code } from '@/components/docs/code'
import { H1, H2, P, Prose, Table } from '@/components/docs/prose'
import { publicMetadata } from '@/lib/seo'

export const instant = false

export async function generateMetadata() {
  await connection()

  return publicMetadata({
    title: 'REST API',
    description: 'Every MCP tool has an HTTP route under /api/v1, authenticated with the same bearer token.',
    path: '/docs/api',
  })
}

export default async function ApiPage() {
  return (
    <Prose>
      <H1>REST API</H1>
      <P>
        The REST surface mirrors the MCP tools one to one. Authentication is the same bearer token, the same limits
        apply, and every call writes one audit row.
      </P>
      <Code language="bash">{`curl -s https://mimir.example.com/api/v1/projects \\
  -H "Authorization: Bearer $MIMIR_TOKEN"`}</Code>

      <H2>Routes</H2>
      <Table
        head={['Method and path', 'Body', 'Returns']}
        rows={[
          ['GET /api/v1/me', '—', 'the calling user'],
          ['GET /api/v1/projects', '—', 'projects you can reach, with roles and memory counts'],
          ['GET /api/v1/projects/:slug/tree?path=&depth=', '—', 'paths and titles'],
          ['GET /api/v1/projects/:slug/memory/:path', '—', 'one memory'],
          ['PUT /api/v1/projects/:slug/memory/:path', '{ "body", "title?", "kind?" }', 'the stored memory'],
          ['DELETE /api/v1/projects/:slug/memory/:path', '—', '{ "deleted": true }'],
          ['POST /api/v1/projects/:slug/search', '{ "query", "path_prefix?", "limit?" }', 'ranked hits'],
          ['GET /api/v1/projects/:slug/digest?budget_tokens=', '—', 'a digest for session start'],
          ['POST /api/v1/projects/:slug/ingest', '{ "files": [{ "path", "body" }], "prefix?" }', 'written and skipped counts'],
        ]}
      />

      <H2>Writing</H2>
      <Code language="bash">{`curl -s -X PUT https://mimir.example.com/api/v1/projects/mimir/memory/deploy/rollback \\
  -H "Authorization: Bearer $MIMIR_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{"body":"Roll back with docker compose down then up on the previous tag."}'`}</Code>

      <H2>Errors</H2>
      <P>
        Codes are stable: <code>unauthorized</code> 401, <code>forbidden</code> 403, <code>not_found</code> 404,{' '}
        <code>invalid_path</code> and <code>invalid_params</code> 400, <code>body_too_large</code> 413,{' '}
        <code>rate_limited</code> 429. Anything else is a plain 500 with <code>{'{"error":"internal error"}'}</code>;
        a database message never reaches the client.
      </P>
      <P>
        Limits: 256 KB per memory body, 1 MiB per request, 100 files and 2 MB per ingest, 60 calls per minute per
        user.
      </P>
    </Prose>
  )
}
