import Link from "next/link";

import type { TreeEntry, TreeOrder } from "@/lib/memory/service";

export type TreeRow = TreeEntry & { created: string; updated: string };

type Labels = {
  live: string;
  deleted: string;
  empty: string;
  label: string;
  sort: string;
  byPath: string;
  byAdded: string;
  byUpdated: string;
};

type Props = {
  slug: string;
  rows: TreeRow[];
  sort: TreeOrder;
  active?: string;
  deletedCount: number;
  showDeleted: boolean;
  labels: Labels;
};

function group(rows: TreeRow[]): { dir: string; rows: TreeRow[] }[] {
  const groups = new Map<string, TreeRow[]>();
  for (const row of rows) {
    const slash = row.path.lastIndexOf("/");
    const dir = slash === -1 ? "" : row.path.slice(0, slash);
    groups.set(dir, [...(groups.get(dir) ?? []), row]);
  }
  return [...groups].map(([dir, rows]) => ({ dir, rows }));
}

export function MemoryTree({
  slug,
  rows,
  sort,
  active,
  deletedCount,
  showDeleted,
  labels,
}: Props) {
  const base = `/app/projects/${slug}`;
  // The order is part of where you are, so opening a memory keeps it.
  const keep = sort === "path" ? "" : `&sort=${sort}`;
  const open = (path: string) =>
    `${base}?path=${encodeURIComponent(path)}${keep}`;
  const pill = (on: boolean) =>
    `rounded border px-2 py-1 ${
      on
        ? "border-[var(--accent)] text-[var(--fg)]"
        : "border-[var(--border)] text-[var(--text-muted)]"
    }`;

  return (
    <nav aria-label={labels.label} className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2 text-sm">
        <Link href={base} className={pill(!showDeleted)}>
          {labels.live}
        </Link>
        <Link href={`${base}?deleted=1`} className={pill(showDeleted)}>
          {labels.deleted}
          {deletedCount > 0 ? ` (${deletedCount})` : ""}
        </Link>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-[var(--text-muted)]">{labels.sort}</span>
        <Link href={base} className={pill(sort === "path")}>
          {labels.byPath}
        </Link>
        <Link href={`${base}?sort=added`} className={pill(sort === "added")}>
          {labels.byAdded}
        </Link>
        <Link
          href={`${base}?sort=updated`}
          className={pill(sort === "updated")}
        >
          {labels.byUpdated}
        </Link>
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-[var(--text-muted)]">{labels.empty}</p>
      ) : sort === "path" ? (
        group(rows).map(({ dir, rows }) => (
          <section key={dir || "/"} className="flex flex-col gap-1">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
              {dir || "/"}
            </h2>
            <ul className="flex flex-col">
              {rows.map((row) => {
                const leaf = dir ? row.path.slice(dir.length + 1) : row.path;
                const selected = row.path === active;
                return (
                  <li key={row.path}>
                    <Link
                      href={open(row.path)}
                      className={`flex items-start gap-2 rounded px-2 py-1 text-sm ${
                        selected
                          ? "bg-[var(--bg-raised)] text-[var(--fg)]"
                          : "text-[var(--text-muted)]"
                      }`}
                    >
                      <span aria-hidden className="mt-1 text-[10px]">
                        {row.hasSummary ? "●" : "○"}
                      </span>
                      <span className="min-w-0 break-words">{leaf}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        ))
      ) : (
        // Folder headings would scatter the newest memories through the list,
        // which is the one thing a date order is for.
        <ul className="flex flex-col">
          {rows.map((row) => {
            const selected = row.path === active;
            const when = sort === "added" ? row.created : row.updated;
            return (
              <li key={row.path}>
                <Link
                  href={open(row.path)}
                  className={`flex items-center gap-2 rounded px-2 py-1 text-sm ${
                    selected
                      ? "bg-[var(--bg-raised)] text-[var(--fg)]"
                      : "text-[var(--text-muted)]"
                  }`}
                >
                  <span className="min-w-0 break-words">{row.path}</span>
                  <span className="ml-auto tabular-nums">{when}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </nav>
  );
}
