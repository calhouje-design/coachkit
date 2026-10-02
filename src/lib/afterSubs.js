/** Start / After subs. Position drags never change who is on, and never flag a real event. */

import { applyBenchRotation, fieldMarker, isGkPosition, placeTwoWideMarkers } from "./gameDay.js";

export function formationKey(lineup) {
  return (lineup?.starters || []).map(slot => slot?.pos || "").join("|");
}

/** Stable identity of this period's start lineup plus the pairs that will come on. */
export function afterSubsBasis(lineup, pairs) {
  const start = (lineup?.starters || []).map(slot => `${slot?.pos || ""}:${slot?.player?.id || ""}`).join(",");
  const bench = (lineup?.bench || []).map(player => player?.id || "").join(",");
  const pairKey = (pairs || []).map(pair => `${pair?.inId || ""}>${pair?.outId || ""}`).join("|");
  return `${start}#${bench}#${pairKey}`;
}

export function onFieldIds(lineup) {
  return (lineup?.starters || []).map(slot => slot?.player?.id || null);
}

function slotValue(slots, idx) {
  if (!slots) return null;
  if (slots[idx] != null && slots[idx] !== "") return String(slots[idx]);
  const key = String(idx);
  if (slots[key] != null && slots[key] !== "") return String(slots[key]);
  return null;
}

export function slotMapOf(lineup) {
  const slots = {};
  (lineup?.starters || []).forEach((slot, idx) => {
    if (slot?.player?.id) slots[String(idx)] = String(slot.player.id);
  });
  return slots;
}

function sameSlots(a, b) {
  const keys = new Set([...Object.keys(a || {}), ...Object.keys(b || {})]);
  for (const key of keys) {
    if (String(a?.[key] || "") !== String(b?.[key] || "")) return false;
  }
  return true;
}

function playerPool(lineup) {
  const pool = new Map();
  (lineup?.starters || []).forEach(slot => {
    if (slot?.player?.id) pool.set(String(slot.player.id), slot.player);
  });
  (lineup?.bench || []).forEach(player => {
    if (player?.id && !pool.has(String(player.id))) pool.set(String(player.id), player);
  });
  return pool;
}

/**
 * Lay a stored slot map onto the derived after-subs field.
 * Players still on in the 2nd half keep their chosen slot.
 * New arrivals take their derived (replaced player's) slot when it is free.
 * The goalkeeper slot always stays the derived keeper.
 */
export function projectAfterSubs(derived, slotMap) {
  if (!derived?.starters) return derived;
  const pool = playerPool(derived);
  const gkIdx = derived.starters.findIndex(slot => isGkPosition(slot?.pos));
  const derivedIds = new Set(derived.starters.map(slot => slot?.player?.id).filter(Boolean).map(String));
  const used = new Set();
  const starters = derived.starters.map(slot => ({ ...slot, player: null }));
  if (gkIdx >= 0 && derived.starters[gkIdx]?.player) {
    starters[gkIdx] = { ...starters[gkIdx], player: derived.starters[gkIdx].player };
    used.add(String(derived.starters[gkIdx].player.id));
  }
  derived.starters.forEach((slot, idx) => {
    if (idx === gkIdx || starters[idx].player) return;
    const id = slotValue(slotMap, idx);
    if (!id || used.has(id) || !derivedIds.has(id)) return;
    const player = pool.get(id);
    if (!player) return;
    starters[idx] = { ...starters[idx], player };
    used.add(id);
  });
  derived.starters.forEach((slot, idx) => {
    if (starters[idx].player || idx === gkIdx) return;
    const player = slot?.player;
    if (!player?.id || used.has(String(player.id))) return;
    starters[idx] = { ...starters[idx], player };
    used.add(String(player.id));
  });
  const leftovers = derived.starters.map(slot => slot?.player).filter(player => player?.id && !used.has(String(player.id)));
  starters.forEach((slot, idx) => {
    if (slot.player || idx === gkIdx) return;
    const next = leftovers.shift();
    if (!next) return;
    starters[idx] = { ...slot, player: next };
    used.add(String(next.id));
  });
  const on = new Set(starters.map(slot => slot.player?.id).filter(Boolean).map(String));
  const bench = [];
  const seen = new Set();
  const push = (player) => {
    if (!player?.id || on.has(String(player.id)) || seen.has(String(player.id))) return;
    seen.add(String(player.id));
    bench.push(player);
  };
  (derived.bench || []).forEach(push);
  (derived.starters || []).forEach(slot => push(slot?.player));
  return { starters, bench };
}

