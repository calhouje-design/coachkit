/**
 * Organization × age defaults for Game Day.
 * Correct a cell here; the picker, clock, and lineup size read this table.
 *
 * MLS NEXT is not its own organization. Custom can stand in for it:
 * U13 is 3 periods × 25 minutes (MLS NEXT Academy Technical Standards 2025-26).
 * https://images.mlssoccer.com/image/upload/v1755231611/assets/mls-next-resources/MLS_NEXT_Academy_Division-_Technical_Standards_2025-26_Final_rbko8l.pdf
 */

export const AGES = ["U6","U7","U8","U9","U10","U11","U12","U13","U14","U15","U16","U17","U18","U19"];

export const ORGS = [
  { id: "us-soccer", label: "US Soccer standard" },
  { id: "say-east", label: "SAY Soccer (SAY East)" },
  { id: "ohio", label: "Club / Ohio (OSA)" },
  { id: "custom", label: "Custom" },
];

export const SOURCES = {
  pdi: "https://www.usyouthsoccer.org/wp-content/uploads/sites/160/2023/09/Player-Development-Initiatives-2017.pdf",
  usys: "https://www.usyouthsoccer.org/wp-content/uploads/sites/160/2026/06/Policy-on-Players-and-Playing-Rules_APP-06.23.2026.pdf",
  sayEast: "https://www.sayeast.org/wp-content/uploads/2022/07/SAY-East-Playing-Laws-Rulebook.pdf",
  ossl: "https://ohio-soccer.org/wp-content/uploads/2025/07/25-26-ossl-rules.pdf",
  smallSided: "https://www.ossrc.com/pdfs/smallsided.pdf",
  osdl: "https://ohio-soccer.org/wp-content/uploads/2021/10/OSDLRules_080421.pdf",
};

/** Saved before organizations existed. The short age is the part before " / ". */
export const LEGACY_LEAGUES = {
  "U6 / Instructional": { age: "U6", periodMinutes: 8, minFraction: 1 },
  "U8 / Passers": { age: "U8", periodMinutes: 12, minFraction: 0.5 },
  "U10 / Wings": { age: "U10", periodMinutes: 15, minFraction: 0.5 },
  "U12 / Strikers": { age: "U12", periodMinutes: 20, minFraction: 0.5 },
  "U14 / Kickers": { age: "U14", periodMinutes: 35, minFraction: 0.5 },
  "U16 / Minors": { age: "U16", periodMinutes: 40, minFraction: 0.5 },
  "U19 / Seniors": { age: "U19", periodMinutes: 45, minFraction: 0.5 },
};

const WITH_GK = {
  4: ["GK", "CD", "CM", "CF"],
  5: ["GK", "LD", "RD", "CM", "CF"],
  6: ["GK", "LD", "RD", "LM", "RM", "CF"],
  7: ["GK", "LD", "RD", "LM", "CM", "RM", "CF"],
  8: ["GK", "LD", "CD", "RD", "LM", "CM", "RM", "CF"],
  9: ["GK", "LD", "CD", "RD", "LM", "CM", "RM", "LF", "RF"],
  10: ["GK", "LD", "CD", "RD", "LM", "CM", "RM", "LF", "CF", "RF"],
  11: ["GK", "LB", "CB", "CB", "RB", "LM", "CM", "CM", "RM", "LF", "RF"],
};

const NO_GK = {
  4: ["LD", "RD", "LM", "RM"],
  5: ["LD", "RD", "LM", "RM", "CF"],
  6: ["LD", "CD", "RD", "LM", "RM", "CF"],
  7: ["LD", "CD", "RD", "LM", "CM", "RM", "CF"],
  8: ["LD", "CD", "RD", "LM", "CM", "RM", "LF", "RF"],
  9: ["LD", "CD", "RD", "LM", "CM", "RM", "LF", "CF", "RF"],
  10: ["LD", "CD", "CD", "RD", "LM", "CM", "RM", "LF", "CF", "RF"],
  11: ["LB", "CB", "CB", "RB", "LM", "CM", "CM", "RM", "LF", "CF", "RF"],
};

function periodTypeFor(periods) {
  if (periods === 2) return "halves";
  if (periods === 3) return "periods";
  return "quarters";
}

function cell(spec) {
  const periods = spec.periods;
  return {
    playersOnField: spec.playersOnField,
    gk: spec.gk,
    periods,
    periodType: periodTypeFor(periods),
    periodMinutes: spec.periodMinutes,
    halvesMinutes: spec.halvesMinutes || null,
    ballSize: spec.ballSize,
    verified: spec.verified !== false,
    source: spec.source,
    note: spec.note || "",
    spring: spec.spring || null,
    minFraction: spec.minFraction == null ? 0.5 : spec.minFraction,
  };
}

