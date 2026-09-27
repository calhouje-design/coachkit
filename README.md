# CoachKit

SAY East youth soccer manager. Vite + React. Sign-in is Clerk. Team data is stored in Supabase and cached in the browser.

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

Preview and production on Vercel need the same `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` names. This repo's agent token cannot read the `calhouje-designs-projects` Vercel team (API 403). If a preview deploy is missing the Supabase vars, copy them from Production onto Preview in the Vercel dashboard.

## Supabase SQL (paste once)

Run [`supabase/migrations/20260926180000_round_one_teams.sql`](supabase/migrations/20260926180000_round_one_teams.sql) in the Supabase SQL editor. It creates teams, coaches, players, lineups, custom drills, games, and practice tables, with row level security so only members of a team can read or write that team's rows.

The agent could not apply this SQL remotely (no database password or service role). Jared or CoS pastes the file once. Free tier only.

### Clerk ↔ Supabase

1. In Supabase: Authentication → Sign In / Up → Third-party auth → add Clerk. Use the Clerk frontend API URL for this app.
2. The app sends the Clerk session token on every Supabase request (`accessToken`). `auth.jwt()->>'sub'` must be the Clerk user id (`user_…`).
3. Optional email invites: in the Clerk dashboard, customize the session token and add `email` = `{{user.primary_email_address}}`. Without that claim, email rows stay pending. Adding a coach by Clerk user id works either way.

Until third-party auth is connected, the app keeps working and shows a cloud-sync warning. The roster stays in `localStorage`.

## What Round One stores

On the first signed-in load, if that team has no cloud rows yet and this browser has local data, the app imports once and marks the team imported. After that, cloud wins. `localStorage` remains a cache. If the signed-in keys are still the sample roster and older `ck_guest_*` keys have real data, the guest data is what gets imported.

Each coach gets a default team the first time they sign in with an empty membership list. The Team tab can add another coach by Clerk user id (`user_…`) or leave an email invite. Everyone on the team shares the roster, lineups, drills, season log, and practice attendance. The owner row cannot be removed in the app. If a person belongs to more than one team, the header switches teams and prefers the team that already has players.

Live Game Day score, the quarter clock, the minute bank, appearance credit, partial-sub marks, and the mid-quarter sub queue are saved on this device only. They are not in the shared cloud record. A saved game day is different: it is a season game log, including the strategy snapshot, and it syncs with the rest of the team data.

The contacts, schedule, and coach notes screen is the **Contacts** tab. Roster edits stay on Game Day.

## Fair play

Planning is blocked when `active players × minimum quarters` is greater than `spots on the field × 4`. The minimum for SAY East 50% is 2 of 4 **quarters on the field**, not clock minutes. The green “planned” flash only appears when nobody is under that minimum.

On the field, drag a player onto another spot or the bench to swap. That uses pointer events so it works with touch. Tap-select is still there when Plan sub is off. A swap that changes who is on the field warns, and does not undo itself, if someone can no longer reach the quarter minimum.

**Plan sub** queues up to three upcoming swaps. Each one is named as who comes on for who goes off. Run now plays one. Cancel removes that one swap. Dragging still swaps immediately. **Bring the bench on** rotates everyone on the bench into this quarter and leaves the minute bank and the other quarters alone.

The play-time chart uses solid green for a full quarter and a split box for half a quarter. A sub in Q2, Q3, or Q4 marks that quarter the same way as Q1. Fair play adds those halves. Two of four quarters is four halves. The label uses the same sum as the boxes.

The quarter control stays at the top of Game Day. Bench players sit beside the pitch. Dotted lines cross the field and stop on the circle, with the player names above the lines. SUB runs those listed swaps when sub mode is on. With nobody paired, it turns on two-tap planning. Full quarters turns half swaps off and plans whole quarters. Sub mode plans halves, spreads sit time, and still targets 4 of 8. The play clock sits on the top-right of the pitch. Tap it to start or stop. At half the quarter it flashes and vibrates when the phone allows it. The mid-quarter card is below the field and closed until you open it.

Strategy sits beside the field. The arrows and the scrolling shapes change the formation for this quarter. Save strategy to game day writes that shape, the sub mode, and the lineups onto the season game log. That log already syncs with the Supabase `games` rows. No new table.

The quarter clock counts up against the league period length and feeds a minute gap on the bench. Fair play itself stays quarter counts. Injury or a late scratch pulls that player from the current quarter forward, keeps minutes already played, and does not rebuild the other players’ plan. Plan Full Game from Q1 clears the clock, the minute bank, and the queue.

**Scramble positions** reshuffles spots for the current quarter only. **Redraw who plays** builds a new on-field group for that quarter and leaves the other quarters alone. It refuses when the quarter cannot cover everyone who still needs it. Neither one is the sub queue.

## Checks

```bash
npm test
npm run build
```

## Deferred

Mid-quarter automatic subs, a game clock, halves for U14+, Soccer Daddy / Clerk production keys, and a full mobile visual pass are not in this change. See the pull request notes.
