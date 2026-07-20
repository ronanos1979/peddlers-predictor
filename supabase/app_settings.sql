-- Generic key/value site settings table.
-- Currently used for the "decommission mode" splash — hides all patron-facing
-- pages behind a single message once the tournament/raffle is wrapped up.
-- Run this in the Supabase SQL editor before deploying code that reads it.

create table if not exists app_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table app_settings enable row level security;

create policy "public read" on app_settings for select using (true);
create policy "admin write" on app_settings for all using (true) with check (true);

insert into app_settings (key, value)
values (
  'decommission',
  '{"enabled": false, "message": "Thanks for entering. The winner will be announced on Tuesday July 21 at 8pm in Nashua."}'::jsonb
)
on conflict (key) do nothing;
