import {
  equityHalves,
  formatQuarterEquity,
  periodClockState,
  periodHasRealEvent,
  realEventPlayerIds,
  realEventsAfterReturn,
  returnToGame,
} from "./gameDay.js";

function firstName(player) {
  return String(player?.name || "Player").trim().split(/\s+/)[0] || "Player";
}

/**
 * A quarter is live when its own clock has started, or it already has a real event.
 * The clock that counts is that quarter's clock, not whichever tab is open.
 */
export function quarterIsLive(quarter, {
  clocks = {},
  realEvents = {},
  viewingQuarter = 1,
  viewingClock = 0,
  running = false,
} = {}) {
  const q = Number(quarter);
  const saved = periodClockState(clocks, q).sec;
  const onScreen = q === Number(viewingQuarter);
  const clock = onScreen ? Math.max(saved, Number(viewingClock) || 0) : saved;
  const clockStarted = clock > 0 || (onScreen && !!running);
  return clockStarted || periodHasRealEvent(realEvents, q);
}

/**
 * Finished quarters are greyed out.
 * Before anything has started, nothing is finished.
 * A quarter is finished once a later quarter has started, or once this one
 * has started and the coach is looking at a later tab.
 */
export function finishedQuarterList({
  totalQuarters = 4,
  selectedQuarter = 1,
  clocks = {},
  realEvents = {},
  viewingClock = 0,
  running = false,
} = {}) {
  const total = Math.max(1, Number(totalQuarters) || 1);
  const selected = Number(selectedQuarter) || 1;
  const clock = { clocks, realEvents, viewingQuarter: selected, viewingClock, running };
  const started = [];
  for (let q = 1; q <= total; q++) {
    if (quarterIsLive(q, clock)) started.push(q);
  }
  if (!started.length) return [];
  const finished = [];
  for (let q = 1; q <= total; q++) {
    const laterStarted = started.some(item => item > q);
    const leftBehind = selected > q && started.includes(q);
    if (laterStarted || leftBehind) finished.push(q);
  }
  return finished;
}

/** Quarters before the player went out, and finished quarters, cannot be chosen. */
export function quarterChoices({
  totalQuarters = 4,
  selectedQuarter = 1,
  outSince = null,
  finished = [],
} = {}) {
  const total = Math.max(1, Number(totalQuarters) || 1);
  const since = Number(outSince) || 1;
  const finishedSet = new Set(finished || []);
  const choices = [];
  for (let q = 1; q <= total; q++) {
    const beforeOut = q < since;
    const isFinished = finishedSet.has(q);
    choices.push({
      quarter: q,
      disabled: beforeOut || isFinished,
      finished: isFinished,
      beforeOut,
    });
  }
  const selected = choices.find(choice => choice.quarter === Number(selectedQuarter) && !choice.disabled);
  return {
    choices,
    defaultQuarter: selected ? selected.quarter : null,
  };
}

export function returnHeading(player, periodAbbrev = "Q") {
  const since = Number(player?.injuredInQuarter) || null;
  const name = firstName(player);
  return {
    title: `Return #${player?.number ?? ""} ${name}`.replace(/\s+/g, " ").trim(),
    since: since ? `Out since ${periodAbbrev}${since}` : (player?.injured ? "Injured" : "Out"),
  };
}

export function mismatchCopy({ selectedQuarter, chosenQuarter, periodAbbrev = "Q" }) {
  return {
    text: `You're viewing ${periodAbbrev}${selectedQuarter}.`,
    switchLabel: `Switch to ${periodAbbrev}${chosenQuarter}`,
    keepLabel: `Keep ${periodAbbrev}${selectedQuarter} view`,
  };
}

export function availabilityCopy({
  quarter,
  subMode = true,
  totalQuarters = 4,
  periodAbbrev = "Q",
  live = false,
} = {}) {
  const abbr = periodAbbrev || "Q";
  const q = Number(quarter);
  const question = subMode
    ? `Available to sub in at the next rotation in ${abbr}${q}?`
    : `Ready to play in ${abbr}${q}?`;
  const yes = subMode
    ? (live
      ? `Yes — eligible for ${abbr}${q} 2nd half`
      : `Yes — eligible for ${abbr}${q}`)
    : `Yes — available in ${abbr}${q}`;
  const no = q >= Number(totalQuarters)
    ? "No — sit out the rest of the game."
    : `No — hold until ${abbr}${q + 1}`;
  return { question, yes, no };
}

export function pregameCopy(player) {
  return `Mark #${player?.number ?? ""} ${firstName(player)} available?`.replace(/\s+/g, " ").trim();
}

