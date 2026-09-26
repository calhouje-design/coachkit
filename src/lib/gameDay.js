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
