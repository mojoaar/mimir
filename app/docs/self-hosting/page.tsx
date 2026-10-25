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

      <H2>Health</H2>
      <P>
        <code>/health</code> and <code>/api/health</code> answer <code>{'{"status":"ok"}'}</code> anonymously and{' '}
        <code>503</code> with <code>{'{"status":"unavailable"}'}</code> when the database is unreachable. The
        authenticated form adds the version, uptime and database latency.
      </P>
    </Prose>
  )
}
