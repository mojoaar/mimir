-- A new address belongs to whoever can read its inbox, so the request waits
-- here until that person clicks the link. `users.email` only changes then.
create table email_changes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  email text not null,
  token_hash bytea not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index email_changes_user on email_changes (user_id);

alter table email_changes enable row level security;

-- The account may see its own pending requests. The confirmation itself runs
-- on the admin pool, because the link is usually opened signed out.
create policy email_change_own on email_changes for all
  using (user_id = app_user_id())
  with check (user_id = app_user_id());

grant select, insert, update, delete on email_changes to mimir_app;
