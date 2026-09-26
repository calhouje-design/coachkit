/** Game Day helpers for Round Two. Quarter fair-play stays the rule; minutes are a live gap on top of it. */

export function effectiveQuarters(playCount, creditedQuarters) {
  const extra = Array.isArray(creditedQuarters) ? creditedQuarters.length : 0;
  return (playCount || 0) + extra;
}

export function addMinutes(bank, playerId, minutes) {
  const add = Math.max(0, Number(minutes) || 0);
  if (!playerId || add === 0) return bank || {};
  return { ...(bank || {}), [playerId]: (bank?.[playerId] || 0) + add };
}

/** Minutes already banked plus the live stint on the clock. */
export function earnedMinutes(playerId, { bank, onField, clockSec, stintStartSec }) {
  const banked = bank?.[playerId] || 0;
  if (!onField) return banked;
  const start = stintStartSec?.[playerId];
  const from = start == null ? clockSec : start;
  return banked + Math.max(0, ((clockSec || 0) - from) / 60);
}

export function minuteGap(earned, targetMinutes) {
  return Math.max(0, (targetMinutes || 0) - (earned || 0));
}

/** Fewest minutes first — the bench player furthest behind the minute target. */
export function rankWhosNext(bench, minutesById) {
  return [...(bench || [])].sort((a, b) => {
    const diff = (minutesById?.[a.id] || 0) - (minutesById?.[b.id] || 0);
    if (diff !== 0) return diff;
    return String(a.name || "").localeCompare(String(b.name || ""));
  });
}

export function addPendingSwap(queue, item, maxPending = 3) {
  const list = Array.isArray(queue) ? queue : [];
  const pending = list.filter(row => row.status === "pending");
  if (pending.length >= maxPending) {
    return { ok: false, reason: `Only ${maxPending} swaps can be queued. Run or cancel one first.`, queue: list };
  }
  if (!item?.outId || !item?.inId) {
    return { ok: false, reason: "Pick who leaves and who comes on.", queue: list };
  }
  if (item.outId === item.inId) {
    return { ok: false, reason: "Pick two different players.", queue: list };
  }
  if (pending.some(row => row.outId === item.outId || row.inId === item.inId || row.outId === item.inId || row.inId === item.outId)) {
    return { ok: false, reason: "That player is already in the queue.", queue: list };
  }
  return {
    ok: true,
    queue: [...list, { ...item, status: "pending" }],
  };
}

/** Remove a single pending swap. Other queued swaps stay. */
export function cancelOneSwap(queue, id) {
  return (queue || []).filter(row => row.id !== id);
}

export function parseDrop(value) {
  if (!value) return null;
  if (value === "bench-zone") return { type: "bench-zone" };
  if (value.startsWith("field:")) {
    const idx = Number(value.slice(6));
    return Number.isInteger(idx) ? { type: "field", idx } : null;
  }
  if (value.startsWith("bench:")) return { type: "bench", playerId: value.slice(6) };
  return null;
}

/**
 * What a completed drag should do.
 * source: { type:'field', idx } | { type:'bench', playerId }
 */
export function resolveDragDrop(source, drop) {
  if (!source || !drop) return { action: "none" };
  if (source.type === "field" && drop.type === "field" && source.idx !== drop.idx) {
    return { action: "swap-field", a: source.idx, b: drop.idx };
  }
  if (source.type === "field" && drop.type === "bench") {
    return { action: "swap-bench", fieldIdx: source.idx, playerId: drop.playerId };
  }
  if (source.type === "bench" && drop.type === "field") {
    return { action: "swap-bench", fieldIdx: drop.idx, playerId: source.playerId };
  }
  if (source.type === "field" && drop.type === "bench-zone") {
    return { action: "bench-zone", fieldIdx: source.idx };
  }
  return { action: "none" };
}

/**
 * Take one player out of a quarter without moving anyone else.
 * If they were on the field, the first bench player who is not already starting fills that spot.
 * Past minutes are not touched here — the caller banks them.
 */
export function pullFromQuarter(lineup, playerId) {
  if (!lineup?.starters) return lineup;
  const wasOn = lineup.starters.some(slot => slot.player?.id === playerId);
  const stayingIds = new Set(
    lineup.starters.map(slot => slot.player?.id).filter(id => id && id !== playerId)
  );
  const bench = (lineup.bench || []).filter(player => player.id !== playerId);
  const sub = wasOn ? (bench.find(player => !stayingIds.has(player.id)) || null) : null;
  const starters = lineup.starters.map(slot => {
    if (slot.player?.id !== playerId) return slot;
    return sub ? { ...slot, player: sub } : { ...slot, player: null };
  });
  return {
    starters,
    bench: bench.filter(player => player.id !== sub?.id),
  };
}

/** Pull a player from this quarter and every later quarter. Earlier quarters stay byte-for-byte. */
export function pullFromPlan(lineups, playerId, fromQuarter, totalQuarters = 4) {
  const next = { ...(lineups || {}) };
  for (let q = fromQuarter; q <= totalQuarters; q++) {
    if (!next[q]) continue;
    next[q] = pullFromQuarter(next[q], playerId);
  }
  return next;
}

