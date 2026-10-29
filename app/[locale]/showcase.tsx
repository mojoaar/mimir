import { AGENTS } from '@/lib/docs/agents';
import { TOOL_NAMES } from '@/lib/mcp/tools';
import { stamp } from '@/lib/format/time'
import { TypingDigest } from './typing-digest';

const FIGURE = 'text-2xl font-semibold tabular-nums';
const LABEL = 'text-xs uppercase tracking-wide text-[var(--text-muted)]';
const DAY = 24 * 60 * 60 * 1000;

export function ClientStrip({ title }: { title: string }) {
  // It sits inside the hero, not after it: as its own section it inherited the
  // page's sixty-four pixel gap and then added its own padding, which left a
  // hole under the terminal. No rule either, the hero already ends with one.
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-2">
      <p className={`${LABEL} mr-1`}>{title}</p>
      <ul className="flex flex-wrap gap-2">
        {AGENTS.map((agent) => (
          <li
            key={agent.id}
            className="rounded-full border border-[var(--border)] px-2.5 py-1 text-xs text-[var(--text-muted)]"
          >
            {agent.name}
          </li>
        ))}
      </ul>
    </div>
  );
}

type StatLabels = Record<'container' | 'mcp' | 'plugin' | 'clients', string>;

export function StatStrip({ labels }: { labels: StatLabels }) {
  // One container, the tools the server and the plugins add, and the clients
  // that speak to it. The plugin figure is a literal because there is no
  // exported list of plugin tools; the other two follow the code.
  const figures: [string, number][] = [
    [labels.container, 1],
    [labels.mcp, TOOL_NAMES.length],
    [labels.plugin, 4],
    [labels.clients, AGENTS.length],
  ];
  return (
    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {figures.map(([label, value]) => (
        // A box each, so four unrelated figures do not read as one run-on line.
        <div
          key={label}
          className="flex flex-col-reverse gap-1 rounded-md border border-[var(--border)] bg-[var(--bg-raised)] p-4"
        >
          <dt className={LABEL}>{label}</dt>
          <dd className={`${FIGURE} text-[var(--fg)]`}>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * The one artifact nothing else on the page can show: the text an agent reads
 * before its first turn. Dated from today, because a fixed date reads as stale
 * within a week.
 */
export function DigestCard({ timeZone }: { timeZone: string }) {
  const day = (daysAgo: number) => stamp(new Date(Date.now() - daysAgo * DAY), timeZone, { dateOnly: true });
  const text = `## What this project already knows (Mimir)

### Procedures

## deploy/rollback (${day(0)})
Redeploy the previous image. Never rebuild it during a rollback.

## auth/sessions (${day(1)})
Sessions slide while in use; a password change revokes every one of them.

## dev/build (${day(2)}) [gotcha]
The integration suite needs the dev database container running first.

## release/changelog-trap (${day(3)})
The Unreleased heading does not survive a release rename; restore the section from its tag.`;

  return (
    <figure className="overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--bg-sunken)]">
      <TypingDigest text={text} />
    </figure>
  );
}

export function SearchMock() {
  return (
    <figure className="flex flex-col gap-4 rounded-lg border border-[var(--border)] bg-[var(--bg-sunken)] p-4">
      <div
        aria-hidden="true"
        className="rounded-md border border-[var(--border)] bg-[var(--bg-raised)] px-3 py-2 font-mono text-sm text-[var(--text-muted)]"
      >
        rotate the signing keys
      </div>
      {[
        {
          project: 'github.com/mojoaar/mimir',
          results: [{ title: 'Rotate the signing keys', path: 'deploy/keys', summary: 'Old keys stay valid for a day.' }],
        },
        {
          project: 'github.com/mojoaar/sigrun',
          results: [{ title: 'Key rotation in the gateway', path: 'auth/keys', summary: 'The gateway reloads on SIGHUP.' }],
        },
      ].map((group) => (
        <div key={group.project} className="flex flex-col gap-2">
          <p className={LABEL}>{group.project}</p>
          {group.results.map((hit) => (
            <div key={hit.path} className="flex flex-col gap-0.5">
              <p className="text-sm font-medium">{hit.title}</p>
              <p className="font-mono text-xs text-[var(--text-muted)]">{hit.path}</p>
              <p className="text-xs text-[var(--text-muted)]">{hit.summary}</p>
            </div>
          ))}
        </div>
      ))}
    </figure>
  );
}
