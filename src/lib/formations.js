/** Base formation for every period, plus optional per-period overrides. Stored on the game-day JSON. */

function isGk(pos) {
  return String(pos || "").trim().toUpperCase() === "GK";
}

export function normalizeFormationOverrides(value, maxPeriod = 4) {
  if (!value || typeof value !== "object") return {};
  const cap = Math.max(1, Number(maxPeriod) || 4);
  const out = {};
  Object.entries(value).forEach(([key, name]) => {
    const period = Number(key);
    if (!Number.isInteger(period) || period < 1 || period > cap) return;
    if (typeof name !== "string" || !name.trim()) return;
    out[period] = name.trim();
  });
  return out;
}

export function formationNameForPeriod(base, overrides, period, totalQuarters = 4) {
  const q = Number(period);
  const cap = Number(totalQuarters) || 4;
  if (!Number.isInteger(q) || q < 1 || q > cap) return base || "";
  const map = normalizeFormationOverrides(overrides);
  return map[q] || base || "";
}

/** A name that matches the base is not an override. Periods past the last one are refused. Stored overrides for a longer game stay. */
export function withPeriodOverride(overrides, period, name, base, totalQuarters = 4) {
  const map = { ...normalizeFormationOverrides(overrides) };
  const q = Number(period);
  const cap = Number(totalQuarters) || 4;
  if (!Number.isInteger(q) || q < 1 || q > cap) return map;
  if (!name || name === base) delete map[q];
  else map[q] = name;
  return map;
}

export function withoutPeriodOverride(overrides, period) {
  const map = { ...normalizeFormationOverrides(overrides) };
  delete map[Number(period)];
  return map;
}

/**
 * Keep the same players on the field and put them on a new shape.
 * The goalkeeper stays in the GK slot when both shapes have one.
 */
export function reshapeLineup(lineup, slots) {
  if (!lineup?.starters || !Array.isArray(slots) || slots.length === 0) return lineup;
  const field = lineup.starters.map(slot => slot.player).filter(Boolean);
  const gkPlayer = lineup.starters.find(slot => isGk(slot.pos) && slot.player)?.player || null;
  const used = new Set();
  const starters = slots.map(pos => {
    let player = null;
    if (isGk(pos) && gkPlayer) player = gkPlayer;
    if (!player) {
      player = field.find(item => item && !used.has(item.id) && !(gkPlayer && item.id === gkPlayer.id && isGk(pos))
        && (item.positions || []).includes(pos) && !(gkPlayer && item.id === gkPlayer.id))
        || field.find(item => item && !used.has(item.id) && !(gkPlayer && item.id === gkPlayer.id));
    }
    if (player) used.add(player.id);
    return { pos, player: player || null };
  });
  const onField = new Set(starters.map(slot => slot.player?.id).filter(Boolean));
  const bench = [
    ...(lineup.bench || []).filter(player => player && !onField.has(player.id)),
    ...field.filter(player => !onField.has(player.id)),
  ];
  return { starters, bench };
}

/**
 * Periods already played keep the previous base name when they had no override.
 * Chips and a saved strategy then name that shape instead of the new base.
 */
export function preservePlayedBase(overrides, fromPeriod, oldBase, totalQuarters = 4) {
  const map = { ...normalizeFormationOverrides(overrides) };
  const start = Number(fromPeriod);
  const cap = Number(totalQuarters) || 4;
  if (!oldBase || !Number.isInteger(start)) return map;
  for (let q = 1; q < start && q <= cap; q++) {
    if (!map[q]) map[q] = oldBase;
  }
  return map;
}

/** New base slots land on periods from fromPeriod on that are not overridden. fromPeriod is required. */
export function reapplyBase(lineups, { periods = 4, baseSlots, overrides, fromPeriod } = {}) {
  const start = Number(fromPeriod);
  if (!Number.isInteger(start) || start < 1) {
    throw new TypeError("reapplyBase requires fromPeriod");
  }
  const next = { ...(lineups || {}) };
  const count = Number(periods) || 4;
  const map = normalizeFormationOverrides(overrides, count);
  for (let q = start; q <= count; q++) {
    if (!next[q] || map[q]) continue;
    next[q] = reshapeLineup(next[q], baseSlots);
  }
  return next;
}

