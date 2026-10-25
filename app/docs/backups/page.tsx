import { connection } from 'next/server'
import { Callout } from '@/components/docs/callout'
import { Code } from '@/components/docs/code'
import { H1, H2, P, Prose, Table, Ul } from '@/components/docs/prose'
import { publicMetadata } from '@/lib/seo'

export const instant = false

export async function generateMetadata() {
  await connection()

  return publicMetadata({
    title: 'Backups and restore',
    description: 'Encrypted, scheduled backups to S3 or WebDAV, with verification, retention and a documented restore.',
    path: '/docs/backups',
  })
}

export default async function BackupsPage() {
  return (
    <Prose>
      <H1>Backups and restore</H1>
      <P>
        A backup run writes two artifacts and only records success after it has read each one back and compared its
        size. One artifact can be restored; the other explains what the database contained.
      </P>

      <Table
        head={['Artifact', 'Contents', 'Restorable']}
        rows={[
          ['mimir-YYYYMMDD-HHMMSS.dump.enc', 'pg_dump -Fc of the whole database', 'Yes, with pg_restore'],
          ['settings-YYYYMMDD-HHMMSS.json.enc', 'Settings, projects, provider labels', 'Read by hand'],
        ]}
      />

      <H2>What is deliberately absent</H2>
      <Ul>
        <li>Provider API keys, backup credentials and the Resend key: the settings export drops them whole.</li>
        <li>Memory bodies in the settings export. They live in the dump, which is the artifact that restores them.</li>
        <li>Any plaintext. Both artifacts are AES-256-GCM, keyed from <code>MIMIR_SECRET</code>.</li>
      </Ul>

      <H2>Targets</H2>
      <P>
        Choose S3 or WebDAV in <strong>Admin → Backups</strong>. S3 takes a bucket, an endpoint, a region, an optional
        prefix and path-style addressing for MinIO. WebDAV takes a base URL, a username and a password — pCloud works
        through <code>https://webdav.pcloud.com</code> with an app-specific password.
      </P>

      <H2>Retention</H2>
      <P>
        Retention counts restore points, not files. A value of 14 keeps the fourteen most recent runs, both artifacts
        of each, and deletes older ones together. Nothing outside the configured prefix is touched.
      </P>

      <H2>Restore</H2>
      <Code language="bash">{`# decrypt an artifact
./scripts/decrypt-backup.mjs mimir-20261025-030000.dump.enc mimir.dump

# restore into a running database
DATABASE_ADMIN_URL=postgres://mimir_owner:...@db:5432/mimir ./scripts/restore.sh mimir.dump --yes`}</Code>
      <Callout kind="warning">
        The restore replaces the database and needs <code>MIMIR_SECRET</code> to decrypt. A backup restored without the
        original secret is a pile of bytes — keep the secret with the backups, in a password manager or a sealed
        envelope, not in the same bucket.
      </Callout>
    </Prose>
  )
}
