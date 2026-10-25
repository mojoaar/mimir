-- An avatar is small enough to live beside the account rather than on a volume:
-- one row, one backup, no orphaned files when a user is deleted.
alter table users add column avatar bytea;
alter table users add column avatar_type text;
