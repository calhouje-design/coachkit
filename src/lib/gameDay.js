/** Game Day helpers for Round Two. Quarter fair-play stays the rule; minutes are a live gap on top of it. */

import { defaultSlots, playersFromFormat } from "./leagueRules.js";

/**
 * The goalkeeper plays the whole period (a quarter, a half, or a third).
 * A different goalkeeper is allowed only between periods. See HARD_RULES.md.
 */
export const GK_FULL_QUARTER_REASON = "The goalkeeper plays the whole period. Change goalkeepers between periods.";

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

/**
 * Live minutes for a back-half return. The returner counts only while After is
 * showing, and only from the half point. The donor counts until the half point.
 */
export function backHalfEarnedMinutes(playerId, {
  bank,
  clockSec,
  stintStartSec,
  halfSec = 0,
  phase = "start",
  returnerId,
  donorId,
  onField = false,
} = {}) {
  const banked = bank?.[playerId] || 0;
  const sec = Math.max(0, Number(clockSec) || 0);
  const half = Math.max(0, Number(halfSec) || 0);
  if (playerId && playerId === returnerId) {
    if (phase !== "after" || !(half > 0) || sec <= half) return banked;
    return banked + (sec - half) / 60;
  }
  if (playerId && playerId === donorId) {
    const start = stintStartSec?.[playerId];
    const from = start == null ? 0 : start;
    const until = half > 0 ? Math.min(sec, half) : sec;
    return banked + Math.max(0, (until - from) / 60);
  }
  return earnedMinutes(playerId, { bank, onField, clockSec, stintStartSec });
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

/** On the field, on the bench, or missing from this quarter entirely. */
export function playerQuarterPresence(lineup, playerId) {
  if (!lineup) return "unplanned";
  if ((lineup.starters || []).some(slot => slot.player?.id === playerId)) return "on";
  if ((lineup.bench || []).some(player => player?.id === playerId)) return "bench";
  return "blank";
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
export function shareFieldSheet({ lineups, pairPlan, subMode = true, quarters = [1, 2, 3, 4], periodAbbrev = "Q" } = {}) {
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
    return { quarter: q, label: `${periodAbbrev}${q}`, starters, bench, pairs };
  });
  return { subMode: !!subMode, quarters: panels };
}

/**
 * Share/print for a back-half return: Start is the first half (returner off),
 * After is the second half (returner on for the player who came off).
 * Sub mode keeps that quarter's normal pairs and adds the returner pair.
 * Other quarters stay as the sheet already drew them.
 */
export function withBackHalfShare(sheet, {
  players,
  lineups,
  segments,
  periodAbbrev = "Q",
  pairPlan = {},
  minutesById = {},
  subMode = true,
} = {}) {
  if (!sheet?.quarters) return sheet;
  let changed = false;
  const quarters = sheet.quarters.map(panel => {
    const q = panel.quarter;
    const returner = (players || []).find(player => isBackHalfReturn(player, q));
    if (!returner) return panel;
    const lineup = lineups?.[q] || lineups?.[String(q)];
    const view = quarterHalfPresentation(lineup, segments, q, { returnerId: returner.id });
    if (!view?.pairs?.length) return panel;
    changed = true;
    const next = lineups?.[q + 1] || lineups?.[String(q + 1)] || null;
    const manual = pairPlan?.[q] || pairPlan?.[String(q)] || [];
    const pairs = subMode
      ? backHalfShownPairs({
        start: view.start,
        returnerPair: view.pairs[0],
        nextLineup: next,
        minutesById,
        manualPairs: manual,
      })
      : view.pairs;
    const start = shareFieldSheet({
      lineups: { [q]: view.start },
      subMode: false,
      quarters: [q],
      periodAbbrev,
    }).quarters[0];
    const after = shareFieldSheet({
      lineups: { [q]: view.after },
      subMode: false,
      quarters: [q],
      periodAbbrev,
    }).quarters[0];
    return {
      ...start,
      label: panel.label,
      pairs: pairs.map(pair => ({ inId: pair.inId, outId: pair.outId })),
      after: { ...after, label: panel.label, pairs: [] },
    };
  });
  return changed ? { ...sheet, quarters } : sheet;
}

/**
 * Sheet 2. One row per active player, with the same full / split / bench cells
 * as the Play Time chart.
 */
