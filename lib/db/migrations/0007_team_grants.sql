-- A team owner may revoke the grants that name their team, even on a project
-- they do not own. Without this, deleting a team leaves those grant rows
-- behind: grant_modify filters the DELETE to projects the caller owns, so the
-- statement succeeds having removed nothing.
create policy grant_revoke_team on project_grants
  for delete
  using (principal_type = 'team' and owns_team(principal_id));

-- 0002 grants EXECUTE on its helpers explicitly. Match that here, so a future
-- REVOKE ALL ... FROM PUBLIC cannot silently hide teams from their members.
grant execute on function is_team_member(uuid) to mimir_app;
grant execute on function owns_team(uuid) to mimir_app;
