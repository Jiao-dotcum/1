-- ============================================================
-- Pixel Pal — Supabase schema
-- Run this once in the Supabase SQL editor (SQL Editor -> New query).
-- Creates the shared task list, the push-subscription store, turns on
-- realtime, and (because you chose "one global list everyone shares")
-- opens access to the anon key.
-- ============================================================

-- ---- shared task list ----
create table if not exists public.tasks (
  id        text primary key,
  text      text   not null,
  created   bigint not null,
  remind_at bigint not null,
  repeat    boolean not null default false,
  done      boolean not null default false,
  notified  boolean not null default false
);

-- speeds up the "what's due?" scan the Edge Function runs every minute
create index if not exists tasks_due_idx
  on public.tasks (notified, done, remind_at);

-- ---- Web Push subscriptions (one row per device/browser) ----
create table if not exists public.push_subscriptions (
  endpoint     text primary key,
  subscription jsonb  not null,
  created      bigint not null
);

-- ---- realtime: stream task changes to every open client ----
alter publication supabase_realtime add table public.tasks;

-- ============================================================
-- Access policies
-- NOTE: you chose ONE GLOBAL LIST everyone shares, so anon (anyone with
-- the site URL) can read/write tasks. Tighten these later (add Supabase
-- Auth or a shared secret) if you want it private.
-- ============================================================
alter table public.tasks enable row level security;
alter table public.push_subscriptions enable row level security;

drop policy if exists tasks_anon_all on public.tasks;
create policy tasks_anon_all on public.tasks
  for all to anon, authenticated
  using (true) with check (true);

-- Clients add their own subscription; the Edge Function (service role)
-- reads them. Allow anon insert/upsert/delete; reads stay server-side.
drop policy if exists push_anon_write on public.push_subscriptions;
create policy push_anon_write on public.push_subscriptions
  for all to anon, authenticated
  using (true) with check (true);
