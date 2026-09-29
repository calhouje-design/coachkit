# CoachKit

SAY East youth soccer manager. Vite + React. Sign-in is Clerk. Team data is stored in Supabase and cached in the browser.

## Hard rules

Non-negotiable rules for every programming update are in [HARD_RULES.md](HARD_RULES.md).

The goalkeeper plays a full period (a quarter, a third, or a half). No mid-period substitution for the goalkeeper. A new goalkeeper is allowed only between periods.

Live production: https://coachkit-ten.vercel.app

## Setup

```bash
npm install
cp .env.example .env.local
npm run dev
```

`.env.local` needs:

```
VITE_CLERK_PUBLISHABLE_KEY=
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

Use the Supabase **anon** key. Do not put the service-role key in Vite.

Preview and production on Vercel need the same `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` names. Those names are set on both targets. The host in `VITE_SUPABASE_URL` has to resolve before any cloud save works.

## Supabase SQL (paste once)

Follow [`supabase/APPLY.md`](supabase/APPLY.md). Paste the two migration files, in order, into the Supabase SQL editor. There is no database password or service role in this repo, so the scripts cannot be applied from here.

[`supabase/migrations/20260926180000_round_one_teams.sql`](supabase/migrations/20260926180000_round_one_teams.sql) creates teams, coaches, players, lineups, custom drills, games, and practice tables, with row level security so only members of a team can read or write that team's rows. Then [`supabase/migrations/20260928120000_team_durable.sql`](supabase/migrations/20260928120000_team_durable.sql) adds settings, the in-progress game, and the schedule.

### Clerk ↔ Supabase

1. In Supabase: Authentication → Sign In / Up → Third-party auth → add Clerk. Production currently uses `https://growing-tetra-53.clerk.accounts.dev`.
2. The app sends the Clerk session token on every Supabase request (`accessToken`). `auth.jwt()->>'sub'` must be the Clerk user id (`user_…`).
3. Optional email invites: in the Clerk dashboard, customize the session token and add `email` = `{{user.primary_email_address}}`. Without that claim, email rows stay pending. Adding a coach by Clerk user id works either way.

Until third-party auth is connected, the app keeps working and shows a cloud-sync warning. The roster stays in `localStorage`.

## What Round One stores

On the first signed-in load, if that team has no cloud rows yet and this browser has local data, the app imports once and marks the team imported. After that, cloud wins. `localStorage` remains a cache. If the signed-in keys are still the sample roster and older `ck_guest_*` keys have real data, the guest data is what gets imported.

Each coach gets a default team the first time they sign in with an empty membership list. The Team tab can add another coach by Clerk user id (`user_…`) or leave an email invite. Everyone on the team shares the roster (including parent contacts and dev notes), lineups, drills, season log, saved strategies, and practice attendance. The owner row cannot be removed in the app. If a person belongs to more than one team, the header switches teams and prefers the team that already has players.

Run [`supabase/migrations/20260928120000_team_durable.sql`](supabase/migrations/20260928120000_team_durable.sql) after the Round One script. That table stores:

- Settings: sub mode, auto-regenerate, and quarter length
- The in-progress game: formation, score, opponent, minute bank, appearance credit, partial-sub marks, and the sub queue
- The team schedule from the Contacts tab

Until that script has been run, those three stay in `localStorage` and the app shows a cloud-sync note. The roster sync keeps working. The quarter clock stays on this device on purpose, because it moves every second. Fair play is calculated from the lineup. It is not its own row. A saved game day is the season game log, including both share sheets, in `games`.

The contacts, schedule, and coach notes screen is the **Contacts** tab. Parent names and phones live on the player record. Roster edits stay on Game Day. The practice generator is a session tool: attendance is saved, a generated plan is not.

## Fair play

Planning is blocked when `active players × minimum quarters` is greater than `spots on the field × 4`. The minimum for SAY East 50% is 2 of 4 **quarters on the field**, not clock minutes. The green “planned” flash only appears when nobody is under that minimum.

On the field, drag a player onto another spot or the bench to swap. That uses pointer events so it works with touch. Tap-select is still there when Plan sub is off. A swap that changes who is on the field warns, and does not undo itself, if someone can no longer reach the quarter minimum.

**Plan sub** queues up to three upcoming swaps. Each one is named as who comes on for who goes off. Run now plays one. Cancel removes that one swap. Dragging still swaps immediately. **Bring the bench on** rotates everyone on the bench into this quarter and leaves the minute bank and the other quarters alone.

The play-time chart uses solid green for a full quarter and a split box for half a quarter. A sub in Q2, Q3, or Q4 marks that quarter the same way as Q1. Fair play adds those halves. Two of four quarters is four halves. The label uses the same sum as the boxes.

The quarter control stays at the top of Game Day. Bench players sit beside the pitch. Dotted lines cross the field and stop on the circle, with the player names above the lines. Those lines never point at the goalkeeper. SUB runs the listed field swaps when sub mode is on and leaves the goalkeeper in goal. With nobody paired, it turns on two-tap planning. Full quarters turns half swaps off and plans whole quarters. Sub mode plans halves, spreads sit time, and still targets 4 of 8. The play clock sits on the top-right of the pitch. Tap it to start or stop. At half the quarter it flashes and vibrates when the phone allows it. The mid-quarter card is below the field and closed until you open it.

Strategy sits beside the field. The arrows and the scrolling shapes change the formation for this quarter. Save strategy to game day writes that shape, the sub mode, the lineups, and both share sheets onto the season game log. That log already syncs with the Supabase `games` rows. No new table.

Share lineup saves two images. Sheet 1 is four quarter fields, each with the pitch, the bench, and dotted lines to who the bench subs for. Sheet 2 is the green play-time bars (full, split, and bench). The saved game stores `strategy.sheets`: marker positions, sub pairs, and play-time cell kinds. Season redraws both images from that data. The PNG files are created when you save or open a sheet. They are not stored in the game log.

The quarter clock counts up against the league period length and feeds a minute gap on the bench. Fair play itself stays quarter counts. Injury or a late scratch pulls that player from the current quarter forward, keeps minutes already played, and does not rebuild the other players’ plan. Plan Full Game from Q1 clears the clock, the minute bank, and the queue.

**Scramble positions** reshuffles spots for the current quarter only. **Redraw who plays** builds a new on-field group for that quarter and leaves the other quarters alone. It refuses when the quarter cannot cover everyone who still needs it. Neither one is the sub queue.

## Checks

```bash
npm test
npm run build
```

## Deferred

Mid-quarter automatic subs, a game clock, halves for U14+, Soccer Daddy / Clerk production keys, and a full mobile visual pass are not in this change. See the pull request notes.
