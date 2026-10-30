-- A requester cannot read the project row (RLS hides projects they have no
-- grant on), so the list of their own requests is served by a definer function
-- that returns the repository name and the answer, and never the project id.
create function my_access_requests()
returns table (
  id uuid,
  repo_key text,
  note text,
  created_at timestamptz,
  decision text,
  resolved_at timestamptz
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select r.id, p.repo_key, r.note, r.created_at, r.decision, r.resolved_at
    from project_access_requests r
    join projects p on p.id = r.project_id
   where r.user_id = app_user_id()
   order by r.created_at desc
$$;

revoke all on function my_access_requests() from public;
grant execute on function my_access_requests() to mimir_app;
