-- ENABLE turns RLS on for everyone but the table owner. FORCE would extend it to
-- the owner as well — and the helpers below depend on the owner bypassing
-- policies, or they recurse (projects -> project_grants -> projects) and every
-- query dies with "infinite recursion detected in policy". The app therefore
-- connects as mimir_app, which is not the owner, and RLS applies to every
-- request. That separation is what protects us here, not FORCE.
ALTER TABLE projects       ENABLE ROW LEVEL SECURITY;
ALTER TABLE memories       ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE providers      ENABLE ROW LEVEL SECURITY;

CREATE FUNCTION app_user_id() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('mimir.user_id', true), '')::uuid
$$;

-- Access predicates, defined once. SECURITY DEFINER so they read the grant
-- table without re-entering its policy; owned by mimir_owner, which RLS does
-- not filter. search_path pinned so a hostile schema cannot shadow the tables.
CREATE FUNCTION owns_project(p_project uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (SELECT 1 FROM projects p WHERE p.id = p_project AND p.owner_user_id = app_user_id())
$$;

CREATE FUNCTION can_access_project(p_project uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (SELECT 1 FROM projects p WHERE p.id = p_project AND p.owner_user_id = app_user_id())
      OR EXISTS (SELECT 1 FROM project_grants g
                 WHERE g.project_id = p_project
                   AND g.principal_type = 'user'
                   AND g.principal_id = app_user_id())
$$;

CREATE FUNCTION can_write_project(p_project uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (SELECT 1 FROM projects p WHERE p.id = p_project AND p.owner_user_id = app_user_id())
      OR EXISTS (SELECT 1 FROM project_grants g
                 WHERE g.project_id = p_project
                   AND g.principal_type = 'user'
                   AND g.principal_id = app_user_id()
                   AND g.role = 'write')
$$;

-- projects: read if owner or any grant; write only for the owner.
-- The direct owner check is not redundant: `INSERT ... RETURNING` applies this
-- SELECT policy to the row being inserted, and a row created by this statement
-- is not yet visible to can_access_project's snapshot, so without the first
-- clause every insert that returns an id fails with an RLS violation.
CREATE POLICY project_read ON projects FOR SELECT
  USING (owner_user_id = app_user_id() OR can_access_project(id));
CREATE POLICY project_insert ON projects FOR INSERT WITH CHECK (owner_user_id = app_user_id());
CREATE POLICY project_update ON projects FOR UPDATE
  USING (owner_user_id = app_user_id()) WITH CHECK (owner_user_id = app_user_id());
CREATE POLICY project_delete ON projects FOR DELETE USING (owner_user_id = app_user_id());

-- memories: read follows project access; write needs ownership or a write grant.
-- The predicate is repeated in WITH CHECK because an INSERT is checked against
-- WITH CHECK only, so `true` there would let any user write into any project.
CREATE POLICY memory_read ON memories FOR SELECT USING (can_access_project(project_id));
CREATE POLICY memory_write ON memories FOR ALL
  USING (can_write_project(project_id))
  WITH CHECK (can_write_project(project_id));

CREATE POLICY grant_read ON project_grants FOR SELECT USING (can_access_project(project_id));
CREATE POLICY grant_modify ON project_grants FOR ALL
  USING (owns_project(project_id))
  WITH CHECK (owns_project(project_id));

CREATE POLICY provider_own ON providers FOR ALL
  USING (user_id = app_user_id()) WITH CHECK (user_id = app_user_id());

-- privileges: the runtime role gets no DDL and no way to rewrite history.
GRANT USAGE ON SCHEMA public TO mimir_app;
GRANT EXECUTE ON FUNCTION app_user_id(), owns_project(uuid), can_access_project(uuid), can_write_project(uuid)
  TO mimir_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON
  users, sessions, api_keys, projects, project_grants, memories, providers, tokens,
  backup_runs, settings TO mimir_app;
GRANT INSERT, SELECT ON audit_log TO mimir_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO mimir_app;