function fill(ages, spec) {
  const out = {};
  ages.forEach(age => { out[age] = cell({ ...spec }); });
  return out;
}

const usSmall = {
  playersOnField: 4,
  gk: false,
  periods: 4,
  periodMinutes: 10,
  ballSize: 3,
  verified: true,
  source: SOURCES.pdi,
  note: "4v4, no goalkeeper, four 10-minute quarters.",
};

const us79 = {
  playersOnField: 7,
  gk: true,
  periods: 2,
  periodMinutes: 25,
  ballSize: 4,
  verified: true,
  source: SOURCES.pdi,
  note: "7v7 with a goalkeeper, two 25-minute halves.",
};

const us1112 = {
  playersOnField: 9,
  gk: true,
  periods: 2,
  periodMinutes: 30,
  ballSize: 4,
  verified: true,
  source: SOURCES.pdi,
  note: "9v9 with a goalkeeper, two 30-minute halves.",
};

/**
 * US Soccer standard.
 * U6–U12: Player Development Initiatives (US Youth Soccer PDF of the US Soccer chart).
 * U13–U19: 11v11 with a goalkeeper; half lengths from the US Youth Soccer playing-rules policy.
 */
const US_SOCCER = {
  ...fill(["U6", "U7", "U8"], usSmall),
  ...fill(["U9", "U10"], us79),
  ...fill(["U11", "U12"], us1112),
  ...fill(["U13", "U14"], {
    playersOnField: 11, gk: true, periods: 2, periodMinutes: 35, ballSize: 5,
    verified: true, source: SOURCES.usys, note: "11v11 with a goalkeeper, two 35-minute halves.",
  }),
  ...fill(["U15", "U16"], {
    playersOnField: 11, gk: true, periods: 2, periodMinutes: 40, ballSize: 5,
    verified: true, source: SOURCES.usys, note: "11v11 with a goalkeeper, two 40-minute halves.",
  }),
  ...fill(["U17", "U18", "U19"], {
    playersOnField: 11, gk: true, periods: 2, periodMinutes: 45, ballSize: 5,
    verified: true, source: SOURCES.usys, note: "11v11 with a goalkeeper, two 45-minute halves.",
  }),
};

/**
 * SAY East (Cincinnati), not national SAY.
 * Team sizes: SAY East Playing Laws Rulebook (Jan 2026) exception list.
 * U6 is national 6U inside that same book: SAY East has no U6 division.
 * Period length is the league's choice of quarters or halves (Law 7). Default is quarters.
 */
const SAY_EAST = {
  U6: cell({
    playersOnField: 4, gk: false, periods: 4, periodMinutes: 8, ballSize: 3,
    verified: true, source: SOURCES.sayEast, minFraction: 1,
    note: "SAY East has no U6 division. National 6U guidelines: 4v4, no goalkeeper, 4×8.",
  }),
  // GK at 6v6 is optional in the national laws and SAY East does not say which it uses.
  U7: cell({
    playersOnField: 6, gk: true, periods: 4, periodMinutes: 10, halvesMinutes: 20, ballSize: 3,
    verified: false, source: SOURCES.sayEast,
    note: "Passers are 6v6. Goalkeeper use is unverified, so GK defaults on. Quarters default; halves are 2×20.",
  }),
  U8: cell({
    playersOnField: 6, gk: true, periods: 4, periodMinutes: 10, halvesMinutes: 20, ballSize: 3,
    verified: false, source: SOURCES.sayEast,
    note: "Passers are 6v6. Goalkeeper use is unverified, so GK defaults on. Quarters default; halves are 2×20.",
  }),
  U9: cell({
    playersOnField: 8, gk: true, periods: 4, periodMinutes: 12, halvesMinutes: 24, ballSize: 4,
    verified: true, source: SOURCES.sayEast,
    note: "Wings are 8v8 with a goalkeeper. Quarters default; halves are 2×24.",
  }),
  U10: cell({
    playersOnField: 8, gk: true, periods: 4, periodMinutes: 12, halvesMinutes: 24, ballSize: 4,
    verified: true, source: SOURCES.sayEast,
    note: "Wings are 8v8 with a goalkeeper. Quarters default; halves are 2×24.",
  }),
  U11: cell({
    playersOnField: 9, gk: true, periods: 4, periodMinutes: 15, halvesMinutes: 30, ballSize: 4,
    verified: true, source: SOURCES.sayEast,
    note: "Strikers are 9v9 with a goalkeeper. Quarters default; halves are 2×30.",
  }),
  U12: cell({
    playersOnField: 9, gk: true, periods: 4, periodMinutes: 15, halvesMinutes: 30, ballSize: 4,
    verified: true, source: SOURCES.sayEast,
    note: "Strikers are 9v9 with a goalkeeper. Quarters default; halves are 2×30.",
  }),
  U13: cell({
    playersOnField: 11, gk: true, periods: 4, periodMinutes: 15, halvesMinutes: 30, ballSize: 5,
    verified: true, source: SOURCES.sayEast,
    note: "Kickers are 11v11 in the fall and 9v9 in the spring. Quarters default; halves are 2×30.",
    spring: { playersOnField: 9, gk: true },
  }),
  U14: cell({
    playersOnField: 11, gk: true, periods: 4, periodMinutes: 15, halvesMinutes: 30, ballSize: 5,
    verified: true, source: SOURCES.sayEast,
    note: "Kickers are 11v11 in the fall and 9v9 in the spring. Quarters default; halves are 2×30.",
    spring: { playersOnField: 9, gk: true },
  }),
  // 11v11 is inferred for the high-school band. Quarter length follows national 16U/19U (4×20 or 2×40).
  ...fill(["U15", "U16", "U17", "U18", "U19"], {
    playersOnField: 11, gk: true, periods: 4, periodMinutes: 20, halvesMinutes: 40, ballSize: 5,
    verified: false, source: SOURCES.sayEast,
    note: "11v11 is inferred for U15–U19. Length follows national Minors/Seniors: 4×20 or 2×40.",
  }),
};

