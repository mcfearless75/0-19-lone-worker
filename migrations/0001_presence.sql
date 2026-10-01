create table presence (
  team text not null,
  device text not null,
  name text not null,
  job text not null default '',
  lat double precision,
  lng double precision,
  accuracy double precision,
  seen_at timestamptz not null default now(),
  primary key (team, device)
);
