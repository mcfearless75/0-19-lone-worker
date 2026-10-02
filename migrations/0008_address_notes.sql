create table address_notes (
  id bigserial primary key,
  team text not null,
  device text not null default '',
  author text not null default '',
  address text not null default '',
  lat double precision not null,
  lng double precision not null,
  level text not null default 'caution',
  note text not null default '',
  source text not null default 'manual',
  created_at timestamptz not null default now()
);
create index address_notes_team_pos on address_notes (team, lat, lng);
create index address_notes_team_at on address_notes (team, created_at);
