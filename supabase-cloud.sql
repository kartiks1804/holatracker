-- Profit & Charity Tracker (vanilla) — cloud sync table
-- Run this ONCE in Supabase Dashboard → SQL Editor → New query → Run.
-- Then: Authentication → Providers → enable Email, disable "Confirm email" for personal use (optional).

create table if not exists public.tracker_store (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.tracker_store enable row level security;

drop policy if exists "tracker_store_owner" on public.tracker_store;
create policy "tracker_store_owner" on public.tracker_store
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
