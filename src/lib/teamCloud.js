import { useEffect, useRef, useState } from "react";
import { getSupabase, isCloudConfigured, setAccessTokenGetter } from "./supabaseClient.js";
import {
  emptySnapshot,
  normalizeSnapshot,
  resolveCloudSnapshot,
  snapshotFromStorage,
} from "./teamSnapshot.js";

export { emptySnapshot, normalizeSnapshot };

export const DURABLE_SQL_NOTE = "Roster and season logs are in the cloud. Settings, the team schedule, and the in-progress game still need the team_durable table. Paste supabase/migrations/20260928120000_team_durable.sql in the Supabase SQL editor, after the Round One script.";

const SAMPLE_NAMES = [
  "John Smith",
  "Wes Johnson",
  "Jaxon Williams",
  "Remi Brown",
  "Sean Jones",
  "Henry Davis",
  "Jude Garcia",
  "Trey Miller",
  "Maddox Anderson",
];

function friendlyError(error) {
  const msg = error?.message || String(error || "Cloud sync failed");
  if (/jwt|unauthorized|401|pgrst301|invalid claim|no suitable key/i.test(msg)) {
    return "Cloud sync needs Supabase to trust Clerk sign-in (third-party auth). Your roster is still saved on this device. Setup steps are in the README.";
  }
  if (/failed to fetch|network|enotfound|nxdomain|name or service not known|load failed/i.test(msg)) {
    return "Cloud sync could not reach Supabase. Your roster is still saved on this device. Check VITE_SUPABASE_URL.";
  }
  return msg;
}

