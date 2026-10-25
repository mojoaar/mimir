import { connection } from 'next/server'
import { Callout } from '@/components/docs/callout'
import { H1, H2, P, Prose, Ul } from '@/components/docs/prose'
import { publicMetadata } from '@/lib/seo'

export const instant = false

export async function generateMetadata() {
  await connection()

  return publicMetadata({
    title: 'How search works',
    description: 'Hybrid retrieval with pgvector and PostgreSQL full-text search, fused with reciprocal rank fusion.',
    path: '/docs/search',
  })
}

export default async function SearchPage() {
  return (
    <Prose>
      <H1>How search works</H1>
      <P>
        Two retrievers run over the same rows: a vector arm over the embedding column, and a keyword arm over
        PostgreSQL full-text search. Their result lists are fused with reciprocal rank fusion at{' '}
        <code>k = 60</code>. Fusion is used because a cosine distance and a <code>ts_rank_cd</code> score are not
        comparable numbers; ranks are.
      </P>

      <H2>Path scoping</H2>
      <P>
        <code>path_prefix</code> restricts both arms to a directory. Prefixes are literal: <code>auth</code> matches{' '}
        <code>auth</code> and <code>auth/…</code>, never <code>authentication</code>. Scoping is the main defence
        against a deployment note polluting an authentication query.
      </P>

      <H2>When results are poor</H2>
      <Ul>
        <li>
          Check that an embedding model is configured in <strong>Admin → Settings</strong>. Without one, search is
          keyword only — still useful, much narrower.
        </li>
        <li>
          Check that memories have embeddings. A write never fails because a provider is down; it stores the row with
          no vector and a backfill job fills it in later.
        </li>
        <li>
          Turn on <strong>Learn from this project</strong> so each memory gains a summary. The digest and the search
          results both show summaries, so the agent reads less for the same answer.
        </li>
        <li>Use paths that describe meaning, not files: conventions/state-management, not src/store/index.ts.</li>
      </Ul>

      <Callout kind="note">
        A write never waits on a model. If a provider times out, the memory is stored, keyword search finds it
        immediately, and the vector arrives later.
      </Callout>
    </Prose>
  )
}
