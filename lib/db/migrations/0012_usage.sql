-- Every remote provider call leaves a row, so an admin can see what the
-- install spends and notice a loop before the invoice does. Costs are stored in
-- micro-dollars, snapshotted at call time: editing a price must not rewrite
-- what a call already cost.
create table provider_calls (
  id bigserial primary key,
  at timestamptz not null default now(),
  -- No foreign key: the history of what was spent outlives the account or the
  -- provider row it was spent on.
  user_id uuid,
  provider_id uuid,
  preset text not null,
  model text not null,
  kind provider_kind not null,
  purpose text not null,
  prompt_tokens integer,
  completion_tokens integer,
  cost_micros bigint,
  status integer,
  ok boolean not null
);

create index provider_calls_at_idx on provider_calls (at desc);
create index provider_calls_failed_idx on provider_calls (at desc) where not ok;

-- One row per admin: dismissing this hour's spike keeps it quiet for the person
-- who dismissed it, and a later hour is still allowed to shout.
create table usage_dismissals (
  user_id uuid primary key references users (id) on delete cascade,
  dismissed_at timestamptz not null default now()
);

-- USD per million tokens. Null means the provider is unpriced: usage is still
-- counted, the cost is simply unknown.
alter table providers add column input_price numeric(12,4);
alter table providers add column output_price numeric(12,4);
