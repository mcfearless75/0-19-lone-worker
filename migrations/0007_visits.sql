alter table presence add column visit_state text not null default '';
alter table presence add column visit_started_at timestamptz;
alter table presence add column due_at timestamptz;
alter table presence add column checked_in_at timestamptz;

create table visits (
  id uuid primary key,
  device text not null,
  team text not null default '',
  name text not null default '',
  site text not null default '',
  address text not null default '',
  started_at timestamptz not null,
  arrived_at timestamptz,
  due_at timestamptz,
  checked_in_at timestamptz,
  ended_at timestamptz,
  outcome text not null default '',
  updated_at timestamptz not null default now()
);
create index visits_team_started on visits (team, started_at);
