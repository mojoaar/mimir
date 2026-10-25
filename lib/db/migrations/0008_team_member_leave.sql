-- A member may remove their own row; the team's owner may remove anyone.
-- Permissive policies are ORed, so team_member_delete (owner) is unchanged.
create policy team_member_leave on team_members
  for delete using (user_id = app_user_id());
