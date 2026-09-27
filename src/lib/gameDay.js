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
  const q = Number(quarter);
  if (!playerId || !q || !kind) return segments || {};
  return {
    ...(segments || {}),
    [playerId]: { ...(segments?.[playerId] || {}), [q]: kind },
  };
}

/** Read a quarter mark after JSON storage, where keys come back as strings. */
export function segmentAt(segments, playerId, quarter) {
  const row = segments?.[playerId];
  if (!row) return null;
  const q = Number(quarter);
  return row[q] || row[String(q)] || null;
}

/** Record who left and who entered for this quarter. Q2–Q4 use the same marks as Q1. */
export function markQuarterSub(segments, quarter, outId, inId) {
  let next = segments || {};
  if (outId) next = noteSubSegment(next, outId, quarter, "left");
  if (inId) next = noteSubSegment(next, inId, quarter, "entered");
  return next;
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
 * Chart cell. A full quarter is two halves. A mid-quarter sub is one half.
 */
export function playCellKind({ onField, segment }) {
  if (onField && (segment === "entered" || segment === "left")) return "partial-on";
  if (onField) return "full";
  if (segment === "left" || segment === "entered") return "partial-off";
  return "bench";
}

/** Halves in one chart cell. Credit without a split still counts the whole quarter. */
export function cellHalves({ onField, segment, credited = false } = {}) {
  const kind = playCellKind({ onField: !!onField, segment: segment || null });
  if (kind === "full") return 2;
  if (kind === "partial-on" || kind === "partial-off") return 1;
  if (credited) return 2;
  return 0;
}

/**
 * Sum of half-quarters. 50% of 4 quarters is 4 halves.
 * A split does not also add the appearance credit for that same quarter.
 */
export function equityHalves(playerId, { lineups, segments, credit, quarters = [1, 2, 3, 4] } = {}) {
  const credited = new Set((credit?.[playerId] || []).map(q => Number(q)));
  let sum = 0;
  quarters.forEach(q => {
    const lineup = lineups?.[q] || lineups?.[String(q)];
    if (!lineup) return;
    const on = (lineup.starters || []).some(slot => slot.player?.id === playerId);
    sum += cellHalves({
      onField: on,
      segment: segmentAt(segments, playerId, q),
      credited: credited.has(Number(q)),
    });
  });
  return sum;
}

/** 0, ½, 1, 1½, 2… so the label matches the green and split boxes. */
export function formatQuarterEquity(halves) {
  const n = Math.max(0, Math.round(Number(halves) || 0));
  const whole = Math.floor(n / 2);
  const half = n % 2 === 1;
  if (half && whole === 0) return "½";
  if (half) return `${whole}½`;
  return String(whole);
}

/** Point on the circle closest to (x1, y1), so a connector stops on the rim. */
export function lineStopAtCircle(x1, y1, cx, cy, radius) {
  const dx = x1 - cx;
  const dy = y1 - cy;
  const len = Math.hypot(dx, dy);
  const r = Math.max(0, Number(radius) || 0);
  if (len < 0.001) return { x: cx, y: cy };
  return { x: cx + (dx / len) * r, y: cy + (dy / len) * r };
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

/** Point one bench player at a field player. Drops any line that used either player. */
export function retargetPair(manualPairs, benchId, fieldPlayerId) {
  const kept = (manualPairs || []).filter(pair => pair.inId !== benchId && pair.outId !== fieldPlayerId);
  if (!benchId || !fieldPlayerId || benchId === fieldPlayerId) return kept;
  return [...kept, { inId: benchId, outId: fieldPlayerId, fromPlan: false }];
}

/**
 * Manual lines win. Automatic pairs fill the bench players who are still free,
 * as long as that field player is not already taken.
 */
export function pairsForDisplay(autoPairs, manualPairs, lineup) {
  const benchIds = new Set((lineup?.bench || []).map(player => player?.id).filter(Boolean));
  const fieldIds = new Set((lineup?.starters || []).map(slot => slot?.player?.id).filter(Boolean));
  const manual = (manualPairs || []).filter(pair => benchIds.has(pair.inId) && fieldIds.has(pair.outId));
  const usedIn = new Set(manual.map(pair => pair.inId));
  const usedOut = new Set(manual.map(pair => pair.outId));
  const auto = (autoPairs || []).filter(pair =>
    benchIds.has(pair.inId) && fieldIds.has(pair.outId) && !usedIn.has(pair.inId) && !usedOut.has(pair.outId)
  );
  auto.forEach(pair => {
    usedIn.add(pair.inId);
    usedOut.add(pair.outId);
  });
  const extra = [];
  const openBench = (lineup?.bench || []).map(player => player?.id).filter(id => id && !usedIn.has(id));
  const openField = (lineup?.starters || []).map(slot => slot?.player?.id).filter(id => id && !usedOut.has(id));
  const count = Math.min(openBench.length, openField.length);
  for (let i = 0; i < count; i++) {
    extra.push({ inId: openBench[i], outId: openField[i], fromPlan: false });
  }
  return [...manual, ...auto, ...extra];
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
