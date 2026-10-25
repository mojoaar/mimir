-- Teams are a sharing group, not a second kind of owner: a team grant gives
-- access to a project and never ownership of it. projects.owner_user_id stays
-- the only owner, so a member with a write grant still cannot archive, delete,
-- re-share or retitle the project.
CREATE TABLE teams (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  name          text NOT NULL,
  slug          text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_user_id, slug)
);

-- role is text rather than an enum: a team has one owner and everyone else is a
-- member, and that is not worth a type that cannot be changed in place later.
CREATE TABLE team_members (
  team_id    uuid NOT NULL REFERENCES teams (id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  role       text NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'member')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (team_id, user_id)
);

-- Every membership check starts from the user, so the index is on user_id.
CREATE INDEX team_members_user_idx ON team_members (user_id);

CREATE TRIGGER teams_updated_at BEFORE UPDATE ON teams
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE teams        ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;

-- SECURITY DEFINER for the same reason as the project helpers: they read across
-- rows the caller's own policy would not show, and the owner bypasses RLS.
CREATE FUNCTION is_team_member(p_team uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1 FROM team_members m WHERE m.team_id = p_team AND m.user_id = app_user_id()
  )
$$;

CREATE FUNCTION owns_team(p_team uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (SELECT 1 FROM teams t WHERE t.id = p_team AND t.owner_user_id = app_user_id())
$$;

-- Same signatures as 0002, so the existing GRANT EXECUTE still covers them.
-- Everything a project can contain (memories, versions, grants, search) reads
-- these two, so adding the team branch here covers all of it at once.
CREATE OR REPLACE FUNCTION can_access_project(p_project uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (SELECT 1 FROM projects p WHERE p.id = p_project AND p.owner_user_id = app_user_id())
      OR EXISTS (SELECT 1 FROM project_grants g
                 WHERE g.project_id = p_project
                   AND g.principal_type = 'user'
                   AND g.principal_id = app_user_id())
      OR EXISTS (SELECT 1 FROM project_grants g
                   JOIN team_members m ON m.team_id = g.principal_id
                  WHERE g.project_id = p_project
                    AND g.principal_type = 'team'
                    AND m.user_id = app_user_id())
$$;

CREATE OR REPLACE FUNCTION can_write_project(p_project uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (SELECT 1 FROM projects p WHERE p.id = p_project AND p.owner_user_id = app_user_id())
      OR EXISTS (SELECT 1 FROM project_grants g
                 WHERE g.project_id = p_project
                   AND g.principal_type = 'user'
                   AND g.principal_id = app_user_id()
                   AND g.role = 'write')
      OR EXISTS (SELECT 1 FROM project_grants g
                   JOIN team_members m ON m.team_id = g.principal_id
                  WHERE g.project_id = p_project
                    AND g.principal_type = 'team'
                    AND m.user_id = app_user_id()
                    AND g.role = 'write')
$$;

CREATE POLICY team_read ON teams FOR SELECT
  USING (owner_user_id = app_user_id() OR is_team_member(id));
CREATE POLICY team_insert ON teams FOR INSERT WITH CHECK (owner_user_id = app_user_id());
CREATE POLICY team_update ON teams FOR UPDATE
  USING (owner_user_id = app_user_id()) WITH CHECK (owner_user_id = app_user_id());
CREATE POLICY team_delete ON teams FOR DELETE USING (owner_user_id = app_user_id());

-- No UPDATE policy: a membership is added or removed, never edited in place.
CREATE POLICY team_member_read ON team_members FOR SELECT
  USING (is_team_member(team_id) OR owns_team(team_id));
CREATE POLICY team_member_insert ON team_members FOR INSERT WITH CHECK (owns_team(team_id));
CREATE POLICY team_member_delete ON team_members FOR DELETE USING (owns_team(team_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON teams, team_members TO mimir_app;
