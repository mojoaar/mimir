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
    title: 'How Mimir works',
    description:
      'Projects, paths, versions, the session digest, hybrid search, teams, and the audit log - how a memory moves through Mimir.',
    path: '/docs/how-it-works',
  })
}

export default function HowItWorksPage() {
  return (
    <Prose>
      <H1>How Mimir works</H1>
      <P>
        Mimir keeps what your agents learn in a database you own. A memory is a row with a path, a body and a title,
        and it belongs to one project. That is the whole model; everything else is a way to read those rows without
        blowing the agent’s context.
      </P>

      <H2>A project is a repository, or a folder you claim</H2>
      <P>
        An agent names its project with the <code>X-Mimir-Repo: github.com/owner/repo</code> header, or with a{' '}
        <code>repo</code> argument on a tool call. The first call creates the project; later calls from any client land
        in the same one. A directory that is not a repository can name its project too: claim the folder in that
        project's settings, and every session you start in it or below it writes there, with the deepest claim
        winning. A git remote always beats a folder. A project holds memories, members and grants, and nothing is
        shared between projects unless you grant it.
      </P>

      <H2>Paths are the index</H2>
      <P>
        Every memory has a path such as <code>conventions/state-management</code> or{' '}
        <code>deploys/rollback</code>. One path is one memory: writing it again replaces the body and keeps the old one
        as a version. Paths are compared case-insensitively and are literal, so <code>auth</code> scopes to{' '}
        <code>auth</code> and <code>auth/…</code> but never to <code>authentication</code>. Describe meaning in the
        path, not a file name - the path is what a search can scope to and what a person scans in the tree.
      </P>

      <H2>Every write keeps its predecessor</H2>
      <P>
        A write archives the body it replaces and trims that path’s history to the last 20 versions. A restore reads a
        version and writes it back as a new version with source <code>restore</code>, so a mistaken restore can itself
        be undone. Nothing in the interface deletes history; a delete soft-deletes the memory.
      </P>

      <H2>The digest is the session start</H2>
      <P>
        <code>memory_digest</code> answers “what do I already know here?” with no query and no embedding call. It reads
        the 200 most recently updated paths, gives titles to all of them, adds summaries to the newest five, groups them
        by the first path segment, and packs the result into 800 tokens by default. The agent pays for one cheap read
        and starts oriented.
      </P>

      <P>
        Procedures are always listed first, with their summary, because a procedure is valid until it is replaced,
        not until it is old. A <code>gotcha</code> and a <code>decision</code> are named in the list, because those
        two change how the line is read. Everything else is left bare: a note is the default, and a label on every
        line would cost a third of the budget to say nothing.
      </P>

      <H2>Search is two arms and a fuse</H2>
      <P>
        A keyword arm over PostgreSQL full-text search and a vector arm over pgvector run on the same rows. Their ranked
        lists are fused with reciprocal rank fusion at <code>k = 60</code>, because a rank is a number both arms agree
        on. Without an embedding provider the vector arm is simply absent and search stays useful; the full explanation
        is in{' '}
        <Link className="text-[var(--accent)] underline" href="/docs/search">
          How search works
        </Link>
        .
      </P>

      <H2>Summaries come from your own model</H2>
      <P>
        With <strong>Learn from this project</strong> on, a background job asks your language model for a title and a
        one-line summary after a write, debounced so a burst of writes costs one call. A model that is down, slow or
        unconfigured never fails a write: the memory is stored, the keyword arm finds it at once, and the summary and
        vector arrive when the provider does.
      </P>

      <H2>People, teams and grants</H2>
      <Table
        head={['Access', 'Can read', 'Can write']}
        rows={[
          ['read grant', 'Tree, read, search, digest', 'No'],
          ['write grant', 'Everything read grants', 'Write, delete, restore versions'],
          ['project owner', 'Everything on the project', 'Settings, members, deletion'],
        ]}
      />
      <P>
        A grant names either a person or a team. Team membership is managed once and every project granted to the team
        follows it. An admin sees every project in the admin area but still needs a grant to read memories through MCP
        or the API.
      </P>

      <H2>The audit log</H2>
      <P>
        Auth, account, project, memory, provider, backup and admin actions write an audit row with the actor, the
        target and a small detail object - never a key, a token or a body. Rows for memory reads are kept 30 days;
        everything else 365. Admins can read the log under{' '}
        <strong>Admin → Audit</strong>, and prune the provider usage log separately under{' '}
        <strong>Admin → Usage</strong>.
      </P>

      <H2>Backups, and getting the data back</H2>
      <P>
        A scheduled run writes an encrypted <code>pg_dump</code> plus a settings export, reads both back to prove they
        are whole, and keeps the number of restore points you asked for. The restore path is documented in{' '}
        <Link className="text-[var(--accent)] underline" href="/docs/backups">
          Backups and restore
        </Link>
        .
      </P>

      <H2>Your account</H2>
      <Ul>
        <li>
          <strong>API keys</strong> on your Profile page mint the bearer token an agent uses for MCP and REST. The
          token is shown once; only its hash is stored. Revoke one and its next call fails.
        </li>
        <li>
          <strong>Two-factor authentication</strong> lives on your Profile page and can be enforced for everyone by an
          admin. Losing the authenticator means an admin must reset MFA for you.
        </li>
        <li>
          <strong>Your picture</strong> and name live on your Profile page. The avatar is stored on your account, so
          it follows you to another browser.
        </li>
      </Ul>

      <Callout kind="note">
        One container, one Postgres. There is no queue service, no object store and no second database to keep alive;
        the scheduled work runs inside the app process.
      </Callout>

      <H2>Where to go next</H2>
      <Ul>
        <li>
          <Link className="text-[var(--accent)] underline" href="/docs/providers">
            Providers and embeddings
          </Link>{' '}
          - which model does what, and what it costs.
        </li>
        <li>
          <Link className="text-[var(--accent)] underline" href="/docs/self-hosting">
            Self-hosting
          </Link>{' '}
          - the compose file, environment and first admin.
        </li>
        <li>
          <Link className="text-[var(--accent)] underline" href="/docs/api">
            HTTP API
          </Link>{' '}
          - the same operations without MCP.
        </li>
      </Ul>

      <Code language="text">{`project  ──  path  ──  memory (title, body, summary)
                  └── version 1..20
         └── grants (person or team, read or write)`}</Code>
    </Prose>
  )
}
