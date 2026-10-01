create table welfare_timers (
  id uuid primary key,
  device text not null,
  team text not null default '',
  name text not null default '',
  job text not null default '',
  note text not null default '',
  org text not null default '',
  where_text text not null default '',
  phones text not null default '',
  emails text not null default '',
  lat double precision,
  lng double precision,
  accuracy double precision,
  expires_at timestamptz not null,
  status text not null default 'running',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  fired_at timestamptz
);
create index welfare_timers_due on welfare_timers (status, expires_at);
create index welfare_timers_device on welfare_timers (device, created_at);
