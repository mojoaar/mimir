import { AGENTS } from '@/lib/docs/agents';
import { TOOL_NAMES } from '@/lib/mcp/tools';
import { stamp } from '@/lib/format/time'
import { TypingDigest } from './typing-digest';
import { PRESETS } from '@/lib/providers/presets';

const FIGURE = 'text-2xl font-semibold tabular-nums';
const LABEL = 'text-xs uppercase tracking-wide text-[var(--text-muted)]';
const DAY = 24 * 60 * 60 * 1000;

export function ClientStrip({ title, accent }: { title: string; accent: string }) {
  // It sits inside the hero, not after it: as its own section it inherited the
  // page's sixty-four pixel gap and then added its own padding, which left a
  // hole under the terminal. No rule either, the hero already ends with one.
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-2">
      <p className={`${LABEL} mr-1`}>{labelled(title, accent)}</p>
      <ul className="flex flex-wrap gap-2">
        {AGENTS.map((agent) => (
          <li
            key={agent.id}
            // The two with a plugin of their own, in the accent, because that
            // is the difference the line above is claiming.
            className={`rounded-full border px-2.5 py-1 text-xs ${
              agent.plugin
                ? 'border-[var(--accent)] text-[var(--accent)]'
                : 'border-[var(--border)] text-[var(--text-muted)]'
            }`}
          >
            {agent.name}
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * The word the row is about takes the accent, and which word it is differs by
 * language, so the catalogue names it instead of this file.
 */
function labelled(title: string, accent: string) {
  const at = title.indexOf(accent);
  if (at === -1) return title;
  return (
    <>
      {title.slice(0, at)}
      <span className="text-[var(--accent)]">{accent}</span>
      {title.slice(at + accent.length)}
    </>
  );
}

/**
 * The well and the eye it was paid for, as one mark. Inline so it takes the
 * accent of whichever theme is on, with no image to fall out of date.
 */
export function WhyMark({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 240 240" fill="none" aria-hidden="true">
      <g stroke="currentColor" strokeWidth="2">
        <circle cx="120" cy="120" r="86" />
        <circle cx="120" cy="120" r="66" />
        <circle cx="120" cy="120" r="48" />
        <path d="M62 120c18-24 40-36 58-36s40 12 58 36c-18 24-40 36-58 36s-40-12-58-36z" />
      </g>
      <circle cx="120" cy="120" r="13" fill="currentColor" />
    </svg>
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

/**
 * The names come from the presets the app actually ships, so a provider added or
 * dropped there changes this list without an edit here.
 */
export function ProviderChips({ kind }: { kind: 'llm' | 'embedding' }) {
  const names = Object.values(PRESETS)
    .filter((preset) => preset.kinds.includes(kind))
    .map((preset) => preset.label);

  return (
    <ul className="flex flex-wrap gap-2">
      {names.map((name) => (
        <li
          key={name}
          className="rounded-full border border-[var(--border)] bg-[var(--bg-raised)] px-2.5 py-1 text-xs text-[var(--fg)]"
        >
          {name}
        </li>
      ))}
    </ul>
  );
}
