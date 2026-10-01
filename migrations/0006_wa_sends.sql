create table wa_sends (
  sid text primary key,
  to_number text not null,
  body text not null,
  status text not null default 'pending',
  checks int not null default 0,
  created_at timestamptz not null default now(),
  done_at timestamptz,
  outcome text not null default ''
);
create index wa_sends_pending on wa_sends (status, created_at);