function fairPlayNote(state, player) {
  const minHalves = Number(state.minHalves) || 0;
  const minQ = Number(state.minQ) || 0;
  if (minQ <= 0 || minHalves <= 0) return null;
  const quarters = state.quarters || [];
  const halves = equityHalves(player.id, {
    lineups: state.lineups,
    segments: state.segments,
    credit: state.credit,
    quarters,
  });
  if (halves >= minHalves) return null;
  return `${firstName(player)} is at ${formatQuarterEquity(halves)} of ${minQ}. That's information only, not a fair-play violation.`;
}

function unchanged(state) {
  return {
    changed: false,
    regenerated: false,
    toast: null,
    fairInfo: null,
    players: state.players,
    lineups: state.lineups,
    segments: state.segments,
    realEvents: state.realEvents,
  };
}

function clearedPlayer(player, extra = {}) {
  return {
    ...player,
    injured: false,
    out: false,
    midGameInjury: false,
    doneForToday: false,
    ...extra,
  };
}

/**
 * Apply one dialog answer. Cancel returns the same state.
 * Live is judged for the chosen quarter. A Return does not set a real-event flag.
 * Full mode with a live quarter and Yes uses returnToGame, the same path as main:
 * that period is replanned with the returner on the field and the goalkeeper kept.
 */
export function commitReturn(state, choice) {
  if (!choice || choice.type === "cancel") return unchanged(state);
  const player = (state.players || []).find(item => item?.id === state.playerId);
  if (!player) return unchanged(state);

  if (!state.hasSheet || choice.type === "mark-available") {
    return {
      changed: true,
      regenerated: false,
      toast: `${firstName(player)} is available.`,
      fairInfo: null,
      players: state.players.map(item => (item.id === player.id ? clearedPlayer(item, { returnQuarter: null }) : item)),
      lineups: state.lineups,
      segments: state.segments,
      realEvents: state.realEvents,
    };
  }

  const quarter = Number(choice.quarter);
  const available = choice.available;
  if (!quarter || available == null) return unchanged(state);
  const total = Math.max(1, Number(state.totalQuarters) || 1);
  const live = quarterIsLive(quarter, state);

  if (available === false && quarter >= total) {
    const stayOut = player.out || !player.injured;
    return {
      changed: true,
      regenerated: false,
      toast: `${firstName(player)} is done for today.`,
      fairInfo: fairPlayNote(state, player),
      players: state.players.map(item => (item.id === player.id ? {
        ...item,
        doneForToday: true,
        out: stayOut ? true : item.out,
        returnQuarter: null,
      } : item)),
      lineups: state.lineups,
      segments: state.segments,
      realEvents: state.realEvents,
    };
  }

  const returnQuarter = available ? quarter : quarter + 1;

  if (!state.autoRegen) {
    const result = returnToGame({
      source: state.source,
      autoRegen: false,
      players: state.players,
      playerId: player.id,
      quarter: returnQuarter,
      totalQuarters: total,
      lineups: state.lineups,
      segments: state.segments,
    });
    return {
      changed: true,
      regenerated: false,
      toast: "Replan to include them.",
      fairInfo: null,
      players: result.players.map(item => (item.id === player.id ? { ...item, doneForToday: false } : item)),
      lineups: state.lineups,
      segments: state.segments,
      realEvents: state.realEvents,
    };
  }

  const targetLive = quarterIsLive(returnQuarter, state);
  const result = returnToGame({
    source: state.source,
    autoRegen: true,
    players: state.players,
    playerId: player.id,
    quarter: returnQuarter,
    totalQuarters: total,
    lineups: state.lineups,
    segments: state.segments,
    slots: state.slots,
    slotsByQuarter: state.slotsByQuarter,
    subMode: state.subMode !== false,
    minHalves: state.minHalves,
    rate: state.rate,
    livePeriod: targetLive,
    protectedIds: realEventPlayerIds(state.realEvents, returnQuarter),
  });
  const events = result.regenerated
    ? realEventsAfterReturn(state.realEvents, { quarter: returnQuarter, regenerated: true })
    : state.realEvents;
  return {
    changed: true,
    regenerated: !!result.regenerated,
    toast: returnToast({ player, quarter, available, subMode: state.subMode !== false, live, total, periodAbbrev: state.periodAbbrev }),
    fairInfo: null,
    players: result.players.map(item => (item.id === player.id ? { ...item, doneForToday: false } : item)),
    lineups: result.lineups,
    segments: result.segments,
    realEvents: events,
  };
}

export function returnToast({
  player,
  quarter,
  available,
  subMode = true,
  live = false,
  total = 4,
  periodAbbrev = "Q",
}) {
  const name = firstName(player);
  const abbr = periodAbbrev || "Q";
  if (available === false && quarter >= total) return `${name} is done for today.`;
  if (subMode && available && live) return `${name} back for ${abbr}${quarter}, 2nd half.`;
  if (available === false) return `${name} held until ${abbr}${quarter + 1}.`;
  return `${name} back for ${abbr}${quarter}.`;
}
