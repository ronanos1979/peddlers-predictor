-- Email kill-switch + audit log.
-- Blocks every outbound email from this app by default. The app fails CLOSED —
-- if this row or table can't be read for any reason, email sending is treated
-- as blocked. Run this in the Supabase SQL editor.
-- Requires app_settings.sql (or the equivalent table) to already exist.

insert into app_settings (key, value)
values ('email_lockdown', '{"enabled": true}'::jsonb)
on conflict (key) do nothing;

-- Every email attempt (sent or blocked) gets a row here, so there's always a
-- record of what would have gone out even while locked down.
create table if not exists email_log (
  id uuid primary key default gen_random_uuid(),
  type text not null,
  recipients jsonb not null default '[]'::jsonb,
  subject text,
  blocked boolean not null,
  created_at timestamptz not null default now()
);

-- RLS enabled with no policies — deny all public/anon access. Only the
-- server-side admin routes (using the service-role key, which bypasses RLS)
-- can read or write this table; it holds recipient email addresses.
alter table email_log enable row level security;
