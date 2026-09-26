-- CoachKit Round One — teams, shared coaches, and roster data.
-- Paste this entire file into the Supabase SQL editor (free tier) and run it once.
--
-- After it succeeds, connect Clerk as a Supabase third-party auth provider so
-- auth.jwt()->>'sub' is the Clerk user id. The browser uses the anon key plus
-- the Clerk session token. Do not put the service role key in Vite.
--
-- Re-running is safe: tables use IF NOT EXISTS and policies are dropped first.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.teams (
  id uuid primary key default gen_random_uuid(),
  name text not null default '',
  owner_clerk_user_id text not null,
  league text,
  format text,
  local_imported_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.team_members (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  clerk_user_id text,
  email text,
  role text not null check (role in ('owner', 'coach')),
  status text not null default 'active' check (status in ('active', 'invited')),
  created_at timestamptz not null default now()
);

create unique index if not exists team_members_team_clerk_uidx
  on public.team_members (team_id, clerk_user_id)
  where clerk_user_id is not null;

create unique index if not exists team_members_team_email_uidx
  on public.team_members (team_id, lower(email))
  where email is not null;

create index if not exists team_members_clerk_idx
  on public.team_members (clerk_user_id);

create table if not exists public.players (
  team_id uuid not null references public.teams(id) on delete cascade,
  player_id text not null,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (team_id, player_id)
);

create table if not exists public.lineup_plans (
  team_id uuid primary key references public.teams(id) on delete cascade,
  lineups jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.drills_custom (
  team_id uuid not null references public.teams(id) on delete cascade,
  drill_id text not null,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (team_id, drill_id)
);

create table if not exists public.games (
  team_id uuid not null references public.teams(id) on delete cascade,
  game_id text not null,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (team_id, game_id)
);

create table if not exists public.player_stats (
  team_id uuid not null references public.teams(id) on delete cascade,
  player_id text not null,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (team_id, player_id)
);

create table if not exists public.practice_sessions (
  team_id uuid not null references public.teams(id) on delete cascade,
  practice_id text not null,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (team_id, practice_id)
);

create table if not exists public.practice_attendance (
  team_id uuid not null references public.teams(id) on delete cascade,
  practice_id text not null,
  attendance jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (team_id, practice_id)
);

-- ---------------------------------------------------------------------------
-- Membership helper (security definer so policies can read team_members)
-- ---------------------------------------------------------------------------

create or replace function public.is_team_member(tid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.team_members
    where team_id = tid
      and clerk_user_id = (auth.jwt() ->> 'sub')
      and status = 'active'
  );
$$;

revoke all on function public.is_team_member(uuid) from public;
grant execute on function public.is_team_member(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Row level security
-- Active team members can read and write that team's data.
-- ---------------------------------------------------------------------------

alter table public.teams enable row level security;
alter table public.team_members enable row level security;
alter table public.players enable row level security;
alter table public.lineup_plans enable row level security;
alter table public.drills_custom enable row level security;
alter table public.games enable row level security;
alter table public.player_stats enable row level security;
alter table public.practice_sessions enable row level security;
alter table public.practice_attendance enable row level security;

drop policy if exists teams_select on public.teams;
drop policy if exists teams_insert on public.teams;
drop policy if exists teams_update on public.teams;
create policy teams_select on public.teams
  for select to authenticated
  using (
    owner_clerk_user_id = (auth.jwt() ->> 'sub')
    or public.is_team_member(id)
  );
create policy teams_insert on public.teams
  for insert to authenticated
  with check (owner_clerk_user_id = (auth.jwt() ->> 'sub'));
create policy teams_update on public.teams
  for update to authenticated
  using (public.is_team_member(id))
  with check (public.is_team_member(id));

drop policy if exists team_members_select on public.team_members;
drop policy if exists team_members_insert on public.team_members;
drop policy if exists team_members_delete on public.team_members;
drop policy if exists team_members_claim_invite on public.team_members;
create policy team_members_select on public.team_members
  for select to authenticated
  using (
    clerk_user_id = (auth.jwt() ->> 'sub')
    or public.is_team_member(team_id)
  );
create policy team_members_insert on public.team_members
  for insert to authenticated
  with check (
    (
      role = 'owner'
      and status = 'active'
      and clerk_user_id = (auth.jwt() ->> 'sub')
      and exists (
        select 1 from public.teams t
        where t.id = team_id
          and t.owner_clerk_user_id = (auth.jwt() ->> 'sub')
      )
    )
    or (
      role = 'coach'
      and public.is_team_member(team_id)
    )
  );
create policy team_members_delete on public.team_members
  for delete to authenticated
  using (role = 'coach' and public.is_team_member(team_id));
-- Email invites become active when the Clerk session token includes email.
-- The trigger stops a claim from changing team, role, or email.
create or replace function public.protect_member_claim()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.status = 'invited' and new.status = 'active' then
    new.role := old.role;
    new.team_id := old.team_id;
    new.email := old.email;
  end if;
  return new;
end;
$$;

drop trigger if exists team_members_protect_claim on public.team_members;
create trigger team_members_protect_claim
  before update on public.team_members
  for each row
  execute function public.protect_member_claim();

create policy team_members_claim_invite on public.team_members
  for update to authenticated
  using (
    status = 'invited'
    and email is not null
    and lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  )
  with check (
    clerk_user_id = (auth.jwt() ->> 'sub')
    and status = 'active'
    and role = 'coach'
  );

drop policy if exists players_rw on public.players;
create policy players_rw on public.players
  for all to authenticated
  using (public.is_team_member(team_id))
  with check (public.is_team_member(team_id));

drop policy if exists lineup_plans_rw on public.lineup_plans;
create policy lineup_plans_rw on public.lineup_plans
  for all to authenticated
  using (public.is_team_member(team_id))
  with check (public.is_team_member(team_id));

drop policy if exists drills_custom_rw on public.drills_custom;
create policy drills_custom_rw on public.drills_custom
  for all to authenticated
  using (public.is_team_member(team_id))
  with check (public.is_team_member(team_id));

drop policy if exists games_rw on public.games;
create policy games_rw on public.games
  for all to authenticated
  using (public.is_team_member(team_id))
  with check (public.is_team_member(team_id));

drop policy if exists player_stats_rw on public.player_stats;
create policy player_stats_rw on public.player_stats
  for all to authenticated
  using (public.is_team_member(team_id))
  with check (public.is_team_member(team_id));

drop policy if exists practice_sessions_rw on public.practice_sessions;
create policy practice_sessions_rw on public.practice_sessions
  for all to authenticated
  using (public.is_team_member(team_id))
  with check (public.is_team_member(team_id));

drop policy if exists practice_attendance_rw on public.practice_attendance;
create policy practice_attendance_rw on public.practice_attendance
  for all to authenticated
  using (public.is_team_member(team_id))
  with check (public.is_team_member(team_id));

grant select, insert, update, delete on public.teams to authenticated;
grant select, insert, update, delete on public.team_members to authenticated;
grant select, insert, update, delete on public.players to authenticated;
grant select, insert, update, delete on public.lineup_plans to authenticated;
grant select, insert, update, delete on public.drills_custom to authenticated;
grant select, insert, update, delete on public.games to authenticated;
grant select, insert, update, delete on public.player_stats to authenticated;
grant select, insert, update, delete on public.practice_sessions to authenticated;
grant select, insert, update, delete on public.practice_attendance to authenticated;