export function viewAfterSubs(start, pairs, override) {
  const derived = applyBenchRotation(start, pairs);
  const basis = afterSubsBasis(start, pairs);
  const formation = formationKey(start);
  if (!override?.slots || !Object.keys(override.slots).length) {
    return { lineup: derived, basis, formation, overridden: false, reset: false };
  }
  if ((override.formation || "") !== formation) {
    return { lineup: derived, basis, formation, overridden: false, reset: true };
  }
  return {
    lineup: projectAfterSubs(derived, override.slots),
    basis,
    formation,
    overridden: true,
    reset: false,
  };
}

/** Keep a stored override in sync with the current start lineup and pairs. Null means discard it. */
export function reconcileStored(stored, start, pairs) {
  if (!stored?.slots || !Object.keys(stored.slots).length) return stored || null;
  const formation = formationKey(start || {});
  if ((stored.formation || "") !== formation) return null;
  const view = viewAfterSubs(start, pairs, stored);
  const slots = slotMapOf(view.lineup);
  if (stored.basis === view.basis && sameSlots(stored.slots, slots)) return stored;
  return { slots, basis: view.basis, formation };
}

export function reconcileAfterSubsMap(stored, quarters, getPeriod) {
  const base = stored && typeof stored === "object" ? stored : {};
  let changed = false;
  let reset = false;
  const next = { ...base };
  (quarters || []).forEach(quarter => {
    const key = String(quarter);
    const entry = next[key] || next[quarter];
    if (!entry) return;
    const period = typeof getPeriod === "function" ? getPeriod(quarter) : null;
    if (!period?.lineup?.starters) {
      delete next[key];
      delete next[quarter];
      changed = true;
      return;
    }
    const result = reconcileStored(entry, period.lineup, period.pairs || []);
    if (result === entry && next[key] === entry && next[quarter] == null) return;
    changed = true;
    delete next[quarter];
    if (!result) {
      delete next[key];
      if (entry.formation && entry.formation !== formationKey(period.lineup)) reset = true;
    } else {
      next[key] = result;
    }
  });
  return { next: changed ? next : stored, reset };
}

function swapFieldPlayers(lineup, a, b) {
  const starters = (lineup?.starters || []).map(slot => ({ ...slot }));
  const playerA = starters[a]?.player || null;
  starters[a] = { ...starters[a], player: starters[b]?.player || null };
  starters[b] = { ...starters[b], player: playerA };
  return { starters, bench: [...(lineup?.bench || [])] };
}

/**
 * A drag or tap-tap in After subs. Stores the full slot map.
 * Does not change the start lineup and does not record a real event.
 */
export function afterSubsDrag(start, pairs, override, a, b) {
  const view = viewAfterSubs(start, pairs, override);
  const lineup = view.lineup;
  const starters = lineup?.starters || [];
  const refused = !starters[a] || !starters[b] || a === b
    || isGkPosition(starters[a]?.pos) || isGkPosition(starters[b]?.pos);
  if (refused) {
    return { ok: false, reason: "gk", override: override || null, lineup, realEvent: false };
  }
  const swapped = swapFieldPlayers(lineup, a, b);
  return {
    ok: true,
    reason: "",
    override: { slots: slotMapOf(swapped), basis: view.basis, formation: view.formation },
    lineup: swapped,
    realEvent: false,
  };
}

/** What a position drag should change. realEvent is always false. */
export function applyPhaseDrag({ phase = "start", ran = false, start, pairs, override, a, b } = {}) {
  if (phase === "start" && ran) return { type: "readonly", realEvent: false, override: override || null };
  if (phase === "after" && !ran) {
    const dragged = afterSubsDrag(start, pairs, override, a, b);
    return { type: "override", ...dragged };
  }
  if (phase === "after" && ran) return { type: "live-positions", a, b, realEvent: false, override: null };
  return { type: "start-positions", a, b, realEvent: false, override: override || null };
}

