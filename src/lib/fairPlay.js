/** Quarter-based fair play helpers. A full quarter is two halves. A mid-quarter split is one. */

import { equityHalves } from "./gameDay.js";

export const TOTAL_PERIODS = 4;

export function minQuarters(minFraction, periods = TOTAL_PERIODS) {
  const frac = Number(minFraction);
  if (!Number.isFinite(frac) || frac <= 0) return 0;
  return Math.ceil(frac * periods);
}

/**
 * Block planning when the roster cannot meet the quarter minimum.
 * demand = active players × min quarters; supply = spots on the field × periods.
 */
export function feasibility({ activeCount, slotsPerPeriod, minQ, periods = TOTAL_PERIODS, subMode = false }) {
  const demand = activeCount * minQ;
  const supply = slotsPerPeriod * periods;
  const halfDemand = activeCount * minQ * 2;
  const halfSupply = supply * 2;
  let reason = "";
  if (activeCount <= 0) {
    reason = "Add at least one active player before planning.";
  } else if (slotsPerPeriod <= 0) {
    reason = "Pick a format so the field has spots to fill.";
  } else if (demand > supply) {
    reason = subMode
      ? `${activeCount} active players × ${minQ * 2} halves = ${halfDemand}, but ${slotsPerPeriod} spots × ${periods * 2} halves = ${halfSupply}. Sit players out or use a larger format. Fair play cannot be guaranteed.`
      : `${activeCount} active players × ${minQ} quarters = ${demand} required appearances, but ${slotsPerPeriod} spots × ${periods} quarters = ${supply}. Sit players out or use a larger format. Fair play cannot be guaranteed.`;
  }
  return {
    ok: reason === "",
    demand,
    supply,
    halfDemand,
    halfSupply,
    activeCount,
    slotsPerPeriod,
    minQ,
    periods,
    subMode: !!subMode,
    reason,
  };
}

export function computePlayTime(players, lineupsByQuarter, totalQuarters = TOTAL_PERIODS) {
  const counts = {};
  (players || []).forEach(p => { counts[p.id] = 0; });
  for (let q = 1; q <= totalQuarters; q++) {
    const lineup = lineupsByQuarter?.[q];
    if (!lineup?.starters) continue;
    lineup.starters.forEach(slot => {
      if (slot?.player) counts[slot.player.id] = (counts[slot.player.id] || 0) + 1;
    });
  }
  return counts;
}

/** Players under the minimum once every period has a lineup. */
export function playersUnderMin(players, lineupsByQuarter, minQ, totalQuarters = TOTAL_PERIODS) {
  if (minQ <= 0) return [];
  const allPlanned = Array.from({ length: totalQuarters }, (_, i) => i + 1)
    .every(q => lineupsByQuarter?.[q]);
  if (!allPlanned) return [];
  const counts = computePlayTime(players, lineupsByQuarter, totalQuarters);
  return (players || []).filter(p =>
    !p.injured && !p.out && !p.midGameInjury && (counts[p.id] || 0) < minQ
  );
}

/**
 * Players who cannot reach minQ even if they play every still-unplanned quarter.
 * Used to warn after a manual sub. Does not block the edit.
 */
export function playersWhoCannotReachMin(players, lineupsByQuarter, minQ, totalQuarters = TOTAL_PERIODS) {
  if (minQ <= 0) return [];
  const counts = computePlayTime(players, lineupsByQuarter, totalQuarters);
  const unplanned = Array.from({ length: totalQuarters }, (_, i) => i + 1)
    .filter(q => !lineupsByQuarter?.[q]).length;
  return (players || []).filter(p =>
    !p.injured && !p.out && !p.midGameInjury && (counts[p.id] || 0) + unplanned < minQ
  );
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Assign the same players onto the existing formation slots. */
export function assignPositions(players, slotPositions) {
  const pool = [...players];
  const chosenPos = {};
  for (const p of pool) {
    const allowed = p.positions && p.positions.length > 0 ? p.positions : ["CM"];
    chosenPos[p.id] = allowed[Math.floor(Math.random() * allowed.length)];
  }
  const shuffled = shuffle(pool);
  const assigned = new Set();
  return slotPositions.map(slotPos => {
    let pick = shuffled.find(p => !assigned.has(p.id) && chosenPos[p.id] === slotPos);
    if (!pick) pick = shuffled.find(p => !assigned.has(p.id) && (p.positions || []).includes(slotPos));
    if (!pick) pick = shuffled.find(p => !assigned.has(p.id));
    if (pick) assigned.add(pick.id);
    return { pos: slotPos, player: pick || null };
  });
}

/** Mode A: same kids on the field, new positions. Other quarters are untouched. */
export function scrambleQuarterPositions(lineup) {
  if (!lineup?.starters?.length) return lineup;
  const slotPositions = lineup.starters.map(s => s.pos);
  const onField = lineup.starters.map(s => s.player).filter(Boolean);
  return {
    starters: assignPositions(onField, slotPositions),
    bench: [...(lineup.bench || [])],
  };
}

function sameIdSet(a, b) {
  if (a.size !== b.size) return false;
  for (const id of a) if (!b.has(id)) return false;
  return true;
}

/**
 * Mode B: redraw who plays ONE quarter. Other quarters stay locked.
 * Refuses when the only legal on-field sets would drop someone under minQ.
 */
export function redrawQuarterMembership(players, lineupsByQuarter, quarter, minQ, totalQuarters = TOTAL_PERIODS, options = {}) {
  const lineup = lineupsByQuarter?.[quarter];
  if (!lineup?.starters?.length) {
    return { ok: false, reason: `Plan Q${quarter} before redrawing it.` };
  }
  const active = (players || []).filter(p => !p.injured && !p.out);
  const otherQuarters = Array.from({ length: totalQuarters }, (_, i) => i + 1).filter(q => q !== quarter);
  const playedHalves = {};
  active.forEach(p => {
    playedHalves[p.id] = equityHalves(p.id, {
      lineups: lineupsByQuarter,
      segments: options.segments,
      credit: options.credit,
      quarters: otherQuarters.filter(q => lineupsByQuarter?.[q]),
    });
  });
  const unplannedOther = otherQuarters.filter(q => !lineupsByQuarter?.[q]).length;
  const minHalves = minQ * 2;
  const mustStart = active.filter(p => (playedHalves[p.id] || 0) + unplannedOther * 2 < minHalves);
  const slots = lineup.starters.map(s => s.pos);
  if (mustStart.length > slots.length) {
    return {
      ok: false,
      reason: `Q${quarter} has ${slots.length} spots, but ${mustStart.length} players must play this quarter to stay at ${minQ} quarters on the field. Plan the full game instead.`,
    };
  }
  const rest = active.filter(p => !mustStart.some(m => m.id === p.id));
  const currentIds = new Set(lineup.starters.map(s => s.player?.id).filter(Boolean));
  const need = Math.max(0, Math.min(slots.length, active.length) - mustStart.length);
  const canChange = rest.length > need;
  let chosen = [...mustStart];
  const attempts = canChange ? 10 : 1;
  for (let attempt = 0; attempt < attempts; attempt++) {
    const fill = shuffle(rest).slice(0, need);
    const group = [...mustStart, ...fill];
    chosen = group;
    const ids = new Set(group.map(p => p.id));
    if (!sameIdSet(ids, currentIds)) break;
  }
  const starterIds = new Set(chosen.map(p => p.id));
  const bench = active.filter(p => !starterIds.has(p.id));
  return {
    ok: true,
    lineup: { starters: assignPositions(chosen, slots), bench },
  };
}
