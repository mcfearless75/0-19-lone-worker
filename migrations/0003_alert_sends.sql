create table alert_sends (
  id bigserial primary key,
  device text not null,
  ip text not null default '',
  at timestamptz not null default now()
);
create index alert_sends_device_at on alert_sends (device, at);
create index alert_sends_ip_at on alert_sends (ip, at);
