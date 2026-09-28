# Apply CoachKit SQL

The app cannot create these tables. Paste the scripts in the Supabase SQL editor for the project whose URL is `VITE_SUPABASE_URL` on Vercel. Both scripts are safe to run again.

Do this only after `https://<project-ref>.supabase.co` resolves. A host that does not exist in DNS has nowhere to store the roster. There is no database password or service-role key in this repo or in the Vercel env, so this step stays manual.

## 1. Confirm the project

In Supabase: Project Settings → API.

- Project URL must match Vercel `VITE_SUPABASE_URL` (production and preview).
- The key in Vercel `VITE_SUPABASE_ANON_KEY` must be that project's anon or publishable key.
- Do not put the service-role key in Vercel. Vite inlines `VITE_` values into the browser.

Then redeploy production so the new URL is baked into the bundle.

## 2. Paste the scripts, in order

SQL Editor → New query → paste the whole file → Run.

1. [`migrations/20260926180000_round_one_teams.sql`](migrations/20260926180000_round_one_teams.sql)
   Creates `teams`, `team_members`, `players`, `lineup_plans`, `drills_custom`, `games`, `player_stats`, `practice_sessions`, and `practice_attendance`, plus row level security so only an active member of a team can read or write that team's rows. `auth.jwt()->>'sub'` is the Clerk user id.
2. [`migrations/20260928120000_team_durable.sql`](migrations/20260928120000_team_durable.sql)
   Creates `team_durable` for settings, the in-progress game, and the Contacts schedule. Depends on `is_team_member` from script 1.

Check:

```sql
select tablename
from pg_tables
where schemaname = 'public'
  and tablename in (
    'teams', 'team_members', 'players', 'lineup_plans', 'drills_custom',
    'games', 'player_stats', 'practice_sessions', 'practice_attendance',
    'team_durable'
  )
order by 1;
```

That should return 10 rows.

## 3. Trust Clerk

Production currently signs in through the Clerk development instance:

`https://growing-tetra-53.clerk.accounts.dev`

In Supabase: Authentication → Sign In / Up → Third-party auth → add Clerk, and use that frontend API URL. The browser sends the Clerk session token. `auth.jwt()->>'sub'` must be the Clerk user id (`user_…`).

Optional, for email invites: Clerk → Sessions → Customize session token → `email` = `{{user.primary_email_address}}`. Adding a coach by Clerk user id works without that claim.

Until third-party auth is connected, the roster stays in `localStorage` and the app shows a cloud-sync warning.
