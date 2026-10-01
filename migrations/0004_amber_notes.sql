create table amber_notes (
  id bigserial primary key,
  device text not null,
  name text not null default '',
  job text not null default '',
  note text not null default '',
  audio bytea,
  mime text not null default '',
  lat double precision,
  lng double precision,
  created_at timestamptz not null default now()
);
create index amber_notes_device_at on amber_notes (device, created_at);
