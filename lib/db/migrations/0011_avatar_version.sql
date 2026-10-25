-- The browser keeps a decoded <img> when its src is unchanged, so the URL has
-- to carry a version or an uploaded picture only appears after a hard reload.
alter table users add column avatar_updated_at timestamptz;
