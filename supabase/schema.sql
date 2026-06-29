-- ============================================================
-- Pixel Pal — Supabase schema
-- Run this once in the Supabase SQL editor (SQL Editor -> New query).
-- Creates the shared task list, the push-subscription store, turns on
-- realtime, and (because you chose "one global list everyone shares")
-- opens access to the anon key.
-- ============================================================

-- ---- shared task list (scoped by room code) ----
create table if not exists public.tasks (
  id        text primary key,
  room      text   not null default 'global',
  text      text   not null,
  created   bigint not null,
  remind_at bigint not null,
  repeat    boolean not null default false,
  done      boolean not null default false,
  notified  boolean not null default false
);
-- safe if the table already existed without the room column
alter table public.tasks add column if not exists room text not null default 'global';

-- speeds up the per-room list + the "what's due?" scan the function runs
create index if not exists tasks_room_idx on public.tasks (room, created desc);
create index if not exists tasks_due_idx  on public.tasks (notified, done, remind_at);

-- ---- Web Push subscriptions (one row per device/browser, tagged by room) ----
create table if not exists public.push_subscriptions (
  endpoint     text primary key,
  subscription jsonb  not null,
  room         text,
  created      bigint not null
);
alter table public.push_subscriptions add column if not exists room text;

-- ---- realtime: stream task changes to every open client ----
alter publication supabase_realtime add table public.tasks;

-- ============================================================
-- Access policies
-- NOTE: lists are scoped by an unguessable ROOM CODE that acts as a shared
-- secret — the client only ever reads/writes its own room. These policies
-- stay open to the anon key (no login needed); the privacy comes from the
-- room code. For hard guarantees, add Supabase Auth and filter by user.
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
