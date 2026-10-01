alter table presence add column alert_kind text not null default '';
alter table presence add column alert_note text not null default '';
alter table presence add column alert_at timestamptz;
