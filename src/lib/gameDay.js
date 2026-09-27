/** Game Day helpers for Round Two. Quarter fair-play stays the rule; minutes are a live gap on top of it. */

/** The goalkeeper plays the whole quarter. See HARD_RULES.md. */
export const GK_FULL_QUARTER_REASON = "The goalkeeper plays the whole quarter. Change goalkeepers between quarters.";

export function isGkPosition(pos) {
  return String(pos || "").trim().toUpperCase() === "GK";
}

export function goalkeeperId(lineup) {
  const slot = (lineup?.starters || []).find(item => isGkPosition(item?.pos) && item?.player?.id);
  return slot?.player?.id || null;
}

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

/** Same pitch spots as the Game Day field. Percentages of the 320×480 view. */
export const FIELD_BASE = {
  GK: { x: 50, y: 88 },
  CB: { x: 50, y: 72 }, CD: { x: 50, y: 72 }, LD: { x: 25, y: 72 }, RD: { x: 75, y: 72 },
  LB: { x: 22, y: 75 }, RB: { x: 78, y: 75 },
  DEF: { x: 50, y: 72 },
  CDM: { x: 50, y: 58 }, CM: { x: 50, y: 50 }, LM: { x: 22, y: 50 }, RM: { x: 78, y: 50 },
  MID: { x: 50, y: 50 }, CAM: { x: 50, y: 38 },
  LW: { x: 18, y: 32 }, RW: { x: 82, y: 32 },
  LF: { x: 28, y: 22 }, RF: { x: 72, y: 22 }, CF: { x: 50, y: 18 },
  FWD: { x: 50, y: 22 }, ST: { x: 50, y: 18 }, Wing: { x: 20, y: 30 },
};

/** Marker center inside the 320×480 field, including the side-step when a position repeats. */
export function fieldMarker(pos, indexAmongSame = 0, totalSame = 1) {
  const base = FIELD_BASE[pos] || { x: 50, y: 50 };
  const total = totalSame || 1;
  const spread = total > 1 ? (indexAmongSame - (total - 1) / 2) * (52 / total) : 0;
  const fx = base.x + spread * 0.7;
  return {
    x: 5 + (fx / 100) * 310,
    y: 5 + (base.y / 100) * 470,
  };
}

/**
 * Sheet 1. Four quarters, each with the pitch markers, the bench, and the
 * dotted sub pairs. Full-quarter mode stores the bench and leaves pairs empty.
 */
export function shareFieldSheet({ lineups, pairPlan, subMode = true, quarters = [1, 2, 3, 4] } = {}) {
  const panels = quarters.map(q => {
    const lineup = lineups?.[q] || lineups?.[String(q)] || null;
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
    let pairs = [];
    if (subMode && lineup) {
      const next = lineups?.[q + 1] || lineups?.[String(q + 1)] || null;
      const auto = planBenchRotation(lineup, { minutesById: {}, nextLineup: next });
      const manual = pairPlan?.[q] || pairPlan?.[String(q)] || [];
      pairs = pairsForDisplay(auto, manual, lineup).map(pair => ({
        inId: pair.inId,
        outId: pair.outId,
      }));
    }
    return { quarter: q, starters, bench, pairs };
  });
  return { subMode: !!subMode, quarters: panels };
}

/**
 * Sheet 2. One row per active player, with the same full / split / bench cells
 * as the Play Time chart.
 */
