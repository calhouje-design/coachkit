-- CoachKit durable settings, in-progress game, and team schedule.
-- Paste this whole file into the Supabase SQL editor after
-- supabase/migrations/20260926180000_round_one_teams.sql.
-- Re-running is safe.

create table if not exists public.team_durable (
  team_id uuid primary key references public.teams(id) on delete cascade,
  settings jsonb not null default '{}'::jsonb,
  game_day jsonb not null default '{}'::jsonb,
  schedule jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.team_durable enable row level security;

drop policy if exists team_durable_rw on public.team_durable;
create policy team_durable_rw on public.team_durable
  for all to authenticated
  using (public.is_team_member(team_id))
  with check (public.is_team_member(team_id));

grant select, insert, update, delete on public.team_durable to authenticated;
