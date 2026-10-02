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
 * A quarter is live when its own clock has started, or it has its own real event.
 * A flag on another quarter does not count, including a swap at 0:00.
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

function quarterElapsed(quarter, clockState) {
  const q = Number(quarter);
  const saved = periodClockState(clockState.clocks, q).sec;
  const onScreen = q === Number(clockState.viewingQuarter);
  const clock = onScreen ? Math.max(saved, Number(clockState.viewingClock) || 0) : saved;
  const started = clock > 0 || (onScreen && !!clockState.running);
  return { clock, started };
}

/** This quarter's own clock, using the same on-screen rule as quarterIsLive. */
export function quarterClockSec(quarter, state = {}) {
  return quarterElapsed(quarter, state).clock;
}

/**
 * Which return choices are open.
 * A finished or too-early quarter closes both.
 * A live quarter before its own half offers both.
 * At or past the half, with the half sub still pending, only the 2nd half is open.
 * Once the clock is past the half and that half sub is active or applied, both close.
 */
export function returnOptionAvailability({
  disabled = false,
  live = false,
  clock = 0,
  periodSeconds = 0,
  halfApplied = false,
} = {}) {
  if (disabled) return { whole: false, back: false };
  if (!live) return { whole: true, back: true };
  const half = (Number(periodSeconds) || 0) / 2;
  const sec = Number(clock) || 0;
  if (!(half > 0) || sec < half) return { whole: true, back: true };
  if (sec > half && halfApplied) return { whole: false, back: false };
  return { whole: false, back: true };
}

/**
 * A quarter is finished when its own clock has run to the end of the period,
 * or a later quarter's own clock has started (the period was advanced past).
 * Real-event flags never finish a quarter.
 */
export function finishedQuarterList({
  totalQuarters = 4,
  selectedQuarter = 1,
  clocks = {},
  viewingClock = 0,
  running = false,
  periodSeconds = 0,
} = {}) {
  const total = Math.max(1, Number(totalQuarters) || 1);
  const selected = Number(selectedQuarter) || 1;
  const duration = Number(periodSeconds) || 0;
  const clockState = { clocks, viewingQuarter: selected, viewingClock, running };
  const elapsed = [];
  for (let q = 1; q <= total; q++) elapsed.push(quarterElapsed(q, clockState));
  const finished = [];
  for (let q = 1; q <= total; q++) {
    const own = elapsed[q - 1];
    const ranToEnd = duration > 0 && own.clock >= duration;
    const advancedPast = elapsed.slice(q).some(item => item.started);
    if (ranToEnd || advancedPast) finished.push(q);
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

/**
 * A mismatch is about the quarter on screen, not which half.
 * Back half of Q2 while viewing Q2 is the same quarter, so the first half is not a mismatch.
 */
export function returnMismatch({ selectedQuarter, chosenQuarter, periodAbbrev = "Q" } = {}) {
  if (Number(selectedQuarter) === Number(chosenQuarter)) return null;
  return mismatchCopy({ selectedQuarter, chosenQuarter, periodAbbrev });
}

export function availabilityCopy({
  quarter,
  subMode = true,
  totalQuarters = 4,
  periodAbbrev = "Q",
  live = false,
  name = "",
  half = "whole",
} = {}) {
  const abbr = periodAbbrev || "Q";
  const q = Number(quarter);
  const who = String(name || "them").trim().split(/\s+/)[0] || "them";
  const no = q >= Number(totalQuarters)
    ? "No — sit out the rest of the game."
    : `No — hold until ${abbr}${q + 1}`;
  if (half === "back") {
    const question = subMode
      ? `Available to sub in at the half in ${abbr}${q}?`
      : `Ready for the 2nd half of ${abbr}${q}?`;
    const yes = subMode
      ? `Yes — eligible for the 2nd half of ${abbr}${q}`
      : `Yes — available for the 2nd half of ${abbr}${q}`;
    const helper = `Comes on at the half of ${abbr}${q}. The goalkeeper stays in goal.`;
    return { question, yes, no, helper };
  }
  const question = subMode
    ? `Available to sub in at the next rotation in ${abbr}${q}?`
    : `Ready to play in ${abbr}${q}?`;
  const yes = subMode
    ? `Yes — eligible for ${abbr}${q}`
    : `Yes — available in ${abbr}${q}`;
  const helper = subMode && live
    ? `Re-plans this quarter with ${who} on the field. Keeps the goalkeeper.`
    : null;
  return { question, yes, no, helper };
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
  const next = {
    ...player,
    injured: false,
    out: false,
    midGameInjury: false,
    doneForToday: false,
    ...extra,
  };
  delete next.returnAt;
  return next;
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
      players: state.players.map(item => {
        if (item.id !== player.id) return item;
        const next = {
          ...item,
          doneForToday: true,
          out: stayOut ? true : item.out,
          returnQuarter: null,
        };
        delete next.returnAt;
        return next;
      }),
      lineups: state.lineups,
      segments: state.segments,
      realEvents: state.realEvents,
    };
  }

  const returnQuarter = available ? quarter : quarter + 1;
  const half = available && choice.half === "back" ? "back" : "whole";

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
      half,
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
    half,
  });
  const events = result.regenerated
    ? realEventsAfterReturn(state.realEvents, { quarter: returnQuarter, regenerated: true })
    : state.realEvents;
  return {
    changed: true,
    regenerated: !!result.regenerated,
    toast: returnToast({
      player,
      quarter,
      available,
      subMode: state.subMode !== false,
      live,
      total,
      periodAbbrev: state.periodAbbrev,
      half,
    }),
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
  half = "whole",
}) {
  const name = firstName(player);
  const abbr = periodAbbrev || "Q";
  if (available === false && quarter >= total) return `${name} is done for today.`;
  if (half === "back" && available) return `${name} is back for the 2nd half of ${abbr}${quarter}.`;
  if (subMode && available && live) return `${name} is back. ${abbr}${quarter} re-planned.`;
  if (available === false) return `${name} held until ${abbr}${quarter + 1}.`;
  return `${name} back for ${abbr}${quarter}.`;
}