/** Formation buttons. Layout reads these slots; the planner still assigns the players. */
export const FORMATION_TEMPLATES = {
  "4v4": [
    { name:"1-1-1", label:"Balanced",  desc:"One each: defender, mid, forward. Classic simple shape.", slots:["GK","CD","CM","CF"] },
    { name:"2-1",   label:"Defensive", desc:"Two defenders, one forward. Hold and counter.", slots:["GK","LD","RD","CF"] },
    { name:"1-2",   label:"Attacking", desc:"One defender, two forwards. High pressure up top.", slots:["GK","CD","LF","RF"] },
  ],
  "5v5": [
    { name:"2-1-1", label:"Balanced",  desc:"Two defenders, one mid, one forward.", slots:["GK","LD","RD","CM","CF"] },
    { name:"1-2-1", label:"Mid Heavy", desc:"Diamond shape  -  one def, two mids, one fwd.", slots:["GK","CD","LM","RM","CF"] },
    { name:"2-2",   label:"Compact",   desc:"Two lines of two. Hard to break down.", slots:["GK","LD","RD","LF","RF"] },
    { name:"1-1-2", label:"Attacking", desc:"One def, one mid, two fwds. Aggressive.", slots:["GK","CD","CM","LF","RF"] },
  ],
  "6v6": [
    { name:"2-2-1", label:"Balanced",   desc:"Standard shape. Two defenders, two mids, one forward. Best all-around for U8.", slots:["GK","LD","RD","LM","RM","CF"] },
    { name:"2-1-2", label:"Wide Attack", desc:"Two defenders, one holding mid, two forwards. Spread the attack wide.", slots:["GK","LD","RD","CM","LF","RF"] },
    { name:"3-2",   label:"Defensive",  desc:"Three defenders, two forwards. Pack the back, hit on counter.", slots:["GK","LD","CD","RD","LF","RF"] },
    { name:"1-3-1", label:"Mid Control",desc:"One sweeper, three mids, one striker. Dominate the middle.", slots:["GK","CD","LM","CM","RM","CF"] },
    { name:"2-0-3", label:"All Attack", desc:"Two defenders, no mid, three forwards. Full attack  -  risky but fun.", slots:["GK","LD","RD","LF","CF","RF"] },
    { name:"3-1-1", label:"Park Bus",   desc:"Three defenders, one mid, one forward. Ultra defensive.", slots:["GK","LD","CD","RD","CM","CF"] },
  ],
  "7v7": [
    { name:"3-2-1", label:"Classic",    desc:"Three defenders, two mids, one striker. Most common 7v7 shape.", slots:["GK","LD","CD","RD","LM","RM","CF"] },
    { name:"2-3-1", label:"Mid Heavy",  desc:"Two defenders, three mids, one striker. Control the middle.", slots:["GK","LD","RD","LM","CM","RM","CF"] },
    { name:"2-2-2", label:"Balanced",   desc:"Two defenders, two mids, two forwards. Symmetric and flexible.", slots:["GK","LD","RD","LM","RM","LF","RF"] },
    { name:"3-1-2", label:"Counter",    desc:"Three defenders, one mid, two forwards. Fast break style.", slots:["GK","LD","CD","RD","CM","LF","RF"] },
    { name:"2-1-3", label:"Attacking",  desc:"Two defenders, one mid, three forwards. High press, all-out attack.", slots:["GK","LD","RD","CM","LF","CF","RF"] },
    { name:"1-3-2", label:"Overload Mid",desc:"One sweeper, three mids, two forwards. Overwhelm in midfield.", slots:["GK","CD","LM","CM","RM","LF","RF"] },
  ],
  "8v8": [
    { name:"3-3-1", label:"Classic",    desc:"Three defenders, three mids, one striker. Standard 8v8.", slots:["GK","LD","CD","RD","LM","CM","RM","CF"] },
    { name:"3-2-2", label:"Balanced",   desc:"Three defenders, two mids, two forwards. Width in attack.", slots:["GK","LD","CD","RD","LM","RM","LF","RF"] },
    { name:"4-2-1", label:"Defensive",  desc:"Four defenders, two mids, one striker. Protect the back.", slots:["GK","LD","CD","CD","RD","LM","RM","CF"] },
    { name:"2-3-2", label:"Mid Press",  desc:"Two defenders, three mids, two forwards. Press high and wide.", slots:["GK","LD","RD","LM","CM","RM","LF","RF"] },
    { name:"2-2-3", label:"Attacking",  desc:"Two defenders, two mids, three forwards. Commit to attack.", slots:["GK","LD","RD","LM","RM","LF","CF","RF"] },
    { name:"3-1-3", label:"Diamond Fwd",desc:"Three defenders, one holding mid, three forwards.", slots:["GK","LD","CD","RD","CM","LF","CF","RF"] },
  ],
  "9v9": [
    { name:"3-3-2", label:"Classic",     desc:"Three defenders, three mids, two forwards. Most common 9v9 shape.", slots:["GK","LD","CD","RD","LM","CM","RM","LF","RF"] },
    { name:"4-3-1", label:"Defensive",   desc:"Four defenders, three mids, one striker. Solid back four.", slots:["GK","LD","CD","CD","RD","LM","CM","RM","CF"] },
    { name:"3-2-3", label:"Attacking",   desc:"Three defenders, two mids, three forwards. Go for goal.", slots:["GK","LD","CD","RD","LM","RM","LF","CF","RF"] },
    { name:"4-2-2", label:"Wide",        desc:"Four defenders, two central mids, two wide forwards.", slots:["GK","LD","CD","CD","RD","LM","RM","LF","RF"] },
    { name:"3-4-1", label:"Mid Control", desc:"Three defenders, four mids, one striker. Overload midfield.", slots:["GK","LD","CD","RD","LM","CM","CM","RM","CF"] },
    { name:"2-4-2", label:"Total Mid",   desc:"Two defenders, four mids, two forwards. Dominate the middle.", slots:["GK","LD","RD","LM","CM","CM","RM","LF","RF"] },
    { name:"3-1-4", label:"All Out",     desc:"Three defenders, one mid anchor, four forwards. High risk.", slots:["GK","LD","CD","RD","CM","LF","LF","RF","RF"] },
  ],
  "11v11": [
    { name:"4-4-2", label:"Classic Flat",  desc:"The most famous formation. Two banks of four, two strikers. Simple and effective.", slots:["GK","LB","CB","CB","RB","LM","CM","CM","RM","LF","RF"] },
    { name:"4-3-3", label:"Attacking",     desc:"Four defenders, three mids, three forwards. Dominant when midfield wins.", slots:["GK","LB","CB","CB","RB","LM","CM","RM","LF","CF","RF"] },
    { name:"4-2-3-1",label:"Modern",       desc:"Two holding mids protect the back four. Three attacking mids behind one striker.", slots:["GK","LB","CB","CB","RB","CM","CM","LM","CF","RM","RF"] },
    { name:"3-5-2", label:"Wing Backs",    desc:"Three defenders, five mids (with wing backs), two strikers.", slots:["GK","LB","CB","RB","LM","CM","CM","CM","RM","LF","RF"] },
    { name:"5-3-2", label:"Defensive",     desc:"Five defenders (three centre-backs, two wing backs), three mids, two strikers.", slots:["GK","LB","CB","CB","CB","RB","LM","CM","RM","LF","RF"] },
    { name:"4-1-4-1",label:"Holding Mid",  desc:"Single defensive mid in front of back four. Four mids, one striker.", slots:["GK","LB","CB","CB","RB","CM","LM","CM","RM","CF","CF"] },
    { name:"3-4-3", label:"All Attack",    desc:"Three defenders, four mids, three forwards. Maximum offensive output.", slots:["GK","LB","CB","RB","LM","CM","CM","RM","LF","CF","RF"] },
    { name:"4-5-1", label:"Defensive Mid", desc:"Four defenders, five mids, one striker. Control possession and frustrate.", slots:["GK","LB","CB","CB","RB","LM","CM","CM","CM","RM","CF"] },
  ],
};

/** Stay on the current period when the request is outside 1..total. Callers must not touch the clock in that case. */
export function clampPeriod(current, requested, total) {
  const now = Number(current) || 1;
  const last = Number(total) || 1;
  const next = Number(requested);
  if (!Number.isInteger(next) || next < 1 || next > last) return now;
  return next;
}
