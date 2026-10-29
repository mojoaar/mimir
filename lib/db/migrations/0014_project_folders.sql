-- A directory a session can start in and still reach the right project. One
-- row per account, so two people may claim the same path without colliding.
create table project_folders (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  path text not null,
  created_at timestamptz not null default now(),
  created_by uuid not null references users(id) on delete cascade
);

create unique index project_folders_owner_path on project_folders (created_by, lower(path));
create index project_folders_project on project_folders (project_id);

alter table project_folders enable row level security;

-- Private to the account that claimed it, and only for a project it owns. The
-- WITH CHECK repeats the owner test because an insert is checked against it alone.
create policy folder_own on project_folders for all
  using (created_by = app_user_id())
  with check (created_by = app_user_id() and owns_project(project_id));

grant select, insert, update, delete on project_folders to mimir_app;