export function sharePlayTimeSheet({
  players,
  lineups,
  segments,
  credit,
  minQ = 2,
  quarters = [1, 2, 3, 4],
  periodAbbrev = "Q",
} = {}) {
  const periodList = quarters.length ? quarters : [1, 2, 3, 4];
  const minHalves = (Number(minQ) || 0) * 2;
  const rows = (players || [])
    .filter(player => player && !player.injured && !player.out)
    .slice()
    .sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")))
    .map(player => {
      const cells = periodList.map(q => {
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
      const halves = equityHalves(player.id, { lineups, segments, credit, quarters: periodList });
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
  return { minQ, minHalves, rows, periods: periodList.length, periodAbbrev };
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

/**
 * Saved return. A bare quarter number, or an object with no half, is the whole quarter.
 * `{ quarter, half: "back" }` is the second half only.
 */
export function readReturn(player) {
  const stored = player?.returnAt;
  if (stored && typeof stored === "object" && !Array.isArray(stored)) {
    const quarter = Number(stored.quarter) || Number(player?.returnQuarter) || null;
    if (!quarter) return null;
    return { quarter, half: stored.half === "back" ? "back" : "whole" };
  }
  const quarter = Number(player?.returnQuarter);
  if (!quarter) return null;
  return { quarter, half: player?.returnHalf === "back" ? "back" : "whole" };
}

/** True when this player is back for the second half of this quarter only. */
export function isBackHalfReturn(player, quarter) {
  if (!player || player.out || player.injured) return false;
  const record = readReturn(player);
  return !!record && record.half === "back" && record.quarter === Number(quarter);
}

/**
 * Start is the end lineup with the returner still on the bench.
 * After is the stored end lineup. One pair brings the returner on for the player who sat the second half.
 * The donor is the first bench player marked "left" — installBackHalfReturn places that player first.
 */
export function quarterHalfPresentation(lineup, segments, quarter, { returnerId } = {}) {
  if (!lineup?.starters || !returnerId) return null;
  const q = Number(quarter);
  if (segmentAt(segments, returnerId, q) !== "entered") return null;
  const index = lineup.starters.findIndex(slot => (
    slot.player?.id === returnerId && !isGkPosition(slot.pos)
  ));
  if (index < 0) return null;
  const donor = (lineup.bench || []).find(player => (
    player?.id && segmentAt(segments, player.id, q) === "left"
  ));
  if (!donor) return null;
  const starters = lineup.starters.map((slot, i) => (
    i === index ? { ...slot, player: donor } : { ...slot }
  ));
  const on = new Set(starters.map(slot => slot.player?.id).filter(Boolean));
  const bench = [];
  const push = (player) => {
    if (!player?.id || on.has(player.id) || bench.some(item => item.id === player.id)) return;
    bench.push(player);
  };
  push(lineup.starters[index].player);
  (lineup.bench || []).forEach(push);
  lineup.starters.forEach(slot => push(slot.player));
  return {
    start: { starters, bench },
    after: lineup,
    pairs: [{ inId: returnerId, outId: donor.id, fromPlan: false }],
  };
}

/**
 * The returner pair plus the normal half pairs for that start lineup.
 * The returner pair is first, so the donor is not also used in another pair.
 */
export function backHalfShownPairs({
  start,
  returnerPair,
  nextLineup = null,
  minutesById = {},
  manualPairs = [],
} = {}) {
  if (!start || !returnerPair?.inId || !returnerPair?.outId) return [];
  const manual = [];
  const usedIn = new Set();
  const usedOut = new Set();
  [returnerPair, ...(manualPairs || [])].forEach(pair => {
    if (!pair?.inId || !pair?.outId) return;
    if (usedIn.has(pair.inId) || usedOut.has(pair.outId)) return;
    usedIn.add(pair.inId);
    usedOut.add(pair.outId);
    manual.push(pair);
  });
  const auto = planBenchRotation(start, { minutesById, nextLineup });
  return pairsForDisplay(auto, manual, start);
}

/** Drop back-half marks whose quarter is being replanned. Whole-quarter returnQuarter stays. */
export function stripReturnAtFrom(players, fromQuarter = 1) {
  const from = Math.max(1, Number(fromQuarter) || 1);
  let changed = false;
  const next = (players || []).map(player => {
    const record = readReturn(player);
    if (!record || record.half !== "back" || record.quarter < from) return player;
    if (!player?.returnAt && player?.returnHalf == null) return player;
    changed = true;
    const copy = { ...player };
    delete copy.returnAt;
    delete copy.returnHalf;
    return copy;
  });
  return changed ? next : players;
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

function shufflePlayers(list, seed, salt) {
  const copy = [...(list || [])];
  const rng = seededRandom(mixSeed(seed, salt));
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
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

/** An open slot is filled from the bench. A fair-play shortfall may remain; an empty slot may not. */
function fillOpenField(starters, bench) {
  const nextBench = [...(bench || [])];
  const nextStarters = (starters || []).map(slot => {
    if (slot?.player) return slot;
    let idx = nextBench.findIndex(player => (player?.positions || []).includes(slot.pos));
    if (idx < 0) idx = nextBench.findIndex(player => player?.id);
    if (idx < 0) return slot;
    const player = nextBench[idx];
    nextBench.splice(idx, 1);
    return { ...slot, player };
  });
  return { starters: nextStarters, bench: nextBench };
}

/** How many fresh seeds Plan / Replan may try before keeping the only valid sheet. */
export const PLAN_VARIETY_ATTEMPTS = 24;

function mixSeed(seed, id) {
  let h = Number(seed) >>> 0;
  const text = String(id);
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

/** Id order when no seed is passed. A seed only reorders players who are otherwise tied. */
function tieCompare(seed, aId, bId) {
  if (seed == null) return String(aId).localeCompare(String(bId));
  const diff = mixSeed(seed, aId) - mixSeed(seed, bId);
  if (diff !== 0) return diff;
  return String(aId).localeCompare(String(bId));
}

/** One unsigned seed. Crypto when the runtime has it, otherwise Math.random. */
export function freshPlanSeed() {
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    return buf[0];
  }
  return Math.floor(Math.random() * 0x100000000);
}

/** Mulberry32. The same seed always yields the same sequence. */
export function seededRandom(seed) {
  let a = Number(seed) >>> 0;
  return function random() {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function periodPlanKey(lineup) {
  if (!lineup) return "";
  const starters = (lineup.starters || []).map(slot => `${slot.pos}:${slot.player?.id || ""}`).join(",");
  const bench = (lineup.bench || []).map(player => player?.id || "").filter(Boolean).sort().join(",");
  return `${starters}|${bench}`;
}

/** Identity of the periods being planned. Bench order is ignored. */
export function planHistoryKey(lineups, fromQuarter = 1) {
  const start = Math.max(1, Number(fromQuarter) || 1);
  return Object.keys(lineups || {})
    .map(Number)
    .filter(q => Number.isInteger(q) && q >= start)
    .sort((a, b) => a - b)
    .map(q => `${q}:${periodPlanKey(lineups[q] ?? lineups[String(q)])}`)
    .join("||");
}

/** The keeper already in goal, once the period clock has started. Otherwise null. */
export function liveReplanGoalkeeper(lineups, quarter, clockStarted) {
  if (!clockStarted) return null;
  return goalkeeperId(lineups?.[quarter] ?? lineups?.[String(quarter)]) || null;
}

export function sheetMeetsMinimum(players, lineups, segments, {
  minHalves = 0,
  totalQuarters = 4,
  credit = {},
} = {}) {
  const quarters = [];
  for (let q = 1; q <= totalQuarters; q++) quarters.push(q);
  if (!quarters.every(q => lineups?.[q] || lineups?.[String(q)])) return false;
  const active = (players || []).filter(player => player && !player.injured && !player.out && !player.midGameInjury);
  return active.every(player => equityHalves(player.id, {
    lineups,
    segments,
    credit,
    quarters,
  }) >= minHalves);
}

/** True when any period at or after fromQuarter shows different players or positions. */
export function plansDiffer(current, next, fromQuarter = 1) {
  const start = Math.max(1, Number(fromQuarter) || 1);
  const keys = new Set([...Object.keys(current || {}), ...Object.keys(next || {})]);
  for (const key of keys) {
    const q = Number(key);
    if (!Number.isInteger(q) || q < start) continue;
    const left = current?.[q] ?? current?.[key];
    const right = next?.[q] ?? next?.[key];
    if (periodPlanKey(left) !== periodPlanKey(right)) return true;
  }
  return false;
}

function lineupsOf(result) {
  if (result && Object.prototype.hasOwnProperty.call(result, "lineups")) return result.lineups;
  return result;
}

const MAX_PLAN_ATTEMPTS = 48;

function resolveAttempts(attempts) {
  const n = Number(attempts);
  if (!Number.isFinite(n)) return PLAN_VARIETY_ATTEMPTS;
  return Math.max(1, Math.min(MAX_PLAN_ATTEMPTS, Math.floor(n)));
}

function wrapPlan(result, { unchanged, meetsMinimum }) {
  return {
    plan: result,
    lineups: lineupsOf(result),
    segments: result?.segments,
    unchanged: !!unchanged,
    meetsMinimum: meetsMinimum == null ? null : !!meetsMinimum,
  };
}

/**
 * Call `plan(seed)` up to N times. Recent sheets are a preference, not a ban.
 * Order: a different fair sheet that is not recent; any different sheet that is
 * not recent; a different recent sheet (fair first, then the least recently
 * shown). If every seed matches the sheet on screen, rotate the goalkeeper and
 * the on-field positions and use that same order. The current sheet is kept
 * only when that rotation also finds nothing different. Non-finite attempt
 * counts cannot spin.
 */
export function firstDifferentPlan({
  plan,
  currentLineups = null,
  currentPlan = null,
  fromQuarter = 1,
  attempts = PLAN_VARIETY_ATTEMPTS,
  nextSeed = freshPlanSeed,
  fairPlay = null,
  recentKeys = null,
  historyFromQuarter = 1,
  lockGoalkeeperId = null,
} = {}) {
  if (typeof plan !== "function") throw new TypeError("firstDifferentPlan requires plan");
  const tries = resolveAttempts(attempts);
  const draw = typeof nextSeed === "function" ? nextSeed : freshPlanSeed;
  const judge = typeof fairPlay === "function" ? fairPlay : null;
  const recentRank = new Map();
  (recentKeys || []).filter(Boolean).forEach((key, index) => {
    if (!recentRank.has(key)) recentRank.set(key, index);
  });
  let first = null;
  let freshShort = null;
  let recentFair = null;
  let recentShort = null;
  const keepOlder = (slot, result, rank) => (
    !slot || rank > slot.rank ? { result, rank } : slot
  );
  const consider = (result) => {
    const lineups = lineupsOf(result);
    if (!plansDiffer(currentLineups, lineups, fromQuarter)) return null;
    const key = planHistoryKey(lineups, historyFromQuarter);
    const meets = judge ? !!judge(result) : true;
    const rank = recentRank.has(key) ? recentRank.get(key) : -1;
    if (rank < 0) {
      if (meets) return wrapPlan(result, { unchanged: false, meetsMinimum: true });
      if (!freshShort) freshShort = result;
      return null;
    }
    if (meets) recentFair = keepOlder(recentFair, result, rank);
    else recentShort = keepOlder(recentShort, result, rank);
    return null;
  };
  for (let i = 0; i < tries; i++) {
    const seed = Number(draw()) >>> 0;
    const result = plan(seed);
    if (!first) first = result;
    const picked = consider(result);
    if (picked) return picked;
  }
  if (!freshShort && !recentFair && !recentShort) {
    const base = currentPlan || (currentLineups ? { lineups: currentLineups } : null);
    if (base) {
      for (let step = 1; step <= ROTATION_STEPS; step++) {
        const picked = consider(rotatePlanSheet(base, { step, fromQuarter, lockGoalkeeperId }));
        if (picked) return picked;
      }
    }
  }
  if (freshShort) return wrapPlan(freshShort, { unchanged: false, meetsMinimum: false });
  if (recentFair) return wrapPlan(recentFair.result, { unchanged: false, meetsMinimum: true });
  if (recentShort) return wrapPlan(recentShort.result, { unchanged: false, meetsMinimum: false });
  if (currentPlan) return wrapPlan(currentPlan, { unchanged: true, meetsMinimum: null });
  if (currentLineups && planHistoryKey(currentLineups, fromQuarter)) {
    return wrapPlan({ lineups: currentLineups }, { unchanged: true, meetsMinimum: null });
  }
  return wrapPlan(first, { unchanged: false, meetsMinimum: judge && first ? judge(first) : null });
}

const ROTATION_STEPS = 12;

function listedKeeper(player) {
  return !!(player && (player.positions || []).some(isGkPosition));
}

/**
 * A different legal sheet when seeds all land on the current one.
 * Players already on the field trade the gloves and, when their positions allow,
 * the other slots. Playing time, the bench, played periods, and a pinned keeper stay.
 */
export function rotatePlanSheet(result, {
  step = 1,
  fromQuarter = 1,
  lockGoalkeeperId = null,
} = {}) {
  const source = lineupsOf(result) || {};
  const segments = result?.segments;
  const lineups = { ...source };
  const amount = Math.max(1, Number(step) || 1);
  const start = Math.max(1, Number(fromQuarter) || 1);
  Object.keys(source).forEach(key => {
    const quarter = Number(key);
    if (!Number.isInteger(quarter) || quarter < start) return;
    const pin = lockGoalkeeperId
      && quarter === start
      && goalkeeperId(source[quarter]) === lockGoalkeeperId;
    lineups[quarter] = rotateQuarterAssignments(source[quarter], amount + (quarter - start), {
      pinGk: !!pin,
      segments,
      quarter,
    });
  });
  if (result && typeof result === "object" && Object.prototype.hasOwnProperty.call(result, "lineups")) {
    return { ...result, lineups };
  }
  return lineups;
}

function rotateQuarterAssignments(lineup, step, { pinGk, segments, quarter }) {
  if (!lineup?.starters?.length) return lineup;
  const onField = lineup.starters.map(slot => slot.player).filter(Boolean);
  if (onField.length < 2) return lineup;
  const slotNames = lineup.starters.map(slot => slot.pos);
  const currentGk = lineup.starters.find(slot => isGkPosition(slot.pos))?.player || null;
  const fullPeriod = (player) => player && segmentAt(segments, player.id, quarter) == null;
  let locked = [];
  let pool = onField;
  if (currentGk && (pinGk || !fullPeriod(currentGk))) {
    locked = [currentGk];
    pool = onField.filter(player => player.id !== currentGk.id);
  } else if (currentGk) {
    const gkPool = onField.filter(player => fullPeriod(player) && listedKeeper(player));
    if (gkPool.length >= 2) {
      const at = Math.max(0, gkPool.findIndex(player => player.id === currentGk.id));
      const next = gkPool[(at + step) % gkPool.length];
      locked = [next];
      pool = onField.filter(player => player.id !== next.id);
    }
  }
  if (!pool.length) return lineup;
  const shift = step % pool.length;
  const ordered = pool.slice(shift).concat(pool.slice(0, shift));
  const starters = assignPreferListed(ordered, slotNames, locked);
  const ids = starters.map(slot => slot.player?.id).filter(Boolean);
  if (starters.some(slot => !slot.player) || new Set(ids).size !== ids.length) return lineup;
  return { starters, bench: [...(lineup.bench || [])] };
}

/** Listed players take the scarce slots first. An open slot is filled only after that. */
function assignPreferListed(pool, slotNames, lockedGk = []) {
  const starters = slotNames.map(pos => ({ pos, player: null }));
  const used = new Set();
  let gkCursor = 0;
  starters.forEach(slot => {
    if (!isGkPosition(slot.pos) || !lockedGk[gkCursor]) return;
    slot.player = lockedGk[gkCursor];
    used.add(slot.player.id);
    gkCursor += 1;
  });
  const lists = (player, pos) => (player?.positions || []).includes(pos);
  const remaining = () => (pool || []).filter(player => player && !used.has(player.id));
  let guard = 0;
  while (guard < 20) {
    guard += 1;
    const open = starters.filter(slot => !slot.player);
    if (!open.length) break;
    const ranked = open
      .map(slot => ({ slot, candidates: remaining().filter(player => lists(player, slot.pos)) }))
      .sort((a, b) => a.candidates.length - b.candidates.length);
    const next = ranked.find(item => item.candidates.length > 0);
    if (!next) break;
    const player = [...next.candidates].sort((a, b) => {
      const choices = (candidate) => open.filter(slot => lists(candidate, slot.pos)).length;
      return choices(a) - choices(b);
    })[0];
    next.slot.player = player;
    used.add(player.id);
  }
  const leftover = remaining();
  starters.forEach(slot => {
    if (slot.player || !leftover.length) return;
    slot.player = leftover.shift();
  });
  return starters;
}

/**
 * What a replan keeps. Resetting the clock clears credit, half marks, and
 * formation overrides. A live period keeps the swaps that already happened.
 * A period that has not started is planned again. Periods already played stay.
 */
export function replanCarryForward({
  resetClock = false,
  fromQuarter = 1,
  livePeriod = false,
  segments = {},
  credit = {},
  overrides = {},
} = {}) {
  if (resetClock) return { segments: {}, credit: {}, overrides: {} };
  const start = Math.max(1, Number(fromQuarter) || 1);
  const through = livePeriod ? start : start - 1;
  return {
    segments: marksThroughQuarter(segments, through),
    credit: credit || {},
    overrides: overrides || {},
  };
}

function halfMarkIds(segments, quarter) {
  const ids = new Set();
  const q = Number(quarter);
  Object.entries(segments || {}).forEach(([playerId, row]) => {
    const kind = row?.[q] ?? row?.[String(q)];
    if (kind === "entered" || kind === "left") ids.add(playerId);
  });
  return ids;
}

/** Half marks that already happened, or null when they cannot share the period with the keeper. */
function feasibleHalfLocks(segments, quarter, active, slotCount, keepers) {
  const q = Number(quarter);
  const activeIds = new Set((active || []).map(player => player.id));
  const keeperIds = new Set((keepers || []).map(player => player.id));
  const entered = [];
  const left = [];
  Object.entries(segments || {}).forEach(([playerId, row]) => {
    if (!activeIds.has(playerId)) return;
    const kind = row?.[q] ?? row?.[String(q)];
    if (kind === "entered") entered.push(playerId);
    else if (kind === "left") left.push(playerId);
  });
  if (!entered.length && !left.length) return null;
  const overlap = entered.some(id => left.includes(id) || keeperIds.has(id))
    || left.some(id => keeperIds.has(id));
  if (overlap) return null;
  if (entered.length + keeperIds.size > slotCount) return null;
  if (left.length + keeperIds.size > slotCount) return null;
  return { entered, left };
}

function marksThroughQuarter(segments, throughQuarter) {
  const end = Number(throughQuarter);
  const next = {};
  if (!end) return next;
  Object.entries(segments || {}).forEach(([playerId, row]) => {
    const kept = {};
    Object.entries(row || {}).forEach(([quarter, kind]) => {
      const q = Number(quarter);
      if (q >= 1 && q <= end) kept[q] = kind;
    });
    if (Object.keys(kept).length) next[playerId] = kept;
  });
  return next;
}

/**
 * Keep a previous half mark only when the lineup agrees with it.
 * "entered" is on the field. "left" is on the bench. Anything else keeps the planner's mark.
 * A stored mark that still disagrees is dropped.
 */
export function preservePeriodMarks(nextSegments, previousSegments, quarter, lineup) {
  const q = Number(quarter);
  const next = { ...(nextSegments || {}) };
  if (!q || !lineup?.starters) return next;
  const onField = new Set((lineup.starters || []).map(slot => slot.player?.id).filter(Boolean));
  const agrees = (playerId, kind) => (
    kind === "entered" ? onField.has(playerId) : kind === "left" ? !onField.has(playerId) : false
  );
  Object.entries(previousSegments || {}).forEach(([playerId, row]) => {
    const kind = row?.[q] ?? row?.[String(q)];
    if (!agrees(playerId, kind)) return;
    next[playerId] = { ...(next[playerId] || {}), [q]: kind };
  });
  Object.keys(next).forEach(playerId => {
    const row = { ...(next[playerId] || {}) };
    const kind = row[q] ?? row[String(q)];
    if (kind == null || agrees(playerId, kind)) return;
    delete row[q];
    delete row[String(q)];
    if (Object.keys(row).length) next[playerId] = row;
    else delete next[playerId];
  });
  return next;
}

/**
 * A live period keeps half marks that already happened, when the lineup agrees.
 * A period that has not started keeps the planner's marks. So do later periods.
 */
export function segmentsSavedForSubReplan(plannedSegments, previousSegments, lineups, {
  fromQuarter = 1,
  resetClock = false,
  livePeriod = false,
} = {}) {
  const fromQ = Number(fromQuarter) || 1;
  const lineup = lineups?.[fromQ] || lineups?.[String(fromQ)];
  if (resetClock || !livePeriod || !lineup?.starters) return plannedSegments;
  return preservePeriodMarks(plannedSegments, previousSegments, fromQ, lineup);
}

/**
 * Plan full game resets the clock. Replan of the period already on the clock,
 * or of a period where the coach recorded a real swap or injury, keeps that
 * period and pins its goalkeeper, including period 1.
 * A replan before any of that still resets period 1.
 * Planned marks alone are not a real event.
 */
export function liveReplanClockDecision({
  liveReplan = false,
  fromQuarter = 1,
  quarter = 1,
  clockStarted = false,
  realEvent = false,
} = {}) {
  const fromQ = Math.max(1, Number(fromQuarter) || 1);
  const q = Math.max(1, Number(quarter) || 1);
  const pinGoalkeeper = !!(liveReplan && fromQ === q && (clockStarted || realEvent));
  return { resetClock: fromQ === 1 && !pinGoalkeeper, pinGoalkeeper };
}

function periodKey(quarter) {
  const q = Number(quarter);
  return Number.isInteger(q) && q > 0 ? String(q) : "";
}

/** Per-period clock kept on this device. `sec` is the period clock. `stints` are already banked up to that second. */
export function normalizePeriodClock(value) {
  const sec = Math.max(0, Number(value?.sec) || 0);
  const stints = {};
  Object.entries(value?.stints || {}).forEach(([id, start]) => {
    if (!id) return;
    const n = Number(start);
    if (Number.isFinite(n)) stints[id] = n;
  });
  return { sec, stints };
}

export function periodClockState(saved, quarter) {
  const key = periodKey(quarter);
  if (!key || !saved) return { sec: 0, stints: {} };
  const row = saved[key] ?? saved[Number(key)];
  if (!row) return { sec: 0, stints: {} };
  return normalizePeriodClock(row);
}

export function rememberPeriodClock(saved, quarter, sec, stints) {
  const key = periodKey(quarter);
  if (!key) return saved || {};
  return { ...(saved || {}), [key]: normalizePeriodClock({ sec, stints }) };
}

/**
 * Leave one period tab and open another. The clock and stints just left are stored.
 * The destination period's clock is restored. Lineups and appearance credit are not inputs.
 */
export function clockAfterPeriodSwitch(saved, fromQuarter, toQuarter, sec, stints) {
  const clocks = rememberPeriodClock(saved, fromQuarter, sec, stints);
  const restored = periodClockState(clocks, toQuarter);
  return { clocks, clockSec: restored.sec, stints: restored.stints };
}

/** Quarter -> player ids who were in a real swap, or who were marked injured or out. Presence of the key is the flag. */
export function normalizeRealPeriodEvents(value) {
  const next = {};
  if (!value || typeof value !== "object" || Array.isArray(value)) return next;
  Object.entries(value).forEach(([quarter, entry]) => {
    const key = periodKey(quarter);
    if (!key) return;
    const ids = Array.isArray(entry) ? entry : [];
    const unique = [];
    ids.forEach(id => {
      if (id && !unique.includes(id)) unique.push(String(id));
    });
    next[key] = unique;
  });
  return next;
}

export function periodHasRealEvent(flags, quarter) {
  const key = periodKey(quarter);
  if (!key || !flags || typeof flags !== "object") return false;
  return Object.prototype.hasOwnProperty.call(flags, key)
    || Object.prototype.hasOwnProperty.call(flags, Number(key));
}

export function realEventPlayerIds(flags, quarter) {
  const key = periodKey(quarter);
  if (!key || !flags) return [];
  const entry = flags[key] ?? flags[Number(key)];
  return Array.isArray(entry) ? entry.filter(Boolean) : [];
}

export function noteRealPeriodEvent(flags, quarter, playerIds = []) {
  const key = periodKey(quarter);
  if (!key) return normalizeRealPeriodEvents(flags);
  const next = normalizeRealPeriodEvents(flags);
  const ids = [...(next[key] || [])];
  (playerIds || []).forEach(id => {
    if (id && !ids.includes(String(id))) ids.push(String(id));
  });
  next[key] = ids;
  return next;
}

/** Keep real events for periods 1..throughQuarter. Later periods were rebuilt. */
export function realEventsThrough(flags, throughQuarter) {
  const end = Number(throughQuarter) || 0;
  const next = {};
  Object.entries(normalizeRealPeriodEvents(flags)).forEach(([quarter, ids]) => {
    if (Number(quarter) <= end) next[quarter] = ids;
  });
  return next;
}

/**
 * An Out or injury is a real event only when that period is already live:
 * the clock has run, or a real swap is already on the period.
 * An Out at 0:00 is not. When auto-regen rebuilds this period and the ones after it,
 * those later real-event flags are dropped. The current period is not flagged.
 */
export function realEventsAfterUnavailable(flags, {
  quarter,
  live = false,
  playerId,
  autoRegen = true,
} = {}) {
  const kept = autoRegen ? realEventsThrough(flags, quarter) : normalizeRealPeriodEvents(flags);
  if (!live) return kept;
  return noteRealPeriodEvent(kept, quarter, [playerId]);
}

/**
 * A Return is not a real event by itself.
 * When auto-regen rebuilds this period and the ones after it, later real-event
 * flags are dropped, including on a live Return. The current period keeps the
 * flag it already had. Earlier periods stay. A Return that does not rebuild
 * leaves the flags untouched.
 */
export function realEventsAfterReturn(flags, {
  quarter,
  regenerated = true,
} = {}) {
  const normalized = normalizeRealPeriodEvents(flags);
  if (!regenerated) return normalized;
  return realEventsThrough(normalized, quarter);
}

function pickQuarterGoalkeepers(active, slotNames, remaining, satLast, seed = null) {
  const count = slotNames.filter(isGkPosition).length;
  if (!count) return [];
  const listed = active.filter(player => (player.positions || []).some(isGkPosition));
  const pool = listed.length ? listed : active;
  const rank = (a, b) => {
    const aSat = satLast.has(a.id) ? 1 : 0;
    const bSat = satLast.has(b.id) ? 1 : 0;
    if (aSat !== bSat) return bSat - aSat;
    const need = (remaining[b.id] || 0) - (remaining[a.id] || 0);
    if (need !== 0) return need;
    return tieCompare(seed, a.id, b.id);
  };
  return [...pool].sort(rank).slice(0, count);
}

/**
 * Sub-mode plan. Each quarter is two halves. Players who sat the previous half
 * come on next when they still owe time, so two bench halves in a row are
 * avoided when the bench fits back on the field. Everyone still targets minHalves
 * (4 of 8 at 50%). The stored lineup is who is on at the end of the quarter.
 * `seed` only breaks ties. The same seed rebuilds the same sheet. Omit it for id order.
 */
export function scheduleHalfRotation(players, slots, {
  minHalves = 4,
  fromQuarter = 1,
  lockedLineups = {},
  lockedSegments = {},
  totalQuarters = 4,
  rate = () => 0,
  slotsByQuarter = null,
  seed = null,
  lockGoalkeeperId = null,
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

  const minimum = {};
  const bonus = {};
  active.forEach(p => {
    minimum[p.id] = Math.min(halfCap, Math.max(0, minHalves - (already[p.id] || 0)));
    bonus[p.id] = 0;
  });
  const quota = { ...minimum };
  let free = Math.max(0, totalHalfSlots - Object.values(quota).reduce((sum, n) => sum + n, 0));
  const rated = [...active].sort((a, b) => rate(b) - rate(a) || tieCompare(seed, a.id, b.id));
  let guard = 0;
  while (free > 0 && guard < 10000) {
    let gave = false;
    for (const p of rated) {
      if (quota[p.id] < halfCap) {
        quota[p.id] += 1;
        bonus[p.id] += 1;
        free -= 1;
        gave = true;
        if (free === 0) break;
      }
    }
    if (!gave) break;
    guard += 1;
  }

  const lockedKeeper = lockGoalkeeperId
    ? active.find(player => player.id === lockGoalkeeperId) || null
    : null;
  if (lockedKeeper && remainingQs.includes(fromQuarter)) {
    const reserve = Math.min(halfCap, 2);
    let short = Math.max(0, reserve - (quota[lockedKeeper.id] || 0));
    const donors = active
      .filter(player => player.id !== lockedKeeper.id)
      .sort((a, b) => (
        (bonus[b.id] || 0) - (bonus[a.id] || 0)
        || (quota[b.id] || 0) - (quota[a.id] || 0)
        || tieCompare(seed, a.id, b.id)
      ));
    while (short > 0) {
      const donor = donors.find(player => (bonus[player.id] || 0) > 0)
        || donors.find(player => (quota[player.id] || 0) > 0);
      if (!donor) break;
      if (bonus[donor.id] > 0) bonus[donor.id] -= 1;
      quota[donor.id] -= 1;
      quota[lockedKeeper.id] = (quota[lockedKeeper.id] || 0) + 1;
      short -= 1;
    }
  }

  const remaining = { ...quota };
  const byNeed = (a, b) => remaining[b.id] - remaining[a.id] || tieCompare(seed, a.id, b.id);
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
    let keepers = pickQuarterGoalkeepers(active, slotNames, remaining, satLast, seed);
    if (q === fromQuarter) {
      const marked = halfMarkIds(lockedSegments, q);
      const pinIsMarked = lockedKeeper && marked.has(lockedKeeper.id);
      if (marked.size && !pinIsMarked) {
        const gkPool = active.filter(player => !marked.has(player.id));
        if (gkPool.length) keepers = pickQuarterGoalkeepers(gkPool, slotNames, remaining, satLast, seed);
      }
      if (lockedKeeper) {
        const count = slotNames.filter(isGkPosition).length;
        keepers = count
          ? [lockedKeeper, ...keepers.filter(player => player.id !== lockedKeeper.id)].slice(0, count)
          : [];
      }
    }
    gkByQuarter[q] = keepers;
    const halfLocks = q === fromQuarter ? feasibleHalfLocks(lockedSegments, q, active, slotNames.length, keepers) : null;
    [1, 2].forEach(half => {
      const chosen = keepers.map(player => player.id);
      const banned = new Set(!halfLocks ? [] : half === 1 ? halfLocks.entered : halfLocks.left);
      const must = !halfLocks ? [] : half === 1 ? halfLocks.left : halfLocks.entered;
      must.forEach(id => {
        if (!chosen.includes(id) && !banned.has(id) && chosen.length < slotNames.length) chosen.push(id);
      });
      chosen.forEach(id => {
        if (keepers.some(player => player.id === id) && remaining[id] > 0) remaining[id] -= 1;
      });
      const pushWhile = (pred, owesTime) => {
        active
          .filter(player => !chosen.includes(player.id) && !banned.has(player.id) && pred(player) && (!owesTime || remaining[player.id] > 0))
          .sort(byNeed)
          .forEach(player => {
            if (chosen.length < slotNames.length) chosen.push(player.id);
          });
      };
      pushWhile(player => satLast.has(player.id), true);
      pushWhile(() => true, true);
      if (chosen.length < slotNames.length) {
        pushWhile(player => satLast.has(player.id), false);
        pushWhile(() => true, false);
      }
      chosen.filter(id => !keepers.some(player => player.id === id)).forEach(id => {
        if (remaining[id] > 0) remaining[id] -= 1;
      });
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
  const namesFor = (q) => {
    const custom = slotsByQuarter?.[q] || slotsByQuarter?.[String(q)];
    if (Array.isArray(custom) && custom.length === slotNames.length) return custom;
    return slotNames;
  };
  remainingQs.forEach(q => {
    const first = new Set(onHalf[q][1]);
    const second = new Set(onHalf[q][2]);
    const startersPool = active.filter(p => second.has(p.id));
    const benchPool = active.filter(p => !second.has(p.id));
    const ordered = seed == null ? startersPool : shufflePlayers(startersPool, seed, `pos-${q}`);
    const filled = fillOpenField(assignHalfSlots(ordered, namesFor(q), gkByQuarter[q] || []), benchPool);
    const late = new Set(filled.starters.map(slot => slot.player?.id).filter(Boolean));
    lineups[q] = { starters: filled.starters, bench: active.filter(p => !late.has(p.id)) };
    active.forEach(p => {
      const early = first.has(p.id);
      const on = late.has(p.id);
      const row = { ...(segments[p.id] || {}) };
      delete row[q];
      delete row[String(q)];
      if (early && !on) row[q] = "left";
      else if (!early && on) row[q] = "entered";
      if (Object.keys(row).length) segments[p.id] = row;
      else delete segments[p.id];
    });
  });

  return { lineups, segments };
}

/** The keeper left in goal plays the whole period. Drop a half mark the replan wrote for them. */
function creditPinnedGoalkeeper(segments, lineup, quarter) {
  const gkId = goalkeeperId(lineup);
  if (!gkId) return segments || {};
  const row = { ...(segments?.[gkId] || {}) };
  const q = Number(quarter);
  if (row[q] == null && row[String(q)] == null) return segments || {};
  delete row[q];
  delete row[String(q)];
  const next = { ...(segments || {}) };
  if (Object.keys(row).length) next[gkId] = row;
  else delete next[gkId];
  return next;
}

/**
 * Full-mode replan state: drop half marks from the replanned periods onward,
 * and give the live period's goalkeeper a full period of credit.
 */
export function segmentsAfterFullReplan(segments, fromQuarter, lineup, quarter) {
  const start = Math.max(1, Number(fromQuarter) || 1);
  const cleared = start <= 1 ? {} : clearSubSegmentsFrom(segments, start);
  if (!lineup || quarter == null) return cleared;
  return creditPinnedGoalkeeper(cleared, lineup, quarter);
}

/**
 * Full-mode save: drop half marks from the replanned period on. A live period
 * puts its real swaps back only where the lineup still agrees. A period that
 * has not started stays clear. The goalkeeper keeps a full period.
 */
export function segmentsSavedForFullReplan(previousSegments, lineups, {
  fromQuarter = 1,
  resetClock = false,
  livePeriod = false,
} = {}) {
  if (resetClock) return {};
  const fromQ = Math.max(1, Number(fromQuarter) || 1);
  const lineup = lineups?.[fromQ] || lineups?.[String(fromQ)];
  const cleared = segmentsAfterFullReplan(previousSegments, fromQ, lineup, fromQ);
  if (!livePeriod || !lineup?.starters) return cleared;
  const kept = preservePeriodMarks(cleared, previousSegments, fromQ, lineup);
  return creditPinnedGoalkeeper(kept, lineup, fromQ);
}

function pinNamedGoalkeeper(lineup, gkId, roster) {
  if (!lineup?.starters || !gkId) return lineup;
  const gkIdx = lineup.starters.findIndex(slot => isGkPosition(slot.pos));
  if (gkIdx < 0 || lineup.starters[gkIdx].player?.id === gkId) return lineup;
  const gkPlayer = (roster || []).find(player => player?.id === gkId);
  if (!gkPlayer || gkPlayer.injured || gkPlayer.out) return lineup;
  const starters = lineup.starters.map(slot => ({ ...slot }));
  const displaced = starters[gkIdx].player || null;
  let bench = [...(lineup.bench || [])].filter(player => player?.id !== gkId);
  const otherIdx = starters.findIndex(slot => slot.player?.id === gkId);
  if (otherIdx >= 0) starters[otherIdx] = { ...starters[otherIdx], player: displaced };
  else if (displaced) bench = [...bench, displaced];
  starters[gkIdx] = { ...starters[gkIdx], player: gkPlayer };
  return { starters, bench };
}

function countedHalves(playerId, lineups, segments, totalQuarters) {
  const quarters = [];
  for (let q = 1; q <= totalQuarters; q++) quarters.push(q);
  return equityHalves(playerId, { lineups, segments, credit: {}, quarters });
}

/** In full-period mode, start a returning player when a teammate can spare a period. */
function giveReturnerFieldTime(lineups, segments, returning, fromQuarter, totalQuarters, minHalves) {
  if (!returning) return lineups;
  const next = { ...(lineups || {}) };
  const id = returning.id;
  for (let q = fromQuarter; q <= totalQuarters; q++) {
    if (countedHalves(id, next, segments, totalQuarters) >= minHalves) break;
    const lineup = next[q];
    if (!lineup?.starters) continue;
    if (lineup.starters.some(slot => slot.player?.id === id)) continue;
    const donorIdx = lineup.starters.findIndex(slot => {
      if (!slot.player || isGkPosition(slot.pos) || slot.player.id === id) return false;
      return countedHalves(slot.player.id, next, segments, totalQuarters) - 2 >= minHalves;
    });
    if (donorIdx < 0) continue;
    const donor = lineup.starters[donorIdx].player;
    const starters = lineup.starters.map((slot, index) => (
      index === donorIdx ? { ...slot, player: returning } : slot
    ));
    const bench = (lineup.bench || []).filter(player => player?.id !== id);
    if (!bench.some(player => player?.id === donor.id)) bench.push(donor);
    next[q] = { starters, bench };
  }
  return next;
}

function writePeriodSegment(segments, playerId, quarter, kind) {
  const next = { ...(segments || {}) };
  const row = { ...(next[playerId] || {}) };
  const q = Number(quarter);
  delete row[q];
  delete row[String(q)];
  if (kind) row[q] = kind;
  if (Object.keys(row).length) next[playerId] = row;
  else delete next[playerId];
  return next;
}

function segmentKindForMask(mask) {
  const [first, second] = mask || [];
  if (first && !second) return "left";
  if (!first && second) return "entered";
  return null;
}

function placeReturnerForDonor(lineup, returning, donorId) {
  if (!lineup?.starters || !returning) return lineup;
  const starters = lineup.starters.map(slot => (
    slot.player?.id === donorId ? { ...slot, player: returning } : slot
  ));
  const outgoing = (lineup.starters || []).find(slot => slot.player?.id === donorId)?.player || null;
  let bench = (lineup.bench || []).filter(player => player?.id !== returning.id && player?.id !== donorId);
  if (outgoing) bench = [...bench, outgoing];
  return { starters, bench };
}

/**
 * Last-period return in half mode. Give the returner open halves until they
 * reach the minimum, or until nobody can spare one.
 * The goalkeeper and real-swap players stay where they are.
 */
export function giveReturnerHalfSlots(lineups, segments, returning, quarter, totalQuarters, minHalves, {
  protectedIds = [],
} = {}) {
  if (!returning?.id) return { lineups: lineups || {}, segments: segments || {} };
  const q = Number(quarter);
  const lineup = lineups?.[q] || lineups?.[String(q)];
  if (!lineup?.starters) return { lineups: lineups || {}, segments: segments || {} };
  const quarters = [];
  for (let period = 1; period <= totalQuarters; period++) quarters.push(period);
  const halvesOf = (sheet, marks, playerId) => equityHalves(playerId, {
    lineups: sheet,
    segments: marks,
    credit: {},
    quarters,
  });
  const gkId = goalkeeperId(lineup);
  const protect = new Set([...(protectedIds || []), gkId].filter(Boolean).map(id => String(id)));
  let nextLineups = {
    ...(lineups || {}),
    [q]: {
      starters: lineup.starters.map(slot => ({ ...slot })),
      bench: [...(lineup.bench || [])],
    },
  };
  let nextSegments = segments || {};
  const id = returning.id;
  let guard = 0;
  while (halvesOf(nextLineups, nextSegments, id) < minHalves && guard < 4) {
    guard += 1;
    const before = halvesOf(nextLineups, nextSegments, id);
    const mine = playerHalfMask(id, nextLineups[q], segmentAt(nextSegments, id, q));
    const needHalf = mine[0] ? (mine[1] ? -1 : 1) : 0;
    if (needHalf < 0) break;
    const seen = new Set();
    const donors = [];
    const consider = (player) => {
      if (!player?.id || player.id === id || seen.has(player.id) || protect.has(String(player.id))) return;
      seen.add(player.id);
      const onField = (nextLineups[q].starters || []).some(slot => slot.player?.id === player.id);
      if (needHalf === 1 && !onField) return;
      const mask = playerHalfMask(player.id, nextLineups[q], segmentAt(nextSegments, player.id, q));
      if (!mask[needHalf]) return;
      if (halvesOf(nextLineups, nextSegments, player.id) - 1 < minHalves) return;
      donors.push(player);
    };
    (nextLineups[q].starters || []).forEach(slot => consider(slot.player));
    (nextLineups[q].bench || []).forEach(consider);
    donors.sort((a, b) => (
      halvesOf(nextLineups, nextSegments, b.id) - halvesOf(nextLineups, nextSegments, a.id)
      || String(a.id).localeCompare(String(b.id))
    ));
    const donor = donors[0];
    if (!donor) break;
    const donorMask = playerHalfMask(donor.id, nextLineups[q], segmentAt(nextSegments, donor.id, q));
    const nextMine = [mine[0], mine[1]];
    const nextDonor = [donorMask[0], donorMask[1]];
    nextMine[needHalf] = true;
    nextDonor[needHalf] = false;
    nextSegments = writePeriodSegment(nextSegments, id, q, segmentKindForMask(nextMine));
    nextSegments = writePeriodSegment(nextSegments, donor.id, q, segmentKindForMask(nextDonor));
    if (needHalf === 1) {
      nextLineups = { ...nextLineups, [q]: placeReturnerForDonor(nextLineups[q], returning, donor.id) };
    } else if (!(nextLineups[q].bench || []).some(player => player?.id === id)
      && !(nextLineups[q].starters || []).some(slot => slot.player?.id === id)) {
      nextLineups = { ...nextLineups, [q]: addLateArrival(nextLineups[q], returning) };
    }
    if (halvesOf(nextLineups, nextSegments, id) <= before) break;
  }
  return { lineups: nextLineups, segments: nextSegments };
}

/**
 * Rebuild the sheet when someone is injured or out.
 * Quarters from `fromQuarter` until the quarter before `returnQuarter` drop that
 * player (blank — not left on the bench) and the remaining players refill the field.
 * A return quarter replans from then on and leaves the unavailable quarters as they are.
 * Sub mode uses the half-quarter planner. Full quarters refill the open slot.
 * The goalkeeper stays in goal for the in-progress period unless they are the one hurt.
 * Periods before fromQuarter are copied through and not rebuilt.
 * lockGoalkeeperId pins that keeper on the live period after a replan (a returning keeper does not take the gloves mid-period).
 * A live return in the last period of half mode also gives that player any open halves they still need.
 */
export function regenerateForAbsence({
  players,
  slots,
  lineups = {},
  segments = {},
  absentId,
  fromQuarter = 1,
  returnQuarter = null,
  minHalves = 4,
  subMode = true,
  rate = () => 0,
  totalQuarters = 4,
  slotsByQuarter = null,
  lockGoalkeeperId = null,
  livePeriod = false,
  protectedIds = [],
} = {}) {
  const start = Math.max(1, Number(fromQuarter) || 1);
  const back = returnQuarter == null ? null : Number(returnQuarter);
  const absentEnd = back == null ? totalQuarters : Math.min(totalQuarters, back - 1);
  const roster = players || [];
  const without = roster.map(player => (
    player?.id === absentId ? { ...player, injured: true, out: false } : player
  ));
  const withBack = roster.map(player => (
    player?.id === absentId ? { ...player, injured: false, out: false, midGameInjury: false } : player
  ));

  if (!subMode) {
    const next = { ...(lineups || {}) };
    for (let q = start; q <= absentEnd; q++) {
      if (next[q]) next[q] = pullFromQuarter(next[q], absentId);
    }
    const nextSegments = clearSubSegmentsFrom(segments, start);
    if (back != null && back <= totalQuarters) {
      const returning = withBack.find(player => player?.id === absentId);
      for (let q = back; q <= totalQuarters; q++) {
        if (!next[q] || !returning) continue;
        if (playerQuarterPresence(next[q], absentId) !== "blank") continue;
        const emptyIdx = (next[q].starters || []).findIndex(slot => !slot.player && !isGkPosition(slot.pos));
        if (emptyIdx >= 0) {
          const starters = next[q].starters.map((slot, index) => (
            index === emptyIdx ? { ...slot, player: returning } : slot
          ));
          next[q] = { starters, bench: (next[q].bench || []).filter(player => player?.id !== absentId) };
        } else {
          next[q] = addLateArrival(next[q], returning);
        }
      }
      return {
        lineups: giveReturnerFieldTime(next, nextSegments, returning, back, totalQuarters, minHalves),
        segments: nextSegments,
      };
    }
    return { lineups: next, segments: nextSegments };
  }

  const lockedBefore = {};
  for (let q = 1; q < start; q++) {
    if (lineups[q]) lockedBefore[q] = lineups[q];
  }
  const absentPlan = scheduleHalfRotation(without, slots, {
    minHalves,
    fromQuarter: start,
    lockedLineups: lockedBefore,
    lockedSegments: clearSubSegmentsFrom(segments, start),
    totalQuarters: Math.max(start, absentEnd),
    rate,
    slotsByQuarter,
  });
  const shaped = { ...absentPlan.lineups };
  for (let q = start; q <= absentEnd; q++) {
    if (shaped[q]) shaped[q] = pullFromQuarter(shaped[q], absentId);
  }
  let absentSegments = absentPlan.segments;
  const prevGk = lockGoalkeeperId || goalkeeperId(lineups?.[start]);
  if (prevGk && prevGk !== absentId && shaped[start]) {
    shaped[start] = pinNamedGoalkeeper(shaped[start], prevGk, roster);
    shaped[start] = pullFromQuarter(shaped[start], absentId);
    absentSegments = creditPinnedGoalkeeper(absentSegments, shaped[start], start);
  }
  if (back == null || back > totalQuarters) {
    return { lineups: shaped, segments: absentSegments };
  }

  const lockedUntilReturn = {};
  for (let q = 1; q < back; q++) {
    if (shaped[q]) lockedUntilReturn[q] = shaped[q];
  }
  const returnPlan = scheduleHalfRotation(withBack, slots, {
    minHalves,
    fromQuarter: back,
    lockedLineups: lockedUntilReturn,
    lockedSegments: absentSegments,
    totalQuarters,
    rate,
    slotsByQuarter,
  });
  let returned = { ...returnPlan.lineups };
  for (let q = start; q <= absentEnd; q++) {
    if (returned[q]) returned[q] = pullFromQuarter(returned[q], absentId);
  }
  let returnSegments = returnPlan.segments;
  if (lockGoalkeeperId && returned[back]) {
    returned[back] = pinNamedGoalkeeper(returned[back], lockGoalkeeperId, withBack);
    returnSegments = creditPinnedGoalkeeper(returnSegments, returned[back], back);
  }
  if (livePeriod && back === totalQuarters) {
    const returning = withBack.find(player => player?.id === absentId);
    const topped = giveReturnerHalfSlots(returned, returnSegments, returning, back, totalQuarters, minHalves, {
      protectedIds,
    });
    returned = topped.lineups;
    returnSegments = creditPinnedGoalkeeper(topped.segments, returned[back], back);
  }
  return { lineups: returned, segments: returnSegments };
}

function halvesPlayed(playerId, lineups, segments, totalQuarters) {
  const quarters = [];
  for (let q = 1; q <= totalQuarters; q++) quarters.push(q);
  return equityHalves(playerId, { lineups, segments, credit: {}, quarters });
}

/**
 * Who gives up the second half. Most time first, then the higher rating, then id.
 * A full-quarter outfield player can come off at the half and keep the first half.
 * The goalkeeper is never a candidate.
 */
function pickBackHalfDonor(lineup, segments, quarter, {
  excludeIds = [],
  lineups,
  totalQuarters = 4,
  rate = () => 0,
} = {}) {
  const q = Number(quarter);
  const skip = new Set((excludeIds || []).filter(Boolean).map(id => String(id)));
  const gkId = goalkeeperId(lineup);
  if (gkId) skip.add(String(gkId));
  const ranked = (lineup?.starters || [])
    .map((slot, index) => ({ slot, index }))
    .filter(({ slot }) => {
      const id = slot.player?.id;
      if (!id || skip.has(String(id)) || isGkPosition(slot.pos)) return false;
      const mark = segmentAt(segments, id, q);
      return mark !== "entered" && mark !== "left";
    })
    .map(item => ({
      ...item,
      halves: halvesPlayed(item.slot.player.id, lineups, segments, totalQuarters),
      rate: Number(rate(item.slot.player)) || 0,
    }))
    .sort((a, b) => (
      b.halves - a.halves
      || b.rate - a.rate
      || String(a.slot.player.id).localeCompare(String(b.slot.player.id))
    ));
  return ranked[0] || null;
}

/** True when this quarter still has an outfield player who can sit the second half. */
export function backHalfDonorAvailable({
  lineup,
  segments,
  quarter,
  returnerId,
  protectedIds = [],
  lineups,
  totalQuarters = 4,
  rate = () => 0,
} = {}) {
  if (!lineup?.starters || !returnerId) return false;
  let base = {
    starters: lineup.starters.map(slot => ({ ...slot })),
    bench: [...(lineup.bench || [])],
  };
  if (base.starters.some(slot => slot.player?.id === returnerId)) {
    base = pullFromQuarter(base, returnerId);
  }
  const gkId = goalkeeperId(base);
  const picked = pickBackHalfDonor(base, segments, quarter, {
    excludeIds: [returnerId, gkId, ...(protectedIds || [])],
    lineups: lineups || { [Number(quarter)]: base },
    totalQuarters,
    rate,
  });
  return !!(picked?.slot?.player && !isGkPosition(picked.slot.pos));
}

/**
 * After a whole-quarter return plan, keep every later quarter and change only
 * the return quarter: the returner enters at the half for one outfield player.
 * The stored lineup is the end of the quarter. The donor sits the second half
 * and is placed first on the bench so Start | After can find them.
 */
export function installBackHalfReturn({
  lineups,
  segments,
  priorLineups,
  priorSegments,
  returning,
  quarter,
  totalQuarters = 4,
  rate = () => 0,
  protectedIds = [],
} = {}) {
  if (!returning?.id) return { lineups: lineups || {}, segments: segments || {} };
  const q = Number(quarter);
  const prior = priorLineups?.[q] || priorLineups?.[String(q)];
  if (!prior?.starters) return { lineups: lineups || {}, segments: segments || {} };
  let base = {
    starters: prior.starters.map(slot => ({ ...slot })),
    bench: [...(prior.bench || [])],
  };
  if (base.starters.some(slot => slot.player?.id === returning.id)) {
    base = pullFromQuarter(base, returning.id);
  } else {
    base = { ...base, bench: base.bench.filter(player => player?.id !== returning.id) };
  }
  const gkId = goalkeeperId(base);
  const picked = pickBackHalfDonor(base, priorSegments, q, {
    excludeIds: [returning.id, gkId, ...(protectedIds || [])],
    lineups: priorLineups,
    totalQuarters,
    rate,
  });
  if (!picked?.slot?.player || isGkPosition(picked.slot.pos)) {
    return { lineups: lineups || {}, segments: segments || {} };
  }
  const donor = picked.slot.player;
  const starters = base.starters.map((slot, index) => {
    if (index === picked.index) return { ...slot, player: returning };
    if (slot.player?.id === returning.id) return { ...slot, player: null };
    return slot;
  });
  const bench = [
    donor,
    ...base.bench.filter(player => player?.id && player.id !== donor.id && player.id !== returning.id),
  ];
  const nextLineups = { ...(lineups || {}), [q]: { starters, bench } };
  let nextSegments = {};
  Object.entries(segments || {}).forEach(([playerId, row]) => {
    const kept = {};
    Object.entries(row || {}).forEach(([period, kind]) => {
      if (Number(period) !== q) kept[period] = kind;
    });
    if (Object.keys(kept).length) nextSegments[playerId] = kept;
  });
  Object.entries(priorSegments || {}).forEach(([playerId, row]) => {
    if (playerId === returning.id || playerId === donor.id) return;
    const kind = segmentAt(priorSegments, playerId, q);
    if (!kind) return;
    nextSegments = writePeriodSegment(nextSegments, playerId, q, kind);
  });
  nextSegments = writePeriodSegment(nextSegments, donor.id, q, "left");
  const earlier = segmentAt(priorSegments, returning.id, q);
  if (earlier !== "left") {
    nextSegments = writePeriodSegment(nextSegments, returning.id, q, "entered");
  }
  if (gkId) nextSegments = writePeriodSegment(nextSegments, gkId, q, null);
  return { lineups: nextLineups, segments: nextSegments };
}

function clearReturnAt(player) {
  if (!player || !Object.prototype.hasOwnProperty.call(player, "returnAt")) return player;
  const next = { ...player };
  delete next.returnAt;
  return next;
}

/**
 * Top-of-screen and roster Return buttons both use this.
 * The player becomes available. When auto-regenerate is on, the sheet rebuilds
 * from the current period forward. When it is off, only the status changes.
 * `half: "back"` keeps the whole-quarter plan for later periods and brings the
 * player on at this period's half. Omit half, or pass "whole", for today's return.
 */
export function returnToGame({
  source = "roster",
  autoRegen = true,
  players = [],
  playerId,
  quarter = 1,
  lineups = {},
  segments = {},
  totalQuarters = 4,
  slots,
  slotsByQuarter = null,
  subMode = true,
  minHalves = 4,
  rate = () => 0,
  livePeriod = false,
  protectedIds = [],
  half = "whole",
} = {}) {
  const q = Math.max(1, Number(quarter) || 1);
  const halfKind = half === "back" ? "back" : "whole";
  if (halfKind === "back" && !backHalfDonorAvailable({
    lineup: lineups?.[q] || lineups?.[String(q)],
    segments,
    quarter: q,
    returnerId: playerId,
    protectedIds,
    lineups,
    totalQuarters,
    rate,
  })) {
    return { source, players, lineups, segments, regenerated: false, refused: true };
  }
  const nextPlayers = (players || []).map(player => {
    if (player?.id !== playerId) return player;
    const next = {
      ...player,
      injured: false,
      midGameInjury: false,
      out: false,
      returnQuarter: q,
      injuredInQuarter: player.injuredInQuarter || player.returnQuarter || q,
    };
    if (halfKind === "back") next.returnAt = { quarter: q, half: "back" };
    else return clearReturnAt(next);
    return next;
  });
  if (!autoRegen) {
    return { source, players: nextPlayers, lineups, segments, regenerated: false };
  }
  const planned = planAvailability({
    autoRegen: true,
    kind: "return",
    players: nextPlayers,
    absentId: playerId,
    quarter: q,
    totalQuarters,
    lineups,
    segments,
    slots,
    slotsByQuarter,
    subMode,
    minHalves,
    rate,
    livePeriod,
    protectedIds,
  });
  if (halfKind !== "back") {
    return {
      source,
      players: nextPlayers,
      lineups: planned.lineups,
      segments: planned.segments,
      regenerated: true,
    };
  }
  const adjusted = installBackHalfReturn({
    lineups: planned.lineups,
    segments: planned.segments,
    priorLineups: lineups,
    priorSegments: segments,
    returning: nextPlayers.find(player => player?.id === playerId),
    quarter: q,
    totalQuarters,
    rate,
    protectedIds,
  });
  return {
    source,
    players: nextPlayers,
    lineups: adjusted.lineups,
    segments: adjusted.segments,
    regenerated: true,
  };
}

/**
 * Injury, out, or a return. With auto-regenerate on, rebuild from the current period forward.
 * With it off, an absence only pulls that player. A return only updates status and leaves the sheet.
 * A live period keeps its current goalkeeper unless that goalkeeper is the one leaving.
 */
export function planAvailability({
  autoRegen = true,
  kind = "absent",
  players,
  absentId,
  quarter = 1,
  totalQuarters = 4,
  lineups = {},
  segments = {},
  slots,
  slotsByQuarter = null,
  subMode = true,
  minHalves = 4,
  rate = () => 0,
  livePeriod = false,
  protectedIds = [],
} = {}) {
  const start = Math.max(1, Number(quarter) || 1);
  if (!autoRegen) {
    if (kind === "return") return { lineups, segments };
    return {
      lineups: pullFromPlan(lineups, absentId, start, totalQuarters),
      segments,
    };
  }
  const currentGk = goalkeeperId(lineups?.[start]);
  const lockGoalkeeperId = livePeriod && currentGk && currentGk !== absentId ? currentGk : null;
  return regenerateForAbsence({
    players,
    slots,
    slotsByQuarter,
    lineups,
    segments,
    absentId,
    fromQuarter: start,
    returnQuarter: kind === "return" ? start : null,
    minHalves,
    subMode,
    rate,
    totalQuarters,
    lockGoalkeeperId,
    livePeriod: !!livePeriod && kind === "return",
    protectedIds,
  });
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
  periods,
  periodType,
  formationOverrides,
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
      periods: periods || null,
      periodType: periodType || "",
      formationOverrides: formationOverrides || null,
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

function overallRating(player) {
  if (!player?.ratings) return 0;
  const vals = Object.values(player.ratings).filter(value => value > 0);
  return vals.length ? vals.reduce((sum, value) => sum + value, 0) / vals.length : 0;
}

/**
 * Full-period plan. Every eligible player is targeted for the minimum before
 * extra periods go to higher-rated players. `lockGoalkeeperId` keeps that
 * keeper in goal for the first period being rebuilt (a live replan).
 * Half marks already stored for that period keep those players on or off the field.
 */
export function scheduleWholeGame({
  players = [],
  format,
  lockedLineups = {},
  fromQuarter = 1,
  segments = {},
  credit = {},
  slotOverride = null,
  totalPeriods = 4,
  minFraction = 0.5,
  slotsByQuarter = null,
  seed = null,
  lockGoalkeeperId = null,
  rate = overallRating,
} = {}) {
  const totalQ = totalPeriods;
  const fallback = defaultSlots(playersFromFormat(format) || 7, true);
  const slots = slotOverride?.length ? slotOverride : fallback;
  const slotsPerQ = slots.length;
  const minQ = Math.ceil(minFraction * totalQ);
  const score = typeof rate === "function" ? rate : overallRating;
  const rng = seed == null ? Math.random : seededRandom(seed);
  const shuffle = (arr) => {
    const copy = [...arr];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  };
  const active = shuffle((players || []).filter(player => !player.injured && !player.out));
  const minHalves = minQ * 2;
  const lockedQuarters = [];
  for (let q = 1; q < fromQuarter; q++) if (lockedLineups[q]) lockedQuarters.push(q);
  const alreadyHalves = {};
  active.forEach(player => {
    alreadyHalves[player.id] = equityHalves(player.id, {
      lineups: lockedLineups,
      segments,
      credit,
      quarters: lockedQuarters,
    });
  });
  const remainingQs = [];
  for (let q = fromQuarter; q <= totalQ; q++) remainingQs.push(q);
  const keeperPlayer = lockGoalkeeperId
    ? active.find(player => player.id === lockGoalkeeperId) || null
    : null;
  const liveChoice = livePeriodChoice(
    active,
    slotsPerQ,
    feasibleHalfLocks(segments, fromQuarter, active, slotsPerQ, keeperPlayer ? [keeperPlayer] : []),
    keeperPlayer,
    shuffle,
  );
  if (liveChoice) {
    const onField = new Set(liveChoice.chosen);
    active.forEach(player => {
      const id = player.id;
      const halves = liveChoice.left.has(id) || liveChoice.entered.has(id) ? 1 : onField.has(id) ? 2 : 0;
      alreadyHalves[id] = (alreadyHalves[id] || 0) + halves;
    });
  }
  const planQs = liveChoice ? remainingQs.filter(q => q !== fromQuarter) : remainingQs;
  const periodsLeft = planQs.length;
  const totalSlots = slotsPerQ * periodsLeft;
  const quota = {};
  active.forEach(player => {
    const remainingHalves = Math.max(0, minHalves - (alreadyHalves[player.id] || 0));
    quota[player.id] = Math.min(Math.ceil(remainingHalves / 2), periodsLeft);
  });
  let freeSlots = Math.max(0, totalSlots - Object.values(quota).reduce((sum, n) => sum + n, 0));
  const rated = [...active].sort((a, b) => score(b) - score(a));
  const bonusQ = {};
  active.forEach(player => { bonusQ[player.id] = 0; });
  let round = 0;
  while (freeSlots > 0 && round < 100) {
    let distributed = false;
    for (const player of rated) {
      if (quota[player.id] + bonusQ[player.id] < periodsLeft) {
        bonusQ[player.id] += 1;
        freeSlots -= 1;
        distributed = true;
        if (freeSlots === 0) break;
      }
    }
    if (!distributed) break;
    round += 1;
  }
  const qCount = {};
  active.forEach(player => { qCount[player.id] = quota[player.id] + bonusQ[player.id]; });
  const quarterId = {};
  active.forEach(player => { quarterId[player.id] = new Set(); });
  const qRemaining = { ...qCount };
  const prevQ0 = fromQuarter - 1;
  let satLast = new Set(
    liveChoice
      ? active.filter(player => !liveChoice.chosen.includes(player.id)).map(player => player.id)
      : prevQ0 >= 1 && lockedLineups[prevQ0]
        ? active
          .filter(player => !(lockedLineups[prevQ0].starters || []).some(slot => slot.player?.id === player.id))
          .map(player => player.id)
        : []
  );
  planQs.forEach(q => {
    const chosen = [];
    const eligible = () => active.filter(player => qRemaining[player.id] > 0 && !chosen.includes(player.id));
    eligible()
      .filter(player => satLast.has(player.id))
      .sort((a, b) => qRemaining[b.id] - qRemaining[a.id] || score(b) - score(a))
      .forEach(player => {
        if (chosen.length < slotsPerQ) chosen.push(player.id);
      });
    eligible()
      .sort((a, b) => qRemaining[b.id] - qRemaining[a.id] || score(b) - score(a))
      .forEach(player => {
        if (chosen.length < slotsPerQ) chosen.push(player.id);
      });
    chosen.forEach(id => {
      quarterId[id].add(q);
      qRemaining[id] -= 1;
    });
    satLast = new Set(active.filter(player => !chosen.includes(player.id)).map(player => player.id));
  });

  const result = { ...lockedLineups };
  const lastPos = {};
  if (prevQ0 >= 1 && lockedLineups[prevQ0]) {
    (lockedLineups[prevQ0].starters || []).forEach(slot => {
      if (slot.player) lastPos[slot.player.id] = slot.pos;
    });
  }
  const assignQuarter = (q, starterIds) => {
    const idSet = new Set(starterIds);
    const startersPool = active.filter(player => idSet.has(player.id));
    const bench = active.filter(player => !idSet.has(player.id));
    const chosenPos = {};
    startersPool.forEach(player => {
      const allowed = player.positions?.length ? player.positions : ["CM"];
      const fresh = allowed.filter(pos => pos !== lastPos[player.id]);
      const pool = fresh.length ? fresh : allowed;
      chosenPos[player.id] = pool[Math.floor(rng() * pool.length)];
    });
    const assigned = new Set();
    const shuffledPool = shuffle(startersPool);
    const custom = slotsByQuarter?.[q] || slotsByQuarter?.[String(q)];
    const quarterSlots = Array.isArray(custom) && custom.length === slots.length ? custom : slots;
    const starters = quarterSlots.map(slotPos => {
      let pick = shuffledPool.find(player => !assigned.has(player.id) && chosenPos[player.id] === slotPos);
      if (!pick) pick = shuffledPool.find(player => !assigned.has(player.id) && (player.positions || []).includes(slotPos));
      if (!pick) pick = shuffledPool.find(player => !assigned.has(player.id));
      if (pick) {
        assigned.add(pick.id);
        lastPos[pick.id] = slotPos;
      }
      return { pos: slotPos, player: pick || null };
    });
    return { starters, bench };
  };
  if (liveChoice) {
    let lineup = assignQuarter(fromQuarter, liveChoice.chosen);
    if (keeperPlayer) lineup = pinNamedGoalkeeper(lineup, keeperPlayer.id, players);
    result[fromQuarter] = lineup;
  }
  planQs.forEach(q => {
    const startersPool = active.filter(player => quarterId[player.id].has(q));
    result[q] = assignQuarter(q, startersPool.map(player => player.id));
    if (!liveChoice && lockGoalkeeperId && q === fromQuarter) {
      result[q] = pinNamedGoalkeeper(result[q], lockGoalkeeperId, players);
    }
  });
  return result;
}

function livePeriodChoice(activePlayers, slotCount, locks, keeper, shuffle) {
  if (!locks || !slotCount) return null;
  const left = new Set(locks.left);
  const keeperId = keeper?.id || null;
  if (keeperId && left.has(keeperId)) return null;
  const entered = [];
  locks.entered.forEach(id => {
    if (id !== keeperId && !left.has(id) && !entered.includes(id)) entered.push(id);
  });
  const must = keeperId ? [keeperId] : [];
  entered.forEach(id => {
    if (!must.includes(id)) must.push(id);
  });
  if (must.length > slotCount) return null;
  const available = (activePlayers || []).filter(player => player?.id && !left.has(player.id));
  if (available.length < slotCount) return null;
  const chosen = [...must];
  shuffle(available.filter(player => !chosen.includes(player.id))).forEach(player => {
    if (chosen.length < slotCount) chosen.push(player.id);
  });
  if (chosen.length < slotCount) return null;
  if (chosen.some(id => left.has(id))) return null;
  return { chosen, entered: new Set(entered), left };
}