/**
 * Club / Ohio (OSA). Ohio South Youth Soccer is now the Ohio Soccer Association.
 * U9+ lengths: Ohio Soccer Developmental League rules, cross-checked with OSSL from U11.
 * Formats: Ohio South small-sided rules (9U–12U) and 11v11 from 13U.
 */
const OHIO = {
  // No Ohio South U6 or U7 card was found. Fall back to US Soccer and flag it.
  U6: cell({
    ...usSmall, verified: false, source: SOURCES.pdi,
    note: "No Ohio U6 card was found. Fell back to the US Soccer 4v4 standard.",
  }),
  U7: cell({
    ...usSmall, verified: false, source: SOURCES.pdi,
    note: "No Ohio U7 card was found. Fell back to the US Soccer 4v4 standard.",
  }),
  // Cincinnati United dev league plays 5v5. Length and goalkeeper use were not published.
  U8: cell({
    playersOnField: 5, gk: false, periods: 4, periodMinutes: 10, ballSize: 3,
    verified: false, source: SOURCES.pdi,
    note: "Cincinnati United dev league is 5v5. Length is unpublished, so 4×10 is the US Soccer quarter. Goalkeeper use is unpublished, so GK is off.",
  }),
  U9: cell({
    playersOnField: 7, gk: true, periods: 2, periodMinutes: 25, ballSize: 4,
    verified: true, source: SOURCES.osdl, note: "7v7 with a goalkeeper, two 25-minute halves.",
  }),
  U10: cell({
    playersOnField: 7, gk: true, periods: 2, periodMinutes: 25, ballSize: 4,
    verified: true, source: SOURCES.osdl, note: "7v7 with a goalkeeper, two 25-minute halves.",
  }),
  U11: cell({
    playersOnField: 9, gk: true, periods: 2, periodMinutes: 30, ballSize: 4,
    verified: true, source: SOURCES.osdl,
    note: "9v9 with a goalkeeper. The 30-minute halves are from the Ohio Soccer Developmental League rules.",
  }),
  U12: cell({
    playersOnField: 9, gk: true, periods: 2, periodMinutes: 30, ballSize: 4,
    verified: true, source: SOURCES.osdl,
    note: "9v9 with a goalkeeper. The 30-minute halves are from the Ohio Soccer Developmental League rules.",
  }),
  U13: cell({
    playersOnField: 11, gk: true, periods: 2, periodMinutes: 35, ballSize: 5,
    verified: true, source: SOURCES.ossl, note: "11v11 with a goalkeeper, two 35-minute halves.",
  }),
  U14: cell({
    playersOnField: 11, gk: true, periods: 2, periodMinutes: 35, ballSize: 5,
    verified: true, source: SOURCES.ossl, note: "11v11 with a goalkeeper, two 35-minute halves.",
  }),
  U15: cell({
    playersOnField: 11, gk: true, periods: 2, periodMinutes: 40, ballSize: 5,
    verified: true, source: SOURCES.ossl, note: "11v11 with a goalkeeper, two 40-minute halves.",
  }),
  U16: cell({
    playersOnField: 11, gk: true, periods: 2, periodMinutes: 40, ballSize: 5,
    verified: true, source: SOURCES.ossl, note: "11v11 with a goalkeeper, two 40-minute halves.",
  }),
  U17: cell({
    playersOnField: 11, gk: true, periods: 2, periodMinutes: 45, ballSize: 5,
    verified: true, source: SOURCES.osdl, note: "11v11 with a goalkeeper, two 45-minute halves.",
  }),
  U18: cell({
    playersOnField: 11, gk: true, periods: 2, periodMinutes: 45, ballSize: 5,
    verified: true, source: SOURCES.osdl, note: "11v11 with a goalkeeper, two 45-minute halves.",
  }),
  U19: cell({
    playersOnField: 11, gk: true, periods: 2, periodMinutes: 45, ballSize: 5,
    verified: true, source: SOURCES.osdl, note: "11v11 with a goalkeeper, two 45-minute halves.",
  }),
};

