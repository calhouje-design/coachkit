/** Base formation for every period, plus optional per-period overrides. Stored on the game-day JSON. */

function isGk(pos) {
  return String(pos || "").trim().toUpperCase() === "GK";
}

export function normalizeFormationOverrides(value) {
  if (!value || typeof value !== "object") return {};
  const out = {};
  Object.entries(value).forEach(([key, name]) => {
    const period = Number(key);
    if (!Number.isInteger(period) || period < 1 || period > 4) return;
    if (typeof name !== "string" || !name.trim()) return;
    out[period] = name.trim();
  });
  return out;
}

export function formationNameForPeriod(base, overrides, period) {
  const map = normalizeFormationOverrides(overrides);
  return map[period] || base || "";
}

/** A name that matches the base is not an override. Other periods are left alone. */
export function withPeriodOverride(overrides, period, name, base) {
  const map = { ...normalizeFormationOverrides(overrides) };
  const q = Number(period);
  if (!Number.isInteger(q)) return map;
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

/** New base slots land on periods that are not overridden. Overrides stay as they are. */
export function reapplyBase(lineups, { periods = 4, baseSlots, overrides } = {}) {
  const next = { ...(lineups || {}) };
  const map = normalizeFormationOverrides(overrides);
  const count = Number(periods) || 4;
  for (let q = 1; q <= count; q++) {
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
