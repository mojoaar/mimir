import { connection } from 'next/server'
import { Code } from '@/components/docs/code'
import { H1, H2, P, Prose } from '@/components/docs/prose'
import { publicMetadata } from '@/lib/seo'

export const instant = false

export async function generateMetadata() {
  await connection()

  return publicMetadata({
    title: 'MCP tools',
    description: 'Arguments and return shapes for every Mimir tool.',
    path: '/docs/tools',
  })
}

export default async function ToolsPage() {
  return (
    <Prose>
      <H1>MCP tools</H1>
      <P>
        All tools take an optional <code>project</code> slug or <code>repo</code> key; when both are missing the{' '}
        <code>X-Mimir-Repo</code> header decides, and a project is created on first write. Paths are lowercase and use{' '}
        <code>a-z0-9._/-</code>; <code>..</code> is refused rather than normalised.
      </P>

      <H2>memory_digest</H2>
      <P>
        Arguments: <code>budget_tokens</code> (default 800). Returns <code>{'{ text, memoryCount, truncated }'}</code>:
        the one-line title of every memory, plus the full summary of the five most recently updated, grouped by
        top-level directory. Deterministic and cheap - call it once at session start.
      </P>

      <H2>memory_search</H2>
      <Code language="json">{`{"query":"how are refresh tokens rotated","path_prefix":"auth","limit":10}`}</Code>
      <P>
        Returns hits with <code>path</code>, <code>title</code>, <code>summary</code> and a fused score. Vector and
        keyword results are combined with reciprocal rank fusion, so a score is a rank artefact, not a similarity:
        compare order, never the number.
      </P>

      <H2>memory_read</H2>
      <P>
        Arguments: <code>path</code>, optional <code>depth</code> (<code>summary</code> for L0+L1 only). Returns the
        body unless depth asks for less.
      </P>

      <H2>memory_write</H2>
      <Code language="json">{`{"path":"deploy/rollback","body":"Roll back with the previous image tag.","title":"Roll back by tag"}`}</Code>
      <P>
        One path is one memory: writing it again replaces the body and clears the generated summary, so extraction
        runs on the new text. Returns <code>{'{ path, created }'}</code>.
      </P>

      <H2>memory_tree</H2>
      <P>
        Arguments: <code>path</code> (a prefix, default the root) and <code>depth</code> (default 3). Directories are
        virtual: they are derived from path prefixes, so there is nothing to create and nothing empty to clean up.
      </P>

      <H2>memory_delete</H2>
      <P>
        Soft deletes. The row keeps its content for 30 days, then a scheduled job removes it. The call is idempotent
        and returns <code>{'{ deleted }'}</code>.
      </P>

      <H2>memory_ingest</H2>
      <P>
        Arguments: <code>files</code> (up to 100, 2 MB total), optional <code>path_prefix</code> (default{' '}
        <code>import</code>). Each file becomes a memory at <code>{'<prefix>/<path>'}</code>. A file whose name cannot
        be a path is listed in <code>skipped</code> instead of failing the batch.
      </P>

      <H2>project_list</H2>
      <P>
        Returns the projects the caller owns or has been granted, with <code>slug</code>, <code>name</code>,{' '}
        <code>role</code> and <code>memoryCount</code>.
      </P>
    </Prose>
  )
}