export function snapshotFromLineup(lineup, pairs) {
  return {
    starters: (lineup?.starters || []).map(slot => ({
      pos: slot?.pos || "",
      playerId: slot?.player?.id ? String(slot.player.id) : "",
      name: slot?.player?.name || "",
      number: slot?.player?.number == null ? "" : String(slot.player.number),
    })),
    bench: (lineup?.bench || []).filter(Boolean).map(player => ({
      id: String(player.id),
      name: player.name || "",
      number: player.number == null ? "" : String(player.number),
    })),
    pairs: (pairs || []).filter(pair => pair?.inId && pair?.outId).map(pair => ({
      inId: String(pair.inId),
      outId: String(pair.outId),
    })),
  };
}

export function lineupFromSnapshot(snapshot, roster = []) {
  const byId = new Map((roster || []).filter(player => player?.id).map(player => [String(player.id), player]));
  const playerFor = (id, name, number) => {
    if (!id) return null;
    return byId.get(String(id)) || { id: String(id), name: name || "", number: number || "" };
  };
  return {
    starters: (snapshot?.starters || []).map(slot => ({
      pos: slot?.pos || "",
      player: playerFor(slot?.playerId, slot?.name, slot?.number),
    })),
    bench: (snapshot?.bench || []).map(item => playerFor(item?.id || item?.playerId, item?.name, item?.number)).filter(Boolean),
  };
}

/** SUB/RUN applies the After subs field as shown and keeps the start lineup for reference. */
export function runAfterSubs({ start, pairs, override } = {}) {
  const view = viewAfterSubs(start, pairs, override);
  return {
    lineup: view.lineup,
    snapshot: snapshotFromLineup(start, pairs),
    clearOverride: true,
    realEventFromDrag: false,
  };
}

export function clearOverride(stored, quarter) {
  const next = { ...(stored || {}) };
  delete next[quarter];
  delete next[String(quarter)];
  return next;
}

/**
 * Non-live Replan drops overrides from this period on.
 * Live Replan reconciles this period and drops later ones.
 */
export function replanPhaseState(stored, {
  fromQuarter = 1,
  live = false,
  total = 4,
  lineups = {},
  pairsByQuarter = {},
} = {}) {
  const next = { ...(stored || {}) };
  let reset = false;
  const start = Math.max(1, Number(fromQuarter) || 1);
  const end = Math.max(start, Number(total) || start);
  for (let quarter = start; quarter <= end; quarter += 1) {
    const key = String(quarter);
    const entry = next[key] || next[quarter];
    delete next[quarter];
    delete next[key];
    if (quarter === start && live && entry) {
      const lineup = lineups[quarter] || lineups[key];
      if (!lineup?.starters) continue;
      const result = reconcileStored(entry, lineup, pairsByQuarter[quarter] || pairsByQuarter[key] || []);
      if (result) next[key] = result;
      else if (entry.formation && entry.formation !== formationKey(lineup)) reset = true;
    }
  }
  return { afterSubs: next, reset };
}

export function clearSnapshotsFrom(stored, fromQuarter, total = 4) {
  const next = { ...(stored || {}) };
  let changed = false;
  const start = Math.max(1, Number(fromQuarter) || 1);
  const end = Math.max(start, Number(total) || start);
  for (let quarter = start; quarter <= end; quarter += 1) {
    if (next[quarter] || next[String(quarter)]) {
      delete next[quarter];
      delete next[String(quarter)];
      changed = true;
    }
  }
  return changed ? next : (stored || {});
}

export function phaseControlVisible({ subMode = true, pairs = [], bench = [], snapshot = null } = {}) {
  if (!subMode) return false;
  if (snapshot) return true;
  if (!bench?.length) return false;
  if (!pairs?.length) return false;
  return true;
}

export function normalizeAfterSubs(value) {
  const next = {};
  if (!value || typeof value !== "object" || Array.isArray(value)) return next;
  Object.entries(value).forEach(([quarter, entry]) => {
    const q = Number(quarter);
    if (!Number.isInteger(q) || q <= 0 || !entry || typeof entry !== "object") return;
    const slots = {};
    const src = entry.slots && typeof entry.slots === "object" ? entry.slots : {};
    Object.entries(src).forEach(([idx, id]) => {
      const i = Number(idx);
      if (!Number.isInteger(i) || i < 0 || !id) return;
      slots[String(i)] = String(id);
    });
    if (!Object.keys(slots).length) return;
    next[String(q)] = {
      slots,
      basis: entry.basis == null ? "" : String(entry.basis),
      formation: entry.formation == null ? "" : String(entry.formation),
    };
  });
  return next;
}

