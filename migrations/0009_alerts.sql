create table alerts (
  id uuid primary key,
  device text not null,
  team text not null default '',
  name text not null default '',
  job text not null default '',
  kind text not null default 'red',
  note text not null default '',
  org text not null default '',
  where_text text not null default '',
  gps_postcode text not null default '',
  lat double precision,
  lng double precision,
  accuracy double precision,
  phones text not null default '',
  emails text not null default '',
  duress boolean not null default false,
  whatsapp_status text not null default '',
  whatsapp_count int not null default 0,
  email_status text not null default '',
  email_count int not null default 0,
  raised_at timestamptz not null default now(),
  resolved_at timestamptz,
  outcome text not null default '',
  pack_sent_at timestamptz
);
create index alerts_device_raised on alerts (device, raised_at);
create index alerts_team_raised on alerts (team, raised_at);

create table alert_positions (
  id bigserial primary key,
  alert_id uuid not null references alerts (id) on delete cascade,
  lat double precision not null,
  lng double precision not null,
  accuracy double precision,
  at timestamptz not null default now()
);
create index alert_positions_alert on alert_positions (alert_id, at);
