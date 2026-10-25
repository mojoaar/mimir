-- Every write keeps the body it replaced, so an agent that overwrites a memory
-- can be diffed and undone. Rows are immutable: no UPDATE is granted.

create table memory_versions (
  id bigserial primary key,
  memory_id uuid not null references memories (id) on delete cascade,
  project_id uuid not null references projects (id) on delete cascade,
  path text not null,
  title text not null,
  summary text,
  body text not null,
  kind text not null,
  source text not null,
  updated_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index memory_versions_path_idx
  on memory_versions (project_id, lower(path), created_at desc);

alter table memory_versions enable row level security;

create policy memory_version_read on memory_versions
  for select using (can_access_project(project_id));

create policy memory_version_write on memory_versions
  for insert with check (can_write_project(project_id));

grant select, insert, delete on memory_versions to mimir_app;
grant usage, select on sequence memory_versions_id_seq to mimir_app;