export function addLateArrival(lineup, player) {
  if (!lineup || !player) return lineup;
  if ((lineup.starters || []).some(slot => slot.player?.id === player.id)) return lineup;
  if ((lineup.bench || []).some(existing => existing.id === player.id)) return lineup;
  return { ...lineup, bench: [...(lineup.bench || []), player] };
}

/** A quarter counts once if the player is in that lineup or already credited for leaving it. */
export function countedQuarters(lineupQuarters, creditedQuarters) {
  return new Set([...(lineupQuarters || []), ...(creditedQuarters || [])]).size;
}

/**
 * Credit a quarter while the player is off the sheet, and drop that credit
 * once they are in the lineup again so the same quarter is not counted twice.
 */
export function setAppearanceCreditFor(credit, playerId, quarter, countWhileOff) {
  const base = { ...(credit || {}) };
  const list = Array.isArray(base[playerId]) ? [...base[playerId]] : [];
  const has = list.includes(quarter);
  if (countWhileOff && !has) return { ...base, [playerId]: [...list, quarter] };
  if (!countWhileOff && has) {
    const nextList = list.filter(q => q !== quarter);
    if (nextList.length) return { ...base, [playerId]: nextList };
    delete base[playerId];
    return base;
  }
  return credit || {};
}

/** Visual mark only. "entered" came on mid-quarter. "left" started and came off. */
export function noteSubSegment(segments, playerId, quarter, kind) {
  if (!playerId || !quarter || !kind) return segments || {};
  return {
    ...(segments || {}),
    [playerId]: { ...(segments?.[playerId] || {}), [quarter]: kind },
  };
}

export function clearSubSegmentsFrom(segments, fromQuarter) {
  const next = {};
  Object.entries(segments || {}).forEach(([playerId, row]) => {
    const kept = {};
    Object.entries(row || {}).forEach(([quarter, kind]) => {
      if (Number(quarter) < fromQuarter) kept[quarter] = kind;
    });
    if (Object.keys(kept).length) next[playerId] = kept;
  });
  return next;
}

/**
 * Chart cell. Fair-play still counts the quarter; this only separates a full
 * stint from a mid-quarter sub.
 */
export function playCellKind({ onField, segment }) {
  if (onField && (segment === "entered" || segment === "left")) return "partial-on";
  if (onField) return "full";
  if (segment === "left" || segment === "entered") return "partial-off";
  return "bench";
}

function byMinutesThenName(minutesById, direction) {
  return (a, b) => {
    const diff = ((minutesById?.[a.id] || 0) - (minutesById?.[b.id] || 0)) * direction;
    if (diff !== 0) return diff;
    return String(a.name || "").localeCompare(String(b.name || ""));
  };
}

/**
 * Pair every current bench player with the field player they replace.
 * Prefer the next quarter's plan. Anyone the plan does not cover still comes
 * on, for the field player with the most minutes. Does not change the lineup.
 */
export function planBenchRotation(lineup, { minutesById = {}, nextLineup = null } = {}) {
  const bench = [...(lineup?.bench || [])].filter(Boolean);
  const field = (lineup?.starters || [])
    .map(slot => slot?.player)
    .filter(Boolean);
  if (!bench.length || !field.length) return [];

  const nextOn = new Set((nextLineup?.starters || []).map(slot => slot.player?.id).filter(Boolean));
  const nextBench = new Set((nextLineup?.bench || []).map(player => player.id));
  const pairs = [];
  const usedIn = new Set();
  const usedOut = new Set();

  if (nextOn.size) {
    const plannedIn = bench.filter(player => nextOn.has(player.id)).sort(byMinutesThenName(minutesById, 1));
    const plannedOut = field.filter(player => nextBench.has(player.id)).sort(byMinutesThenName(minutesById, -1));
    const count = Math.min(plannedIn.length, plannedOut.length);
    for (let i = 0; i < count; i++) {
      pairs.push({ inId: plannedIn[i].id, outId: plannedOut[i].id, fromPlan: true });
      usedIn.add(plannedIn[i].id);
      usedOut.add(plannedOut[i].id);
    }
  }

  const restIn = bench.filter(player => !usedIn.has(player.id)).sort(byMinutesThenName(minutesById, 1));
  const restOut = field.filter(player => !usedOut.has(player.id)).sort(byMinutesThenName(minutesById, -1));
  const count = Math.min(restIn.length, restOut.length);
  for (let i = 0; i < count; i++) {
    pairs.push({ inId: restIn[i].id, outId: restOut[i].id, fromPlan: false });
  }
  return pairs;
}

/** Apply planned pairs on this quarter only. Slot positions stay put. */
export function applyBenchRotation(lineup, pairs) {
  if (!lineup?.starters) return lineup;
  let starters = lineup.starters.map(slot => ({ ...slot }));
  let bench = [...(lineup.bench || [])];
  (pairs || []).forEach(pair => {
    const idx = starters.findIndex(slot => slot.player?.id === pair.outId);
    const bIdx = bench.findIndex(player => player.id === pair.inId);
    if (idx < 0 || bIdx < 0) return;
    const outgoing = starters[idx].player;
    const incoming = bench[bIdx];
    starters = starters.map((slot, i) => (i === idx ? { ...slot, player: incoming } : slot));
    bench = bench.map((player, i) => (i === bIdx ? outgoing : player));
  });
  return { starters, bench };
}
