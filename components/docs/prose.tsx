import type { ReactNode } from 'react';

const PROSE = 'space-y-4 text-[15px] leading-relaxed text-[var(--text-muted)]';

export function Prose({ children }: { children: ReactNode }) {
  return <div className={PROSE}>{children}</div>;
}

export function H1({ children }: { children: ReactNode }) {
  return (
    <h1 className="mb-6 text-3xl font-semibold tracking-tight text-[var(--fg)]">{children}</h1>
  );
}

export function H2({ children }: { children: ReactNode }) {
  return (
    <h2 className="mt-10 mb-3 text-xl font-semibold tracking-tight text-[var(--fg)]">{children}</h2>
  );
}

export function P({ children }: { children: ReactNode }) {
  return <p className="text-[var(--text-muted)]">{children}</p>;
}

export function Ul({ children }: { children: ReactNode }) {
  return <ul className="list-disc space-y-2 pl-5 text-[var(--text-muted)]">{children}</ul>;
}

export function Table({ head, rows }: { head: string[]; rows: ReactNode[][] }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-[var(--border)]">
      <table className="w-full border-collapse text-left text-sm">
        <thead className="bg-[var(--bg-sunken)]">
          <tr>
            {head.map((cell) => (
              <th key={cell} className="px-3 py-2 font-medium text-[var(--fg)]">
                {cell}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={index} className="border-t border-[var(--border)]">
              {row.map((cell, cellIndex) => (
                <td key={cellIndex} className="px-3 py-2 align-top text-[var(--text-muted)]">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