function snapshotPlayer(id, name, number) {
  return {
    id: id ? String(id) : "",
    name: name == null ? "" : String(name),
    number: number == null ? "" : String(number),
  };
}

export function normalizeStartSnapshots(value) {
  const next = {};
  if (!value || typeof value !== "object" || Array.isArray(value)) return next;
  Object.entries(value).forEach(([quarter, entry]) => {
    const q = Number(quarter);
    if (!Number.isInteger(q) || q <= 0 || !entry || typeof entry !== "object") return;
    const starters = (Array.isArray(entry.starters) ? entry.starters : []).map(slot => ({
      pos: slot?.pos == null ? "" : String(slot.pos),
      playerId: slot?.playerId ? String(slot.playerId) : "",
      name: slot?.name == null ? "" : String(slot.name),
      number: slot?.number == null ? "" : String(slot.number),
    })).filter(slot => slot.pos || slot.playerId);
    if (!starters.length) return;
    next[String(q)] = {
      starters,
      bench: (Array.isArray(entry.bench) ? entry.bench : []).map(item => snapshotPlayer(item?.id || item?.playerId, item?.name, item?.number)).filter(item => item.id),
      pairs: (Array.isArray(entry.pairs) ? entry.pairs : []).map(pair => ({
        inId: pair?.inId ? String(pair.inId) : "",
        outId: pair?.outId ? String(pair.outId) : "",
      })).filter(pair => pair.inId && pair.outId),
    };
  });
  return next;
}

function placedStarters(lineup, quarter, periodAbbrev) {
  const counts = {};
  (lineup?.starters || []).forEach(slot => {
    counts[slot.pos] = (counts[slot.pos] || 0) + 1;
  });
  const seen = {};
  const starters = (lineup?.starters || []).map((slot, idx) => {
    const pos = slot.pos;
    const indexAmongSame = seen[pos] || 0;
    seen[pos] = indexAmongSame + 1;
    const point = fieldMarker(pos, indexAmongSame, counts[pos] || 1);
    return {
      idx,
      pos: pos || "",
      id: slot.player?.id || null,
      name: slot.player?.name || "",
      number: slot.player?.number || "",
      x: Math.round(point.x * 10) / 10,
      y: Math.round(point.y * 10) / 10,
    };
  });
  const bench = (lineup?.bench || []).filter(Boolean).map(player => ({
    id: player.id,
    name: player.name || "",
    number: player.number || "",
  }));
  return { quarter, label: `${periodAbbrev}${quarter}`, starters: placeTwoWideMarkers(starters), bench, pairs: [] };
}

/** Share/print: each sub-mode period with pairs (or a saved start) carries an After subs field. */
export function decorateShareSheet(sheet, {
  lineups,
  afterSubs = {},
  snapshots = {},
  subMode = true,
  periodAbbrev = "Q",
  roster = [],
} = {}) {
  if (!sheet?.quarters) return sheet;
  const quarters = sheet.quarters.map(panel => {
    if (!subMode) return { ...panel, after: null };
    const q = panel.quarter;
    const snapshot = snapshots?.[q] || snapshots?.[String(q)] || null;
    const override = afterSubs?.[q] || afterSubs?.[String(q)] || null;
    const lineup = lineups?.[q] || lineups?.[String(q)] || null;
    if (snapshot?.starters?.length) {
      const startLineup = lineupFromSnapshot(snapshot, roster);
      const start = placedStarters(startLineup, q, periodAbbrev);
      start.pairs = (snapshot.pairs || []).map(pair => ({ inId: pair.inId, outId: pair.outId }));
      start.label = panel.label;
      return { ...start, after: { ...panel, pairs: [] } };
    }
    if (!panel.pairs?.length || !lineup) return { ...panel, after: null };
    const view = viewAfterSubs(lineup, panel.pairs, override);
    const after = placedStarters(view.lineup, q, periodAbbrev);
    after.label = panel.label;
    return { ...panel, after };
  });
  return { ...sheet, quarters };
}
