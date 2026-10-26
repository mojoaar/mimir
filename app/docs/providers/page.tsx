import { connection } from 'next/server'
import Link from 'next/link'
import { Callout } from '@/components/docs/callout'
import { Code } from '@/components/docs/code'
import { H1, H2, P, Prose, Table, Ul } from '@/components/docs/prose'
import { publicMetadata } from '@/lib/seo'

export const instant = false

export async function generateMetadata() {
  await connection()

  return publicMetadata({
    title: 'Providers and embeddings',
    description:
      'Which language and embedding model Mimir uses, how keys are scoped, what the 768-dimension rule means, and what each call costs.',
    path: '/docs/providers',
  })
}

export default function ProvidersPage() {
  return (
    <Prose>
      <H1>Providers and embeddings</H1>
      <P>
        Mimir talks to two kinds of model, and they do different jobs. A <strong>language model</strong> reads a memory
        after it is written and answers with a title and a one-line summary. An <strong>embedding model</strong> turns a
        memory into a vector so search can find it by meaning. Without either one Mimir still works — you lose summaries
        and the vector half of search, not the store.
      </P>

      <H2>Who owns a key</H2>
      <Table
        head={['Kind', 'Whose key', 'Where it is chosen']}
        rows={[
          [
            'Language model',
            'Each person’s own',
            'Settings → Providers; a project can pin one provider',
          ],
          [
            'Embedding model',
            'The installation’s',
            'Admin → Embeddings, chosen once by an admin from their own rows',
          ],
        ]}
      />
      <P>
        Summaries are per person because a summary is generated with the key of the person whose memory it is. Vectors
        are install-wide because one column holds one vector space: two embedding models with different dimensions
        cannot share a column, so the choice has to be made once for everybody.
      </P>

      <H2>Presets</H2>
      <P>
        Adding a provider means picking a preset, which supplies the base URL and a sensible default model. Anything
        that speaks the OpenAI API can be added with the last row.
      </P>
      <Table
        head={['Preset', 'Does', 'Default model', 'Notes']}
        rows={[
          ['DeepSeek', 'Chat', 'deepseek-flash', 'deepseek-v4-pro is the other option'],
          ['OpenCode Go', 'Chat', 'deepseek-v4.1-flash', 'The model list is fetched live from OpenCode'],
          ['OpenCode Console', 'Chat', 'deepseek-v4.1-flash', 'Same catalogue, different inference path'],
          ['Ollama', 'Chat and embeddings', 'nomic-embed-text', 'Local, no key; host.docker.internal on compose'],
          ['Octen', 'Embeddings', 'octen-embedding-4b', '0.6b and 8b also listed, all truncate to 768'],
          ['Mistral', 'Chat and embeddings', 'mistral-small-latest', 'Embeddings use codestral-embed'],
          ['OpenAI-compatible', 'Chat and embeddings', '—', 'Your own base URL and model name'],
        ]}
      />

      <H2>The 768-dimension rule</H2>
      <P>
        The vector column is <code>vector(768)</code>. An embedding provider must be able to answer at exactly 768
        dimensions, or its vectors are discarded and search quietly falls back to keywords. Octen takes a{' '}
        <code>dimension</code> field, Mistral’s <code>codestral-embed</code> takes{' '}
        <code>output_dimension</code>, and both truncate to the first N values — so both fit. Mistral’s other embedding
        model, <code>mistral-embed</code>, is fixed at 1024 and is deliberately not offered.
      </P>
      <Callout kind="warning">
        A model that answers with the wrong number of dimensions is not an error at write time — the memory is stored
        without a vector. If semantic search seems to find nothing, check Admin → Embeddings before you check the
        memories.
      </Callout>

      <H2>Adding one</H2>
      <Code language="text">{`Settings → Providers

Provider   [ Ollama ▾ ]
Used for   [ Embeddings ▾ ]        one kind per saved row
Label      [ homelab ]
Model      [ nomic-embed-text ▾ ]
Base URL   [ http://host.docker.internal:11434 ]
API key    [ optional — a local model has none ]
[x] Use as the default for this type`}</Code>
      <Ul>
        <li>
          <strong>Test</strong> probes the provider. For embeddings it asks for one vector and reports its length; for
          chat it lists models. The result is stored on the row and shows in the list.
        </li>
        <li>
          <strong>Set default</strong> makes the row the one used when nothing else is pinned. One default per kind per
          person.
        </li>
        <li>
          <strong>Price</strong> is per million tokens, input and output, and only seeds what a call will cost from now
          on. Editing it never rewrites the calls already recorded.
        </li>
      </Ul>

      <H2>What a call costs</H2>
      <P>
        Every call to a provider leaves a row: tokens in, tokens out, status, and the cost at the price the provider
        carried when the call was made. <strong>Admin → Usage</strong> shows the month split between language and
        embedding spend, an unpriced count, thirty days of daily spend, twenty-four hours of call counts, a breakdown
        by model, a breakdown by person, and the latest failures.
      </P>
      <P>
        A call made by a provider with no price is still counted and appears under <strong>Unpriced</strong>; fill the
        price in on the provider row to price everything from then on. When a provider answers without token usage, Mimir
        estimates from the text length and marks the row as estimated rather than guessing silently.
      </P>

      <H2>The spike pill</H2>
      <P>
        Admins see a pill in the header and above the admin pages when the current hour has at least 20 calls and more
        than five times the median hourly count of the past week. It is aimed at a loop nobody meant to start. Press{' '}
        <code>×</code> and it stays quiet for you until a new hour crosses the line; another admin still sees it.
      </P>

      <H2>Pruning the usage log</H2>
      <P>
        <code>provider_calls</code> has no automatic expiry. At the bottom of <strong>Admin → Usage</strong>, enter a
        number of days and prune; the run is audited with how many rows it removed. The audit log prunes itself on a
        schedule (memory reads after 30 days, the rest after 365), so this control exists only for the usage table.
      </P>

      <H2>When no model is configured</H2>
      <Ul>
        <li>Writes always succeed. The memory is stored with no summary and no vector.</li>
        <li>Search is keyword-only: still fused, still path-scoped, just one arm.</li>
        <li>
          The tree and the digest are unaffected — they read titles and paths, which do not need a model.
        </li>
        <li>
          A backfill can fill missing vectors later, and <strong>Admin → Embeddings</strong> can re-embed everything
          after a model change.
        </li>
      </Ul>

      <Callout kind="tip">
        A homelab needs one Ollama container and two rows: <code>nomic-embed-text</code> for embeddings, and any chat
        model for summaries. That is a complete setup with no remote key at all.
      </Callout>

      <H2>Where to go next</H2>
      <Ul>
        <li>
          <Link className="text-[var(--accent)] underline" href="/docs/how-it-works">
            How Mimir works
          </Link>{' '}
          — paths, versions, digest and search.
        </li>
        <li>
          <Link className="text-[var(--accent)] underline" href="/docs/search">
            How search works
          </Link>{' '}
          — what the vector arm adds and when to trust it.
        </li>
      </Ul>
    </Prose>
  )
}