export const LEAGUE_RULES = {
  "us-soccer": US_SOCCER,
  "say-east": SAY_EAST,
  ohio: OHIO,
};

export function orgLabel(orgId) {
  return ORGS.find(org => org.id === orgId)?.label || ORGS[0].label;
}

export function isLegacyLeague(league) {
  return Object.prototype.hasOwnProperty.call(LEGACY_LEAGUES, league);
}

export function canonicalAge(league) {
  if (LEGACY_LEAGUES[league]) return LEGACY_LEAGUES[league].age;
  const short = String(league || "").split(" / ")[0];
  if (AGES.includes(short)) return short;
  if (short === "Adult") return "U19";
  return "U8";
}

export function ageNumber(league) {
  const n = Number(String(canonicalAge(league)).replace(/\D/g, ""));
  return Number.isFinite(n) && n > 0 ? n : 8;
}

export function playersFromFormat(format) {
  const match = String(format || "").match(/(\d+)\s*v\s*\1/i);
  if (!match) return null;
  const n = Number(match[1]);
  if (n < 4 || n > 11) return null;
  return n;
}

export function formatFromCount(playersOnField) {
  const n = clampPlayers(playersOnField);
  return `${n}v${n}`;
}

export function clampPlayers(value) {
  const n = Number(value);
  if (!Number.isInteger(n)) return 7;
  return Math.min(11, Math.max(4, n));
}

export function clampPeriods(value) {
  const n = Number(value);
  return n === 2 || n === 3 || n === 4 ? n : 4;
}

export function clampMinutes(value, fallback = 10) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(60, Math.max(1, Math.round(n)));
}

export function defaultSlots(playersOnField, gk) {
  const n = clampPlayers(playersOnField);
  const table = gk ? WITH_GK : NO_GK;
  return [...(table[n] || table[7])];
}

export function periodAbbrev(periodType) {
  if (periodType === "halves") return "H";
  if (periodType === "periods") return "P";
  return "Q";
}

export function periodNoun(periodType, count = 2) {
  const one = count === 1;
  if (periodType === "halves") return one ? "half" : "halves";
  if (periodType === "periods") return one ? "period" : "periods";
  return one ? "quarter" : "quarters";
}

/** The goalkeeper plays the full period. A different goalkeeper is only set between periods. */
export function gkFullPeriodReason(periodType) {
  const noun = periodNoun(periodType, 1);
  const plural = periodNoun(periodType, 2);
  return `The goalkeeper plays the whole ${noun}. Change goalkeepers between ${plural}.`;
}

export function tableRule(orgId, age, saySeason = "fall") {
  const org = LEAGUE_RULES[orgId] ? orgId : "us-soccer";
  const row = LEAGUE_RULES[org][AGES.includes(age) ? age : "U8"];
  if (org === "say-east" && saySeason === "spring" && row.spring) {
    return {
      ...row,
      playersOnField: row.spring.playersOnField,
      gk: row.spring.gk,
      note: `${row.note} Spring is selected.`,
    };
  }
  return row;
}

function minutesFor(rule, periods, explicitMinutes) {
  if (explicitMinutes != null && explicitMinutes !== "") {
    const parsed = Number(explicitMinutes);
    if (Number.isFinite(parsed) && parsed > 0) return clampMinutes(parsed);
  }
  // No typed length: two periods use the halves card when the org publishes one,
  // otherwise the org/age default (a 2-period age already stores that length).
  if (periods === 2 && rule.halvesMinutes) return rule.halvesMinutes;
  return rule.periodMinutes;
}