function stableStringify(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map(k => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(",")}}`;
}

function readPrefix(prefix) {
  const get = (key, fallback) => {
    try {
      const raw = localStorage.getItem(prefix + key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  };
  return snapshotFromStorage(get);
}

function isMissingDurable(error) {
  const msg = `${error?.message || ""} ${error?.code || ""} ${error?.details || ""}`;
  return /team_durable|PGRST205|42P01|schema cache/i.test(msg);
}

function isUntouchedSample(snap) {
  if (!snap) return true;
  if (snap.teamName) return false;
  if (snap.lineups && Object.keys(snap.lineups).length) return false;
  if (snap.games?.length) return false;
  if (snap.customDrills?.length) return false;
  if (snap.practiceDates?.length) return false;
  if (!Array.isArray(snap.players) || snap.players.length !== SAMPLE_NAMES.length) return false;
  if (!snap.players.every((p, i) => p?.name === SAMPLE_NAMES[i])) return false;
  for (const stats of Object.values(snap.playerStats || {})) {
    if ((stats?.goals || 0) || (stats?.assists || 0) || (stats?.gamesPlayed || 0)) return false;
  }
  return true;
}

function remoteHasUserData(remote) {
  return Boolean(
    remote.players.length
    || Object.keys(remote.lineups || {}).length
    || remote.games.length
    || remote.customDrills.length
    || remote.practiceDates.length
  );
}

function collectImportSnapshot(userId, liveSnapshot) {
  const live = normalizeSnapshot(liveSnapshot);
  if (!isUntouchedSample(live)) return live;
  const stored = normalizeSnapshot(readPrefix(`ck_${userId}_`));
  if (!isUntouchedSample(stored)) return stored;
  const guest = normalizeSnapshot(readPrefix("ck_guest_"));
  if (!isUntouchedSample(guest)) return guest;
  return live;
}

async function assertOk(result, label) {
  if (result?.error) {
    const err = new Error(result.error.message || `${label} failed`);
    err.code = result.error.code;
    throw err;
  }
  return result;
}

async function syncChild(supabase, table, idColumn, teamId, rows) {
  const existing = await assertOk(
    await supabase.from(table).select(idColumn).eq("team_id", teamId),
    table
  );
  const keep = new Set(rows.map(row => row[idColumn]));
  const remove = (existing.data || []).map(row => row[idColumn]).filter(id => !keep.has(id));
  if (remove.length) {
    await assertOk(
      await supabase.from(table).delete().eq("team_id", teamId).in(idColumn, remove),
      `${table} delete`
    );
  }
  if (rows.length) {
    await assertOk(await supabase.from(table).upsert(rows), `${table} upsert`);
  }
}

export async function pushTeam(supabase, teamId, snapshot) {
  const snap = normalizeSnapshot(snapshot);
  const now = new Date().toISOString();
  await assertOk(
    await supabase.from("teams").update({
      name: snap.teamName || "",
      league: snap.league || null,
      format: snap.format || null,
      updated_at: now,
    }).eq("id", teamId),
    "teams"
  );
  await syncChild(
    supabase,
    "players",
    "player_id",
    teamId,
    snap.players.map(player => ({
      team_id: teamId,
      player_id: player.id,
      data: player,
      updated_at: now,
    }))
  );
  await assertOk(
    await supabase.from("lineup_plans").upsert({
      team_id: teamId,
      lineups: snap.lineups || {},
      updated_at: now,
    }),
    "lineup_plans"
  );
  await syncChild(
    supabase,
    "drills_custom",
    "drill_id",
    teamId,
    snap.customDrills.map(drill => ({
      team_id: teamId,
      drill_id: drill.id,
      data: drill,
      updated_at: now,
    }))
  );
  await syncChild(
    supabase,
    "games",
    "game_id",
    teamId,
    snap.games.map(game => ({
      team_id: teamId,
      game_id: game.id,
      data: game,
      updated_at: now,
    }))
  );
  await syncChild(
    supabase,
    "player_stats",
    "player_id",
    teamId,
    Object.entries(snap.playerStats || {}).map(([playerId, data]) => ({
      team_id: teamId,
      player_id: playerId,
      data,
      updated_at: now,
    }))
  );
  await syncChild(
    supabase,
    "practice_sessions",
    "practice_id",
    teamId,
    snap.practiceDates.map(session => ({
      team_id: teamId,
      practice_id: session.id,
      data: session,
      updated_at: now,
    }))
  );
  await syncChild(
    supabase,
    "practice_attendance",
    "practice_id",
    teamId,
    Object.entries(snap.practiceAttendance || {}).map(([practiceId, attendance]) => ({
      team_id: teamId,
      practice_id: practiceId,
      attendance: attendance || {},
      updated_at: now,
    }))
  );
  return pushDurable(supabase, teamId, snap, now);
}

async function pushDurable(supabase, teamId, snap, now) {
  const result = await supabase.from("team_durable").upsert({
    team_id: teamId,
    settings: snap.settings || {},
    game_day: snap.gameDay || {},
    schedule: snap.schedule || [],
    updated_at: now,
  });
  if (result.error && isMissingDurable(result.error)) return { missing: true };
  await assertOk(result, "team_durable");
  return { missing: false };
}

async function pullTeam(supabase, teamId) {
  const [teamRes, playersRes, lineupRes, drillsRes, gamesRes, statsRes, pracRes, attRes, durableRes] = await Promise.all([
    supabase.from("teams").select("id, name, league, format, owner_clerk_user_id, local_imported_at, created_at").eq("id", teamId).single(),
    supabase.from("players").select("player_id, data").eq("team_id", teamId),
    supabase.from("lineup_plans").select("lineups").eq("team_id", teamId).maybeSingle(),
    supabase.from("drills_custom").select("drill_id, data").eq("team_id", teamId),
    supabase.from("games").select("game_id, data").eq("team_id", teamId),
    supabase.from("player_stats").select("player_id, data").eq("team_id", teamId),
    supabase.from("practice_sessions").select("practice_id, data").eq("team_id", teamId),
    supabase.from("practice_attendance").select("practice_id, attendance").eq("team_id", teamId),
    supabase.from("team_durable").select("settings, game_day, schedule").eq("team_id", teamId).maybeSingle(),
  ]);
  await assertOk(teamRes, "teams");
  await assertOk(playersRes, "players");
  await assertOk(lineupRes, "lineup_plans");
  await assertOk(drillsRes, "drills_custom");
  await assertOk(gamesRes, "games");
  await assertOk(statsRes, "player_stats");
  await assertOk(pracRes, "practice_sessions");
  await assertOk(attRes, "practice_attendance");
  const durableMissing = Boolean(durableRes.error && isMissingDurable(durableRes.error));
  if (durableRes.error && !durableMissing) await assertOk(durableRes, "team_durable");
  return {
    team: teamRes.data,
    players: (playersRes.data || []).map(row => row.data),
    lineups: lineupRes.data?.lineups || {},
    customDrills: (drillsRes.data || []).map(row => row.data),
    games: (gamesRes.data || []).map(row => row.data),
    playerStats: Object.fromEntries((statsRes.data || []).map(row => [row.player_id, row.data])),
    practiceDates: (pracRes.data || []).map(row => row.data),
    practiceAttendance: Object.fromEntries((attRes.data || []).map(row => [row.practice_id, row.attendance || {}])),
    durableMissing,
    durablePresent: Boolean(durableRes.data) && !durableMissing,
    settings: durableRes.data?.settings || {},
    gameDay: durableRes.data?.game_day || {},
    schedule: durableRes.data?.schedule || [],
  };
}

function toSnapshot(remote, fallback) {
  return resolveCloudSnapshot(remote, fallback);
}

async function listMemberships(supabase, userId) {
  const result = await assertOk(
    await supabase
      .from("team_members")
      .select("team_id, role, status, teams(id, name, owner_clerk_user_id, league, format, local_imported_at, created_at)")
      .eq("clerk_user_id", userId)
      .eq("status", "active"),
    "team_members"
  );
  return result.data || [];
}

async function listMembers(supabase, teamId) {
  const result = await assertOk(
    await supabase
      .from("team_members")
      .select("id, team_id, clerk_user_id, email, role, status, created_at")
      .eq("team_id", teamId)
      .order("created_at", { ascending: true }),
    "team_members list"
  );
  return result.data || [];
}

async function createDefaultTeam(supabase, userId, snap) {
  const inserted = await assertOk(
    await supabase.from("teams").insert({
      name: snap.teamName?.trim() || "My Team",
      owner_clerk_user_id: userId,
      league: snap.league || null,
      format: snap.format || null,
    }).select("id, name, owner_clerk_user_id, league, format, local_imported_at, created_at").single(),
    "create team"
  );
  await assertOk(
    await supabase.from("team_members").insert({
      team_id: inserted.data.id,
      clerk_user_id: userId,
      role: "owner",
      status: "active",
    }),
    "create owner"
  );
  return {
    team_id: inserted.data.id,
    role: "owner",
    status: "active",
    teams: inserted.data,
  };
}

async function claimInvites(supabase, userId, email) {
  if (!email) return;
  const result = await supabase
    .from("team_members")
    .update({ clerk_user_id: userId, status: "active" })
    .eq("status", "invited")
    .ilike("email", email);
  if (result.error && !/jwt|permission|42501|row-level/i.test(result.error.message || "")) {
    // A missing email claim on the Clerk token just means no rows update. Ignore that.
  }
}

async function chooseTeamId(supabase, userId, memberships) {
  const stored = localStorage.getItem(`ck_${userId}_activeTeam`);
  if (stored && memberships.some(m => m.team_id === stored)) return stored;
  if (memberships.length === 1) return memberships[0].team_id;
  const counts = await Promise.all(memberships.map(async membership => {
    const result = await supabase
      .from("players")
      .select("player_id", { count: "exact", head: true })
      .eq("team_id", membership.team_id);
    return {
      id: membership.team_id,
      count: result.count || 0,
      created: membership.teams?.created_at || "",
    };
  }));
  counts.sort((a, b) => b.count - a.count || String(a.created).localeCompare(String(b.created)));
  return counts[0].id;
}

async function markImported(supabase, teamId, userId) {
  const stamp = new Date().toISOString();
  await assertOk(
    await supabase.from("teams").update({ local_imported_at: stamp }).eq("id", teamId),
    "mark imported"
  );
  localStorage.setItem(`ck_${userId}_supabaseMigrated_${teamId}`, stamp);
}

export function useTeamCloud({ userId, email, getToken, snapshot, applySnapshot }) {
  const configured = isCloudConfigured();
  const [status, setStatus] = useState(configured && userId ? "loading" : "off");
  const [error, setError] = useState("");
  const [team, setTeam] = useState(null);
  const [teams, setTeams] = useState([]);
  const [members, setMembers] = useState([]);

  const applyRef = useRef(applySnapshot);
  applyRef.current = applySnapshot;
  const snapRef = useRef(snapshot);
  snapRef.current = snapshot;
  const getTokenRef = useRef(getToken);
  getTokenRef.current = getToken;
  const emailRef = useRef(email);
  emailRef.current = email;
  const expectJson = useRef(null);
  const lastJson = useRef("");
  const ready = useRef(!configured);
  const teamIdRef = useRef(null);
  const pushTimer = useRef(null);

  setAccessTokenGetter(() => getTokenRef.current?.() ?? null);

  const adoptRemote = (remote, fallback) => {
    const next = toSnapshot(remote, fallback);
    expectJson.current = stableStringify(next);
    ready.current = false;
    applyRef.current(next);
    return next;
  };

  useEffect(() => {
    if (!configured || !userId) {
      ready.current = true;
      setStatus("off");
      setTeam(null);
      setTeams([]);
      setMembers([]);
      return undefined;
    }

    let cancel = false;
    ready.current = false;
    setStatus("loading");
    setError("");
    const timeout = setTimeout(() => {
      if (cancel) return;
      cancel = true;
      ready.current = true;
      teamIdRef.current = null;
      setStatus("error");
      setError("Cloud sync is taking too long. Your roster is still saved on this device.");
    }, 25000);

    (async () => {
      try {
        const supabase = getSupabase();
        await claimInvites(supabase, userId, emailRef.current);
        if (cancel) return;
        let memberships = await listMemberships(supabase, userId);
        if (cancel) return;
        if (!memberships.length) {
          const created = await createDefaultTeam(supabase, userId, normalizeSnapshot(snapRef.current));
          if (cancel) return;
          memberships = [created];
        }
        const teamId = await chooseTeamId(supabase, userId, memberships);
        if (cancel) return;
        localStorage.setItem(`ck_${userId}_activeTeam`, teamId);
        const remote = await pullTeam(supabase, teamId);
        if (cancel) return;
        const migratedKey = `ck_${userId}_supabaseMigrated_${teamId}`;
        const alreadyImported = Boolean(remote.team?.local_imported_at || localStorage.getItem(migratedKey));
        const membership = memberships.find(m => m.team_id === teamId) || memberships[0];

        const noteMissing = (result) => {
          if (result?.missing || remote.durableMissing) setError(DURABLE_SQL_NOTE);
        };
        if (!alreadyImported && !remoteHasUserData(remote)) {
          const payload = collectImportSnapshot(userId, snapRef.current);
          const pushed = await pushTeam(supabase, teamId, payload);
          await markImported(supabase, teamId, userId);
          noteMissing(pushed);
          if (stableStringify(payload) !== stableStringify(normalizeSnapshot(snapRef.current))) {
            adoptRemote({
              ...remote,
              durablePresent: !pushed?.missing && !remote.durableMissing,
              settings: payload.settings,
              gameDay: payload.gameDay,
              schedule: payload.schedule,
              team: { ...remote.team, name: payload.teamName, league: payload.league, format: payload.format },
              ...payload,
            }, payload);
          } else {
            lastJson.current = stableStringify(normalizeSnapshot(payload));
            ready.current = true;
          }
        } else if (!remote.durableMissing && !remote.durablePresent) {
          const payload = toSnapshot(remote, snapRef.current);
          const pushed = await pushTeam(supabase, teamId, payload);
          noteMissing(pushed);
          adoptRemote({
            ...remote,
            durablePresent: !pushed?.missing,
            settings: payload.settings,
            gameDay: payload.gameDay,
            schedule: payload.schedule,
          }, payload);
          if (!localStorage.getItem(migratedKey)) localStorage.setItem(migratedKey, "cloud");
        } else {
          adoptRemote(remote, snapRef.current);
          noteMissing(null);
          if (!localStorage.getItem(migratedKey)) localStorage.setItem(migratedKey, "cloud");
        }

        const roster = await listMembers(supabase, teamId);
        if (cancel) return;
        teamIdRef.current = teamId;
        setTeam({
          id: teamId,
          name: membership?.teams?.name || remote.team?.name || "",
          role: membership?.role || "coach",
        });
        setTeams(memberships.map(m => ({
          id: m.team_id,
          name: m.teams?.name || "Team",
          role: m.role,
        })));
        setMembers(roster);
        setStatus("synced");
      } catch (err) {
        if (cancel) return;
        ready.current = true;
        teamIdRef.current = null;
        setStatus("error");
        setError(friendlyError(err));
      } finally {
        clearTimeout(timeout);
      }
    })();

    return () => { cancel = true; clearTimeout(timeout); };
  }, [configured, userId]);

  useEffect(() => {
    if (!configured || status !== "synced" || !team?.id) return undefined;
    const json = stableStringify(normalizeSnapshot(snapshot));
    if (expectJson.current) {
      if (json !== expectJson.current) return undefined;
      expectJson.current = null;
      lastJson.current = json;
      ready.current = true;
      return undefined;
    }
    if (!ready.current || json === lastJson.current) return undefined;
    clearTimeout(pushTimer.current);
    pushTimer.current = setTimeout(async () => {
      pushTimer.current = null;
      try {
        const pushed = await pushTeam(getSupabase(), team.id, snapshot);
        lastJson.current = stableStringify(normalizeSnapshot(snapshot));
        setError(pushed?.missing ? DURABLE_SQL_NOTE : "");
        setStatus("synced");
      } catch (err) {
        setStatus("error");
        setError(friendlyError(err));
      }
    }, 800);
    return () => clearTimeout(pushTimer.current);
  }, [configured, snapshot, status, team?.id]);

  useEffect(() => {
    if (!configured || !userId) return undefined;
    const onFocus = async () => {
      if (!ready.current || !teamIdRef.current || pushTimer.current) return;
      try {
        const remote = await pullTeam(getSupabase(), teamIdRef.current);
        const next = toSnapshot(remote, snapRef.current);
        const json = stableStringify(next);
        if (json === lastJson.current || json === stableStringify(normalizeSnapshot(snapRef.current))) return;
        adoptRemote(remote, snapRef.current);
        const roster = await listMembers(getSupabase(), teamIdRef.current);
        setMembers(roster);
        setTeam(prev => prev ? { ...prev, name: remote.team?.name || prev.name } : prev);
      } catch {
        /* keep the local cache if a refresh fails */
      }
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [configured, userId]);

  const selectTeam = async (teamId) => {
    if (!teamId || teamId === team?.id) return;
    ready.current = false;
    setStatus("loading");
    setError("");
    try {
      const supabase = getSupabase();
      const remote = await pullTeam(supabase, teamId);
      localStorage.setItem(`ck_${userId}_activeTeam`, teamId);
      adoptRemote(remote, snapRef.current);
      teamIdRef.current = teamId;
      const roster = await listMembers(supabase, teamId);
      const meta = teams.find(t => t.id === teamId);
      setTeam({ id: teamId, name: remote.team?.name || meta?.name || "Team", role: meta?.role || "coach" });
      setMembers(roster);
      setStatus("synced");
    } catch (err) {
      ready.current = true;
      setStatus("error");
      setError(friendlyError(err));
    }
  };

  const addCoach = async (raw) => {
    const value = (raw || "").trim();
    if (!team?.id) throw new Error("No team is loaded yet.");
    if (!value) throw new Error("Enter a Clerk user id or an email.");
    const supabase = getSupabase();
    if (value.includes("@")) {
      const emailAddress = value.toLowerCase();
      await assertOk(
        await supabase.from("team_members").insert({
          team_id: team.id,
          email: emailAddress,
          role: "coach",
          status: "invited",
          clerk_user_id: null,
        }),
        "invite coach"
      );
    } else {
      if (!value.startsWith("user_")) {
        throw new Error("Clerk user ids start with user_. Or enter an email to leave a pending invite.");
      }
      await assertOk(
        await supabase.from("team_members").insert({
          team_id: team.id,
          clerk_user_id: value,
          role: "coach",
          status: "active",
        }),
        "add coach"
      );
    }
    setMembers(await listMembers(supabase, team.id));
  };

  const removeCoach = async (memberId) => {
    if (!team?.id) return;
    const supabase = getSupabase();
    await assertOk(
      await supabase.from("team_members").delete().eq("id", memberId).eq("team_id", team.id).eq("role", "coach"),
      "remove coach"
    );
    setMembers(await listMembers(supabase, team.id));
  };

  return {
    configured,
    status,
    error,
    team,
    teams,
    members,
    selectTeam,
    addCoach,
    removeCoach,
  };
}
