import { connection } from 'next/server'
import { Callout } from '@/components/docs/callout'
import { Code } from '@/components/docs/code'
import { H1, H2, P, Prose, Ul } from '@/components/docs/prose'
import { publicMetadata } from '@/lib/seo'

export const instant = false

export async function generateMetadata() {
  await connection()

  return publicMetadata({
    title: 'Self-hosting Mimir',
    description: 'Run Mimir on your own hardware with Docker Compose, PostgreSQL 18 and a reverse proxy.',
    path: '/docs/self-hosting',
  })
}

export default async function SelfHostingPage() {
  return (
    <Prose>
      <H1>Self-hosting</H1>
      <P>
        Mimir is one application container and one PostgreSQL 18 container with pgvector. Nothing else is required:
        jobs run inside the app process, and there is no Redis, no object store and no external queue.
      </P>

      <H2>Quick start</H2>
      <Code language="bash">{`cp .env.example .env
openssl rand -hex 32   # paste into MIMIR_SECRET
docker compose up -d`}</Code>
      <P>
        Two passwords in <code>.env</code> are required before the first start: <code>POSTGRES_OWNER_PASSWORD</code> and{' '}
        <code>MIMIR_APP_PASSWORD</code>. Both must be URL-safe, because they are interpolated into connection strings.
        The first boot creates the schema, the two database roles and the admin account from{' '}
        <code>MIMIR_ADMIN_EMAIL</code> and <code>MIMIR_ADMIN_PASSWORD</code>.
      </P>

      <Callout kind="warning">
        <code>MIMIR_SECRET</code> encrypts provider keys, backup credentials and every backup artifact. Store it
        outside the compose file and never regenerate it: a lost secret makes backups unreadable and credentials
        undecryptable.
      </Callout>

      <H2>Behind a proxy</H2>
      <Ul>
        <li>
          Set <code>MIMIR_PUBLIC_URL</code> to the address people actually use. It is never inferred from the request,
          because a forged <code>Host</code> header would poison emailed links.
        </li>
        <li>
          Set <code>MIMIR_TRUSTED_PROXIES</code> to the proxy addresses. Without it Mimir cannot see a client address,
          so audit rows carry no IP and a non-empty IP allowlist denies everyone.
        </li>
        <li>The container publishes on 127.0.0.1 only. Publish it on a public interface and the allowlist becomes advisory.</li>
      </Ul>

      <H2>Upgrading from 0.2.0</H2>
      <P>
        0.3.0 moved to PostgreSQL 18. Dump with a 17 client, then restore into the new volume; there is no automatic
        migration. 0.4.0 has no schema change.
      </P>

      <H2>Browsing memory</H2>
      <P>
        Every memory is reachable in the web app at <code>/app/projects/&lt;slug&gt;</code>: a directory tree on the
        left, a reader on the right, search in the header, and a deep link for every memory
        (<code>?path=auth/rotation</code>). Saving an edit rewrites the body and clears the summary until the
        learning job writes a new one; deleting keeps the memory recoverable for 30 days, after which a nightly job
        removes it for good. Archiving a project hides it from every list and API call without touching its rows.
      </P>
      <P>
        Every write keeps the body it replaced. Open a memory and follow <strong>History</strong> to see the last 20
        bodies, diff one against what is live now, and restore it. A restore is an ordinary write, so the body it
        replaced becomes history too and a mistaken restore can be undone the same way. History is dropped when a
        memory is purged, 30 days after it was deleted.
      </P>

      <H2>Import an existing project</H2>
      <P>
        <code>npx @mojoaar/opencode-mimir ingest .</code> reads a folder and loads its documentation and
        configuration — READMEs, <code>docs/</code>, markdown, compose files, <code>package.json</code> — into the
        project under <code>import/</code>, where <code>memory_search</code> finds them. Source code is skipped by
        default, because the agent already has it on disk.
      </P>
      <P>
        In a git repository the import lands in the same project your agents write to, so nothing is duplicated.
        A folder that is not a repository needs a name: <code>--project notes</code> creates <code>notes</code> on
        the first run and reuses it afterwards, which also means the same folder on another machine is a different
        project. <code>--all</code> imports every text file, and <code>--dry-run</code> prints what would be sent
        without sending it.
      </P>

      <H2>Sharing a project</H2>
      <P>
        A project can be shared with a person or with a <strong>team</strong>. Open a project, then{' '}
        <strong>Settings → Sharing</strong>, and grant either <code>read</code> or <code>read and write</code>. A
        team is a group of accounts with one owner and any number of members: <strong>Teams</strong> in the app
        creates one, adds people by email, and removes them again. Removing a member ends their access on their next
        request, because access is read from the database every time rather than cached in a session.
      </P>
      <P>
        A share is never the owner. Whoever owns the project keeps every right — renaming, archiving, deleting,
        sharing again and changing settings — and a person or team with write access can read, write, delete and
        restore memories but cannot do any of those. Deleting a team takes its shares with it; the projects it could
        see are untouched.
      </P>
      <P>
        An agent sees this too: <code>project_list</code> returns the projects shared with a team the token&apos;s
        user belongs to, under the role the team grants.
      </P>

      <H2>Signing in and out</H2>
      <P>
        A user who forgets a password can ask for a link at <code>/forgot-password</code>: it is emailed when Resend
        is configured, and otherwise the admin sends it from <strong>Admin → Users → Reset password</strong>. The page
        answers the same way whether or not the address has an account, so it cannot be used to discover who has one.
        A link lasts an hour, works once, and signing in with it ends every other session for that account.
      </P>

      <H2>Health</H2>
      <P>
        <code>/health</code> and <code>/api/health</code> answer <code>{'{"status":"ok"}'}</code> anonymously and{' '}
        <code>503</code> with <code>{'{"status":"unavailable"}'}</code> when the database is unreachable. The
        authenticated form adds the version, uptime and database latency.
      </P>
    </Prose>
  )
}
