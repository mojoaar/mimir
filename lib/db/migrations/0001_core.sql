CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS citext;

CREATE TYPE user_status   AS ENUM ('pending', 'active', 'disabled');
CREATE TYPE user_role     AS ENUM ('admin', 'user');
CREATE TYPE grant_role    AS ENUM ('read', 'write');
CREATE TYPE principal     AS ENUM ('user', 'team');
CREATE TYPE token_kind    AS ENUM ('invite', 'password_reset', 'mfa_reset');
CREATE TYPE provider_kind AS ENUM ('llm', 'embedding');
CREATE TYPE backup_status AS ENUM ('running', 'ok', 'failed');

CREATE TABLE users (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email           citext UNIQUE NOT NULL,
  name            text NOT NULL DEFAULT '',
  password_hash   text,
  status          user_status NOT NULL DEFAULT 'pending',
  role            user_role   NOT NULL DEFAULT 'user',
  locale          text        NOT NULL DEFAULT 'en',
  totp_secret_enc bytea,
  totp_last_step  bigint,
  failed_logins   int         NOT NULL DEFAULT 0,
  locked_until    timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  last_login_at   timestamptz
);

CREATE TABLE sessions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash   bytea NOT NULL UNIQUE,
  ip           inet,
  user_agent   text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  expires_at   timestamptz NOT NULL,
  revoked_at   timestamptz
);

CREATE TABLE api_keys (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name         text NOT NULL,
  prefix       text NOT NULL,
  key_hash     bytea NOT NULL UNIQUE,
  created_at   timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz,
  revoked_at   timestamptz
);

CREATE TABLE projects (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id   uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name            text NOT NULL,
  slug            text NOT NULL,
  repo_key        text,
  description     text NOT NULL DEFAULT '',
  llm_provider_id uuid,
  fts_language    text NOT NULL DEFAULT 'english',
  learning_enabled boolean NOT NULL DEFAULT false,
  archived_at     timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_user_id, slug),
  UNIQUE (owner_user_id, repo_key)
);

CREATE TABLE project_grants (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id     uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  principal_type principal NOT NULL DEFAULT 'user',
  principal_id   uuid NOT NULL,
  role           grant_role NOT NULL DEFAULT 'read',
  created_by     uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, principal_type, principal_id)
);

CREATE TABLE memories (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id     uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  path           text NOT NULL,
  title          text NOT NULL DEFAULT '',
  summary        text,
  body           text NOT NULL,
  tsv            tsvector,
  embedding      vector(768),
  kind           text NOT NULL DEFAULT 'note',
  source         text NOT NULL DEFAULT 'agent',
  author_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  metadata       jsonb NOT NULL DEFAULT '{}',
  deleted_at     timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX memories_path_uniq ON memories (project_id, lower(path));
CREATE INDEX memories_embedding_idx ON memories
  USING hnsw (embedding vector_cosine_ops) WHERE deleted_at IS NULL;
CREATE INDEX memories_tsv_idx ON memories USING gin (tsv) WHERE deleted_at IS NULL;
CREATE INDEX memories_path_prefix ON memories (project_id, path text_pattern_ops);

CREATE TABLE providers (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind             provider_kind NOT NULL,
  preset           text NOT NULL,
  label            text NOT NULL,
  base_url         text NOT NULL,
  model            text NOT NULL,
  api_key_enc      bytea,
  api_key_hint     text,
  dim              int,
  extra            jsonb NOT NULL DEFAULT '{}',
  is_default       boolean NOT NULL DEFAULT false,
  last_verified_at timestamptz,
  last_error       text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, kind, label)
);

CREATE UNIQUE INDEX providers_one_default ON providers (user_id, kind) WHERE is_default;

ALTER TABLE projects
  ADD CONSTRAINT projects_llm_provider_fk
  FOREIGN KEY (llm_provider_id) REFERENCES providers(id) ON DELETE SET NULL;

CREATE TABLE tokens (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind       token_kind NOT NULL,
  token_hash bytea NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  used_at    timestamptz,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE audit_log (
  id          bigserial PRIMARY KEY,
  actor_type  text NOT NULL,
  actor_id    uuid,
  action      text NOT NULL,
  target_type text,
  target_id   text,
  detail      jsonb NOT NULL DEFAULT '{}',
  ip          inet,
  user_agent  text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX audit_log_created_idx ON audit_log (created_at DESC);
CREATE INDEX audit_log_action_idx  ON audit_log (action, created_at DESC);

CREATE TABLE backup_runs (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at   timestamptz NOT NULL DEFAULT now(),
  finished_at  timestamptz,
  status       backup_status NOT NULL DEFAULT 'running',
  target       text NOT NULL,
  object_key   text,
  size_bytes   bigint,
  triggered_by text NOT NULL DEFAULT 'schedule',
  error        text
);

CREATE TABLE settings (
  key        text PRIMARY KEY,
  value      jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES users(id) ON DELETE SET NULL
);

CREATE FUNCTION set_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;

CREATE TRIGGER users_updated_at    BEFORE UPDATE ON users    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER projects_updated_at BEFORE UPDATE ON projects FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER memories_updated_at BEFORE UPDATE ON memories FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER settings_updated_at BEFORE UPDATE ON settings FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Append-only. UPDATE is never allowed. DELETE is allowed only when a job
-- explicitly opts in with SET LOCAL mimir.allow_audit_prune = 'on', which the
-- nightly retention prune does; nothing else sets it.
CREATE FUNCTION audit_log_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' AND current_setting('mimir.allow_audit_prune', true) = 'on' THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'audit_log is append-only';
END $$;

CREATE TRIGGER audit_log_no_update BEFORE UPDATE OR DELETE ON audit_log
FOR EACH ROW EXECUTE FUNCTION audit_log_immutable();