export function sharePlayTimeSheet({ players, lineups, segments, credit, minQ = 2 } = {}) {
  const minHalves = (Number(minQ) || 0) * 2;
  const rows = (players || [])
    .filter(player => player && !player.injured && !player.out)
    .slice()
    .sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")))
    .map(player => {
      const cells = [1, 2, 3, 4].map(q => {
        const lineup = lineups?.[q] || lineups?.[String(q)];
        if (!lineup) return { quarter: q, kind: "unplanned", pos: "" };
        const on = (lineup.starters || []).some(slot => slot.player?.id === player.id);
        const slot = (lineup.starters || []).find(item => item.player?.id === player.id);
        return {
          quarter: q,
          kind: playCellKind({ onField: on, segment: segmentAt(segments, player.id, q) }),
          pos: slot?.pos || "",
        };
      });
      const halves = equityHalves(player.id, { lineups, segments, credit, quarters: [1, 2, 3, 4] });
      return {
        id: player.id,
        name: player.name || "",
        number: player.number || "",
        cells,
        halves,
        label: `${formatQuarterEquity(halves)}/${minQ}Q`,
        ratio: minHalves > 0 ? Math.min(1, halves / minHalves) : 1,
        met: minHalves <= 0 || halves >= minHalves,
      };
    });
  return { minQ, minHalves, rows };
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
  const gkId = goalkeeperId(lineup);
  const field = (lineup?.starters || [])
    .filter(slot => !isGkPosition(slot?.pos))
    .map(slot => slot?.player)
    .filter(player => player && player.id !== gkId);
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

/** Point one bench player at a field player. Drops any line that used either player. Never the goalkeeper. */
export function retargetPair(manualPairs, benchId, fieldPlayerId, lineup) {
  const kept = (manualPairs || []).filter(pair => pair.inId !== benchId && pair.outId !== fieldPlayerId && pair.outId !== goalkeeperId(lineup));
  if (!benchId || !fieldPlayerId || benchId === fieldPlayerId) return kept;
  if (lineup && fieldPlayerId === goalkeeperId(lineup)) return kept;
  return [...kept, { inId: benchId, outId: fieldPlayerId, fromPlan: false }];
}

/**
 * Manual lines win. Automatic pairs fill the bench players who are still free,
 * as long as that field player is not already taken.
 */
export function pairsForDisplay(autoPairs, manualPairs, lineup) {
  const gkId = goalkeeperId(lineup);
  const benchIds = new Set((lineup?.bench || []).map(player => player?.id).filter(Boolean));
  const fieldIds = new Set(
    (lineup?.starters || [])
      .filter(slot => !isGkPosition(slot?.pos) && slot?.player?.id !== gkId)
      .map(slot => slot?.player?.id)
      .filter(Boolean)
  );
  const manual = (manualPairs || []).filter(pair => benchIds.has(pair.inId) && fieldIds.has(pair.outId) && pair.outId !== gkId);
  const usedIn = new Set(manual.map(pair => pair.inId));
  const usedOut = new Set(manual.map(pair => pair.outId));
  const auto = (autoPairs || []).filter(pair =>
    benchIds.has(pair.inId) && fieldIds.has(pair.outId) && pair.outId !== gkId && !usedIn.has(pair.inId) && !usedOut.has(pair.outId)
  );
  auto.forEach(pair => {
    usedIn.add(pair.inId);
    usedOut.add(pair.outId);
  });
  const extra = [];
  const openBench = (lineup?.bench || []).map(player => player?.id).filter(id => id && !usedIn.has(id));
  const openField = (lineup?.starters || [])
    .filter(slot => !isGkPosition(slot?.pos))
    .map(slot => slot?.player?.id)
    .filter(id => id && id !== gkId && !usedOut.has(id));
  const count = Math.min(openBench.length, openField.length);
  for (let i = 0; i < count; i++) {
    extra.push({ inId: openBench[i], outId: openField[i], fromPlan: false });
  }
  return [...manual, ...auto, ...extra];
}

/** Which halves of a quarter a player is on. End-of-quarter lineup plus the split mark. */
export function playerHalfMask(playerId, lineup, segment) {
  if (!lineup) return [false, false];
  const on = (lineup.starters || []).some(slot => slot.player?.id === playerId);
  if (on && segment === "entered") return [false, true];
  if (!on && segment === "left") return [true, false];
  if (!on && segment === "entered") return [false, true];
  if (on) return [true, true];
  return [false, false];
}

/** Longest run of halves spent on the bench, in quarter order. */
export function maxConsecutiveSits(masks) {
  let max = 0;
  let run = 0;
  (masks || []).forEach(on => {
    if (on) run = 0;
    else {
      run += 1;
      if (run > max) max = run;
    }
  });
  return max;
}

function assignHalfSlots(startersPool, slotNames, lockedGk = []) {
  const assigned = new Set(lockedGk.filter(Boolean).map(player => player.id));
  const pool = [...startersPool];
  let gkCursor = 0;
  return slotNames.map(slotPos => {
    if (isGkPosition(slotPos) && lockedGk[gkCursor]) {
      const player = lockedGk[gkCursor];
      gkCursor += 1;
      return { pos: slotPos, player };
    }
    let pick = pool.find(p => !assigned.has(p.id) && (p.positions || []).includes(slotPos));
    if (!pick) pick = pool.find(p => !assigned.has(p.id));
    if (pick) assigned.add(pick.id);
    return { pos: slotPos, player: pick || null };
  });
}

function pickQuarterGoalkeepers(active, slotNames, remaining, satLast) {
  const count = slotNames.filter(isGkPosition).length;
  if (!count) return [];
  const listed = active.filter(player => (player.positions || []).some(isGkPosition));
  const pool = listed.length ? listed : active;
  const rank = (a, b) => {
    const aSat = satLast.has(a.id) ? 1 : 0;
    const bSat = satLast.has(b.id) ? 1 : 0;
    if (aSat !== bSat) return bSat - aSat;
    return (remaining[b.id] || 0) - (remaining[a.id] || 0) || String(a.id).localeCompare(String(b.id));
  };
  return [...pool].sort(rank).slice(0, count);
}

/**
 * Sub-mode plan. Each quarter is two halves. Players who sat the previous half
 * come on next when they still owe time, so two bench halves in a row are
 * avoided when the bench fits back on the field. Everyone still targets minHalves
 * (4 of 8 at 50%). The stored lineup is who is on at the end of the quarter.
 */
export function scheduleHalfRotation(players, slots, {
  minHalves = 4,
  fromQuarter = 1,
  lockedLineups = {},
  lockedSegments = {},
  totalQuarters = 4,
  rate = () => 0,
} = {}) {
  const slotNames = slots?.length ? slots : ["GK", "LD", "RD", "LM", "RM", "CF"];
  const active = (players || []).filter(p => !p.injured && !p.out);
  const remainingQs = [];
  for (let q = fromQuarter; q <= totalQuarters; q++) remainingQs.push(q);
  const halfCap = remainingQs.length * 2;
  const totalHalfSlots = slotNames.length * halfCap;
  const lockedQs = [];
  for (let q = 1; q < fromQuarter; q++) if (lockedLineups[q]) lockedQs.push(q);

  const already = {};
  active.forEach(p => {
    already[p.id] = equityHalves(p.id, {
      lineups: lockedLineups,
      segments: lockedSegments,
      credit: {},
      quarters: lockedQs,
    });
  });

  const quota = {};
  active.forEach(p => {
    quota[p.id] = Math.min(halfCap, Math.max(0, minHalves - (already[p.id] || 0)));
  });
  let free = Math.max(0, totalHalfSlots - Object.values(quota).reduce((sum, n) => sum + n, 0));
  const rated = [...active].sort((a, b) => rate(b) - rate(a) || String(a.id).localeCompare(String(b.id)));
  let guard = 0;
  while (free > 0 && guard < 10000) {
    let gave = false;
    for (const p of rated) {
      if (quota[p.id] < halfCap) {
        quota[p.id] += 1;
        free -= 1;
        gave = true;
        if (free === 0) break;
      }
    }
    if (!gave) break;
    guard += 1;
  }

  const remaining = { ...quota };
  const byNeed = (a, b) => remaining[b.id] - remaining[a.id] || String(a.id).localeCompare(String(b.id));
  const prevQ = fromQuarter - 1;
  let satLast = new Set();
  if (prevQ >= 1 && lockedLineups[prevQ]) {
    satLast = new Set(active.filter(p => {
      const mask = playerHalfMask(p.id, lockedLineups[prevQ], segmentAt(lockedSegments, p.id, prevQ));
      return !mask[1];
    }).map(p => p.id));
  }

  const onHalf = {};
  remainingQs.forEach(q => { onHalf[q] = { 1: [], 2: [] }; });

  const gkByQuarter = {};
  remainingQs.forEach(q => {
    const keepers = pickQuarterGoalkeepers(active, slotNames, remaining, satLast);
    gkByQuarter[q] = keepers;
    [1, 2].forEach(half => {
      const chosen = keepers.map(player => player.id);
      chosen.forEach(id => {
        if (remaining[id] > 0) remaining[id] -= 1;
      });
      const eligible = () => active.filter(p => remaining[p.id] > 0 && !chosen.includes(p.id));
      eligible().filter(p => satLast.has(p.id)).sort(byNeed).forEach(p => {
        if (chosen.length < slotNames.length) chosen.push(p.id);
      });
      eligible().sort(byNeed).forEach(p => {
        if (chosen.length < slotNames.length) chosen.push(p.id);
      });
      chosen.filter(id => !keepers.some(player => player.id === id)).forEach(id => { remaining[id] -= 1; });
      onHalf[q][half] = chosen;
      satLast = new Set(active.filter(p => !chosen.includes(p.id)).map(p => p.id));
    });
  });

  const segments = {};
  Object.entries(lockedSegments || {}).forEach(([playerId, row]) => {
    const kept = {};
    Object.entries(row || {}).forEach(([quarter, kind]) => {
      if (Number(quarter) < fromQuarter) kept[quarter] = kind;
    });
    if (Object.keys(kept).length) segments[playerId] = kept;
  });

  const lineups = { ...lockedLineups };
  remainingQs.forEach(q => {
    const first = new Set(onHalf[q][1]);
    const second = new Set(onHalf[q][2]);
    const startersPool = active.filter(p => second.has(p.id));
    const bench = active.filter(p => !second.has(p.id));
    lineups[q] = { starters: assignHalfSlots(startersPool, slotNames, gkByQuarter[q] || []), bench };
    active.forEach(p => {
      const early = first.has(p.id);
      const late = second.has(p.id);
      if (early && !late) segments[p.id] = { ...(segments[p.id] || {}), [q]: "left" };
      else if (!early && late) segments[p.id] = { ...(segments[p.id] || {}), [q]: "entered" };
    });
  });

  return { lineups, segments };
}

/** One Season game-log row. Strategy rides on the game the app already stores. */
export function gameLogFromStrategy({
  id,
  date,
  opponent,
  homeScore,
  oppScore,
  notes,
  formation,
  formationLabel,
  subMode,
  format,
  league,
  lineups,
  savedAt,
  sheets,
} = {}) {
  return {
    id,
    date: date || "",
    opponent: (opponent || "").trim() || "Game day",
    homeScore: Number(homeScore) || 0,
    oppScore: Number(oppScore) || 0,
    notes: notes || "",
    strategy: {
      formation: formation || "",
      formationLabel: formationLabel || "",
      subMode: !!subMode,
      format: format || "",
      league: league || "",
      lineups: lineups || {},
      savedAt: savedAt || "",
      sheets: sheets || null,
    },
  };
}

/** Update the same date and opponent, otherwise append. Scores already logged stay. */
export function upsertGameLog(games, entry) {
  const list = Array.isArray(games) ? [...games] : [];
  const idx = list.findIndex(game => game && game.date === entry.date && game.opponent === entry.opponent);
  if (idx < 0) return [...list, entry];
  const prev = list[idx];
  list[idx] = {
    ...prev,
    strategy: entry.strategy,
    homeScore: prev.homeScore ?? entry.homeScore,
    oppScore: prev.oppScore ?? entry.oppScore,
  };
  return list;
}

/** Apply planned pairs on this quarter only. Slot positions stay put. */
export function applyBenchRotation(lineup, pairs) {
  if (!lineup?.starters) return lineup;
  let starters = lineup.starters.map(slot => ({ ...slot }));
  let bench = [...(lineup.bench || [])];
  (pairs || []).forEach(pair => {
    const idx = starters.findIndex(slot => slot.player?.id === pair.outId);
    const bIdx = bench.findIndex(player => player.id === pair.inId);
    if (idx < 0 || bIdx < 0 || isGkPosition(starters[idx].pos)) return;
    const outgoing = starters[idx].player;
    const incoming = bench[bIdx];
    starters = starters.map((slot, i) => (i === idx ? { ...slot, player: incoming } : slot));
    bench = bench.map((player, i) => (i === bIdx ? outgoing : player));
  });
  return { starters, bench };
}
