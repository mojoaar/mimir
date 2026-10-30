-- One person asking the owner of a repository project for a way in. The row is
-- what the owner answers; the lookup that creates it is a function below, so a
-- caller never learns another account's project id.
create table project_access_requests (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  note text,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references users(id) on delete set null,
  decision text check (decision in ('granted', 'declined'))
);

-- One open question per person per project. A second ask is not a second row,
-- which is what keeps the owner's list honest.
create unique index project_access_requests_pending
  on project_access_requests (project_id, user_id)
  where resolved_at is null;
create index project_access_requests_project on project_access_requests (project_id);

alter table project_access_requests enable row level security;

-- You see your own asks, and the owners of the project see every ask on it.
create policy request_read on project_access_requests for select
  using (user_id = app_user_id() or owns_project(project_id));

create policy request_insert on project_access_requests for insert
  with check (user_id = app_user_id());

create policy request_update on project_access_requests for update
  using (owns_project(project_id))
  with check (owns_project(project_id));

grant select, insert, update on project_access_requests to mimir_app;

-- Lookup and insert in one call: the caller names a repository, never a project
-- id, so asking cannot be used to probe which projects exist beyond what a
-- repository name already reveals.
create function request_project_access(p_repo_key text, p_note text default null)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := app_user_id();
  v_project uuid;
begin
  if v_user is null then
    return 'no-project';
  end if;

  select p.id into v_project
    from projects p
   where p.repo_key = p_repo_key
     and p.archived_at is null
   order by p.created_at
   limit 1;

  if v_project is null then
    return 'no-project';
  end if;

  -- A team grant counts too, or a member would ask for what they already hold.
  if exists (select 1 from projects p where p.id = v_project and p.owner_user_id = v_user)
     or exists (
       select 1
         from project_grants g
         left join team_members tm
           on g.principal_type = 'team'
          and tm.team_id = g.principal_id
          and tm.user_id = v_user
        where g.project_id = v_project
          and ((g.principal_type = 'user' and g.principal_id = v_user) or tm.user_id is not null)
     )
  then
    return 'already';
  end if;

  insert into project_access_requests (project_id, user_id, note)
  values (v_project, v_user, nullif(btrim(p_note), ''))
  on conflict (project_id, user_id) where resolved_at is null do nothing;

  if not found then
    return 'already';
  end if;

  return 'requested';
end;
$$;

revoke all on function request_project_access(text, text) from public;
grant execute on function request_project_access(text, text) to mimir_app;
