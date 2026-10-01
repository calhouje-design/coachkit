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

/** Stay on the current period when the request is outside 1..total. Callers must not touch the clock in that case. */
export function clampPeriod(current, requested, total) {
  const now = Number(current) || 1;
  const last = Number(total) || 1;
  const next = Number(requested);
  if (!Number.isInteger(next) || next < 1 || next > last) return now;
  return next;
}
