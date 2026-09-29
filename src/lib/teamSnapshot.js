/** Pure team snapshot shape. Cloud rows and localStorage both use this. */

export function defaultSettings() {
  return {
    subMode: true,
    autoRegen: true,
    quarterMinutes: null,
  };
}

export function defaultGameDay() {
  return {
    formation: "2-2-1",
    homeScore: 0,
    awayScore: 0,
    opponent: "",
    minuteBank: {},
    appearanceCredit: {},
    subSegments: {},
    pairPlan: {},
    subQueue: [],
  };
}

export function emptySnapshot() {
  return {
    teamName: "",
    league: "",
    format: "",
    players: [],
    lineups: {},
    customDrills: [],
    playerStats: {},
    games: [],
    practiceDates: [],
    practiceAttendance: {},
    settings: defaultSettings(),
    gameDay: defaultGameDay(),
    schedule: [],
  };
}

function sortBy(arr, key) {
  return [...(arr || [])].sort((a, b) => String(a?.[key] || "").localeCompare(String(b?.[key] || "")));
}

const ORG_IDS = new Set(["us-soccer", "say-east", "ohio", "custom"]);

function normalizeCustom(value) {
  if (!value || typeof value !== "object") return null;
  return {
    playersOnField: value.playersOnField == null ? null : Number(value.playersOnField),
    gk: typeof value.gk === "boolean" ? value.gk : null,
    periods: value.periods == null ? null : Number(value.periods),
    periodMinutes: value.periodMinutes == null ? null : Number(value.periodMinutes),
  };
}

export function normalizeSettings(value) {
  const src = value && typeof value === "object" ? value : {};
  const minutes = src.quarterMinutes;
  const parsed = Number(minutes);
  const periods = Number(src.periods);
  return {
    subMode: src.subMode === undefined ? true : Boolean(src.subMode),
    autoRegen: src.autoRegen === undefined ? true : Boolean(src.autoRegen),
    quarterMinutes: minutes == null || minutes === "" || Number.isNaN(parsed) ? null : parsed,
    // Missing org stays missing so an older saved team is not rewritten on load.
    org: ORG_IDS.has(src.org) ? src.org : null,
    gk: typeof src.gk === "boolean" ? src.gk : null,
    periods: periods === 2 || periods === 3 || periods === 4 ? periods : null,
    saySeason: src.saySeason === "spring" ? "spring" : "fall",
    custom: normalizeCustom(src.custom),
  };
}

export function normalizeGameDay(value) {
  const src = value && typeof value === "object" ? value : {};
  const base = { ...defaultGameDay(), ...src };
  return {
    formation: base.formation || "2-2-1",
    homeScore: Number(base.homeScore) || 0,
    awayScore: Number(base.awayScore) || 0,
    opponent: base.opponent || "",
    minuteBank: base.minuteBank && typeof base.minuteBank === "object" ? base.minuteBank : {},
    appearanceCredit: base.appearanceCredit && typeof base.appearanceCredit === "object" ? base.appearanceCredit : {},
    subSegments: base.subSegments && typeof base.subSegments === "object" ? base.subSegments : {},
    pairPlan: base.pairPlan && typeof base.pairPlan === "object" ? base.pairPlan : {},
    subQueue: Array.isArray(base.subQueue) ? base.subQueue : [],
  };
}

export function normalizeSchedule(value) {
  const rows = Array.isArray(value) ? value : [];
  return [...rows].sort((a, b) =>
    String(a?.date || "").localeCompare(String(b?.date || ""))
    || String(a?.id || "").localeCompare(String(b?.id || ""))
  );
}

export function normalizeSnapshot(snap) {
  const base = { ...emptySnapshot(), ...(snap || {}) };
  return {
    teamName: base.teamName || "",
    league: base.league || "",
    format: base.format || "",
    players: sortBy(base.players, "id"),
    lineups: base.lineups || {},
    customDrills: sortBy(base.customDrills, "id"),
    playerStats: base.playerStats || {},
    games: sortBy(base.games, "id"),
    practiceDates: sortBy(base.practiceDates, "id"),
    practiceAttendance: base.practiceAttendance || {},
    settings: normalizeSettings(base.settings),
    gameDay: normalizeGameDay(base.gameDay),
    schedule: normalizeSchedule(base.schedule),
  };
}

/** Read one browser prefix (`ck_<user>_` or `ck_guest_`). `get(key, fallback)` reads that prefix. */
export function snapshotFromStorage(get) {
  const read = (key, fallback) => {
    const value = get(key, fallback);
    return value == null ? fallback : value;
  };
  const blob = read("gameDay", null);
  const legacy = {
    formation: read("formation", "2-2-1"),
    homeScore: read("homeScore", 0),
    awayScore: read("awayScore", 0),
    opponent: read("opponent", ""),
    minuteBank: read("minuteBank", {}),
    appearanceCredit: read("appearanceCredit", {}),
    subSegments: read("subSegments", {}),
    pairPlan: read("pairPlan", {}),
    subQueue: read("subQueue", []),
  };
  return normalizeSnapshot({
    teamName: read("teamName", "") || "",
    league: read("league", "") || "",
    format: read("format", "") || "",
    players: read("players", []) || [],
    lineups: read("lineups", {}) || {},
    customDrills: read("customDrills", []) || [],
    playerStats: read("playerStats", {}) || {},
    games: read("games", []) || [],
    practiceDates: read("practiceDates", []) || [],
    practiceAttendance: read("practiceAtt", {}) || {},
    settings: {
      subMode: read("subMode", true),
      autoRegen: read("autoRegen", true),
      quarterMinutes: read("quarterMinutes", null),
      org: read("org", null),
      gk: read("gk", null),
      periods: read("periods", null),
      saySeason: read("saySeason", null),
      custom: read("customRule", null),
    },
    gameDay: blob && typeof blob === "object" ? blob : legacy,
    schedule: read("schedule", []) || [],
  });
}

/**
 * Cloud wins for roster tables.
 * Settings, the in-progress game, and the schedule win from the cloud only after
 * a `team_durable` row exists. Until then the browser copy is kept and uploaded.
 */
export function resolveCloudSnapshot(remote, fallback) {
  const fb = normalizeSnapshot(fallback);
  const durable = Boolean(remote?.durablePresent);
  return normalizeSnapshot({
    teamName: remote?.team?.name || "",
    league: remote?.team?.league || fb.league || "",
    format: remote?.team?.format || fb.format || "",
    players: remote?.players,
    lineups: remote?.lineups,
    customDrills: remote?.customDrills,
    playerStats: remote?.playerStats,
    games: remote?.games,
    practiceDates: remote?.practiceDates,
    practiceAttendance: remote?.practiceAttendance,
    settings: durable ? remote?.settings : fb.settings,
    gameDay: durable ? remote?.gameDay : fb.gameDay,
    schedule: durable ? remote?.schedule : fb.schedule,
  });
}

export function bindField(setter, key, normalize) {
  return (next) => {
    setter(prev => {
      const base = normalize(prev);
      const current = base[key];
      const value = typeof next === "function" ? next(current) : next;
      return { ...base, [key]: value };
    });
  };
}