function shape(base) {
  const periods = clampPeriods(base.periods);
  const periodType = periodTypeFor(periods);
  const playersOnField = clampPlayers(base.playersOnField);
  const gk = !!base.gk;
  return {
    ...base,
    playersOnField,
    gk,
    periods,
    periodType,
    periodMinutes: clampMinutes(base.periodMinutes),
    format: formatFromCount(playersOnField),
    slots: defaultSlots(playersOnField, gk),
    periodAbbrev: periodAbbrev(periodType),
    periodNoun: periodNoun(periodType, periods),
    periodNounOne: periodNoun(periodType, 1),
    durationLabel: `${periods} × ${clampMinutes(base.periodMinutes)} min ${periodNoun(periodType, periods)}`,
    gkReason: gk ? gkFullPeriodReason(periodType) : "",
  };
}

/**
 * What Game Day should use right now.
 * A saved team with no org and an old league label keeps its format, a goalkeeper, and 4 periods.
 * Any other missing org uses US Soccer for that age.
 */
export function resolveSetup({ league, format, settings } = {}) {
  const src = settings && typeof settings === "object" ? settings : {};
  const season = src.saySeason === "spring" ? "spring" : "fall";
  const explicitGk = typeof src.gk === "boolean" ? src.gk : null;
  const explicitPeriods = src.periods == null ? null : clampPeriods(src.periods);
  const explicitMinutes = src.quarterMinutes;

  if (src.org === "custom") {
    const custom = src.custom && typeof src.custom === "object" ? src.custom : {};
    const playersOnField = clampPlayers(custom.playersOnField || playersFromFormat(format) || 7);
    const gk = typeof custom.gk === "boolean" ? custom.gk : true;
    const periods = clampPeriods(custom.periods || 4);
    return shape({
      legacy: false,
      orgId: "custom",
      orgLabel: orgLabel("custom"),
      age: canonicalAge(league),
      saySeason: season,
      playersOnField,
      gk,
      periods,
      periodMinutes: clampMinutes(custom.periodMinutes, 10),
      ballSize: null,
      verified: true,
      source: "",
      note: "Custom. These numbers are the coach's, not a rulebook.",
      minFraction: 0.5,
      showSeason: false,
    });
  }

  if (!src.org && isLegacyLeague(league)) {
    const legacy = LEGACY_LEAGUES[league];
    const playersOnField = playersFromFormat(format) || 6;
    const gk = explicitGk == null ? true : explicitGk;
    const periods = explicitPeriods || 4;
    const periodMinutes = explicitMinutes != null && explicitMinutes !== "" && Number(explicitMinutes) > 0
      ? clampMinutes(explicitMinutes)
      : legacy.periodMinutes;
    return shape({
      legacy: true,
      orgId: null,
      orgLabel: orgLabel("us-soccer"),
      age: legacy.age,
      saySeason: season,
      playersOnField,
      gk,
      periods,
      periodMinutes,
      ballSize: null,
      verified: true,
      source: "",
      note: "Saved team. Format and period length stay as they were until you change organization or age.",
      minFraction: legacy.minFraction,
      showSeason: false,
    });
  }

  const orgId = LEAGUE_RULES[src.org] ? src.org : "us-soccer";
  const age = canonicalAge(league);
  const rule = tableRule(orgId, age, season);
  const periods = explicitPeriods || rule.periods;
  const gk = explicitGk == null ? rule.gk : explicitGk;
  const playersOnField = playersFromFormat(format) || rule.playersOnField;
  return shape({
    legacy: false,
    orgId,
    orgLabel: orgLabel(orgId),
    age,
    saySeason: season,
    playersOnField,
    gk,
    periods,
    periodMinutes: minutesFor(rule, periods, explicitMinutes),
    ballSize: rule.ballSize,
    verified: rule.verified,
    source: rule.source,
    note: rule.note,
    minFraction: rule.minFraction,
    showSeason: orgId === "say-east" && (age === "U13" || age === "U14"),
    tablePlayers: rule.playersOnField,
    tableGk: rule.gk,
    tablePeriods: rule.periods,
    tableMinutes: minutesFor(rule, periods, null),
  });
}

export function unverifiedCells() {
  const rows = [];
  Object.entries(LEAGUE_RULES).forEach(([orgId, ages]) => {
    Object.entries(ages).forEach(([age, rule]) => {
      if (!rule.verified) rows.push({ orgId, age, note: rule.note });
    });
  });
  return rows;
}
