import "./domSetup.js";
import test from "node:test";
import assert from "node:assert/strict";
import {
  applyBenchRotation,
  backHalfDonorAvailable,
  backHalfEarnedMinutes,
  backHalfShownPairs,
  equityHalves,
  goalkeeperId,
  isBackHalfReturn,
  isGkPosition,
  noteSubSegment,
  pairsForDisplay,
  periodHasRealEvent,
  planAvailability,
  planBenchRotation,
  playCellKind,
  playerHalfMask,
  playerQuarterPresence,
  quarterHalfPresentation,
  readReturn,
  realEventPlayerIds,
  pullFromPlan,
  benchReplacementId,
  clearSegmentQuarter,
  returnToGame,
  revalidateBackHalfMarks,
  backHalfStripNotice,
  clearPlayerSegmentsFrom,
  nextBackHalfNotice,
  scheduleHalfRotation,
  scheduleWholeGame,
  segmentsSavedForFullReplan,
  segmentAt,
  shareFieldSheet,
  stripReturnAtFrom,
  stripReturnAtForQuarter,
  vacatedSpotHolder,
} from "./gameDay.js";
import { redrawQuarterMembership } from "./fairPlay.js";
import { backHalfStatusNotice, markInjured, markOut } from "./playerStatus.js";
import { formationKey, sameAfterLineup, viewAfterSubs, withBackHalfShare } from "./afterSubs.js";
import {
  availabilityCopy,
  commitReturn,
  finishedQuarterList,
  initialReturnSelection,
  mismatchCopy,
  pregameCopy,
  quarterChoices,
  quarterIsLive,
  returnHeading,
  returnMismatch,
  returnOptionAvailability,
} from "./returnDialog.js";

const SLOTS = ["GK", "LD", "RD", "LM", "RM", "CF"];

function roster(count = 9) {
  const positions = ["GK", "LD", "RD", "LM", "RM", "CM", "CF", "LW", "RW", "ST", "LB", "RB"];
  return Array.from({ length: count }, (_, i) => ({
    id: `p${i + 1}`,
    name: `P${i + 1} Player`,
    number: String(i + 1),
    positions,
    injured: false,
    out: false,
  }));
}

function openSheet(players, subMode, seed = 3, slots = SLOTS, format = "6v6") {
  if (subMode) {
    return scheduleHalfRotation(players, slots, { minHalves: 4, totalQuarters: 4, seed });
  }
  return {
    lineups: scheduleWholeGame({
      players,
      format,
      slotOverride: slots,
      totalPeriods: 4,
      minFraction: 0.5,
      seed,
    }),
    segments: {},
  };
}

function sheetWithAbsence({ subMode, outFrom = 1, seed = 3, count = 9 }) {
  const players = roster(count);
  const opened = openSheet(players, subMode, seed);
  const id = opened.lineups[1].bench[0].id;
  const absent = players.map(player => (
    player.id === id
      ? { ...player, out: true, injured: false, injuredInQuarter: outFrom, returnQuarter: null }
      : player
  ));
  const planned = planAvailability({
    autoRegen: true,
    kind: "absent",
    players: absent,
    slots: SLOTS,
    lineups: opened.lineups,
    segments: opened.segments,
    absentId: id,
    quarter: outFrom,
    minHalves: 4,
    subMode,
    totalQuarters: 4,
    livePeriod: false,
  });
  return { id, players: absent, lineups: planned.lineups, segments: planned.segments, subMode };
}

function baseState(sheet, extra = {}) {
  return {
    players: sheet.players,
    lineups: sheet.lineups,
    segments: sheet.segments,
    realEvents: extra.realEvents || {},
    credit: {},
    playerId: sheet.id,
    source: "roster",
    totalQuarters: 4,
    subMode: sheet.subMode,
    autoRegen: true,
    hasSheet: true,
    slots: SLOTS,
    minHalves: 4,
    minQ: 2,
    quarters: [1, 2, 3, 4],
    periodAbbrev: "Q",
    clocks: extra.clocks || {},
    viewingQuarter: extra.viewingQuarter || 1,
    viewingClock: extra.viewingClock || 0,
    running: false,
    ...extra,
  };
}

function starterIds(lineup) {
  return (lineup?.starters || []).map(slot => slot.player?.id || null);
}

function swapFieldBench(lineup, outId, inId) {
  const starters = lineup.starters.map(slot => ({ ...slot }));
  const idx = starters.findIndex(slot => slot.player?.id === outId);
  const bench = [...(lineup.bench || [])];
  const bIdx = bench.findIndex(player => player.id === inId);
  const incoming = bench[bIdx];
  const outgoing = starters[idx].player;
  starters[idx] = { ...starters[idx], player: incoming };
  bench[bIdx] = outgoing;
  return { starters, bench };
}

function flagIdsDidNotGrow(before, after) {
  const quarters = new Set([...Object.keys(before || {}), ...Object.keys(after || {})]);
  quarters.forEach(quarter => {
    const prev = new Set(realEventPlayerIds(before, quarter));
    realEventPlayerIds(after, quarter).forEach(id => {
      assert.equal(prev.has(id), true, `quarter ${quarter} gained ${id}`);
    });
  });
}

test("finished quarters and quarters before the player went out are disabled", () => {
  assert.deepEqual(finishedQuarterList({ totalQuarters: 4, selectedQuarter: 2 }), []);
  const finished = finishedQuarterList({
    totalQuarters: 4,
    selectedQuarter: 3,
    clocks: { 1: { sec: 40, stints: {} }, 2: { sec: 15, stints: {} } },
    periodSeconds: 600,
  });
  assert.deepEqual(finished, [1]);
  const ended = finishedQuarterList({
    totalQuarters: 4,
    selectedQuarter: 1,
    clocks: { 1: { sec: 600, stints: {} } },
    periodSeconds: 600,
  });
  assert.deepEqual(ended, [1]);
  assert.equal(quarterIsLive(2, { realEvents: { 2: ["p1"] }, viewingQuarter: 3 }), true);
  assert.equal(quarterIsLive(2, { realEvents: { 3: ["p1"] }, viewingQuarter: 2 }), false);
  assert.equal(quarterIsLive(2, { clocks: { 2: { sec: 90 } }, viewingQuarter: 3 }), true);
  assert.equal(quarterIsLive(3, { clocks: { 1: { sec: 10 } }, viewingQuarter: 3, viewingClock: 0 }), false);
  const viewedPast = finishedQuarterList({
    totalQuarters: 4,
    selectedQuarter: 2,
    clocks: { 1: { sec: 12, stints: {} } },
    periodSeconds: 600,
  });
  assert.deepEqual(viewedPast, []);
  const q3Started = finishedQuarterList({
    totalQuarters: 4,
    selectedQuarter: 3,
    clocks: { 3: { sec: 1, stints: {} } },
    periodSeconds: 600,
  });
  assert.deepEqual(q3Started, [1, 2]);
  const { choices, defaultQuarter } = quarterChoices({
    totalQuarters: 4,
    selectedQuarter: 3,
    outSince: 2,
    finished: [1, 2],
  });
  assert.equal(choices.find(choice => choice.quarter === 1).disabled, true);
  assert.equal(choices.find(choice => choice.quarter === 2).disabled, true);
  assert.equal(choices.find(choice => choice.quarter === 2).finished, true);
  assert.equal(choices.find(choice => choice.quarter === 3).disabled, false);
  assert.equal(defaultQuarter, 3);
  const blocked = quarterChoices({ totalQuarters: 4, selectedQuarter: 1, outSince: 2, finished: [1] });
  assert.equal(blocked.defaultQuarter, null);
  assert.equal(blocked.choices[0].disabled, true);
});

test("the dialog copy follows the quarter, the mode, and a mismatch", () => {
  const player = { number: "7", name: "Remi Stone", injuredInQuarter: 1, out: true };
  assert.equal(returnHeading(player).title, "Return #7 Remi");
  assert.equal(returnHeading(player).since, "Out since Q1");
  assert.equal(pregameCopy(player), "Mark #7 Remi available?");
  const sub = availabilityCopy({ quarter: 3, subMode: true, totalQuarters: 4, live: true, name: "Wes Johnson" });
  assert.equal(sub.question, "Available to sub in at the next rotation in Q3?");
  assert.equal(sub.yes, "Yes — eligible for Q3");
  assert.equal(sub.helper, "Re-plans this quarter with Wes on the field. Keeps the goalkeeper.");
  assert.equal(sub.no, "No — hold until Q4");
  const full = availabilityCopy({ quarter: 3, subMode: false, totalQuarters: 4 });
  assert.equal(full.question, "Ready to play in Q3?");
  assert.equal(full.yes, "Yes — available in Q3");
  const last = availabilityCopy({ quarter: 4, subMode: true, totalQuarters: 4, live: false });
  assert.equal(last.no, "No — sit out the rest of the game.");
  assert.equal(last.yes, "Yes — eligible for Q4");
  const warn = mismatchCopy({ selectedQuarter: 2, chosenQuarter: 3 });
  assert.equal(warn.text, "You're viewing Q2.");
  assert.equal(warn.switchLabel, "Switch to Q3");
  assert.equal(warn.keepLabel, "Keep Q2 view");
});

test("cancel leaves every piece of state untouched", () => {
  [true, false].forEach(subMode => {
    const sheet = sheetWithAbsence({ subMode });
    const state = baseState(sheet, { realEvents: { 1: ["p1"], 3: ["p2"] } });
    const result = commitReturn(state, { type: "cancel" });
    assert.equal(result.changed, false);
    assert.equal(result.players, state.players);
    assert.equal(result.lineups, state.lineups);
    assert.equal(result.segments, state.segments);
    assert.equal(result.realEvents, state.realEvents);
    assert.equal(result.toast, null);
  });
});

test("a pre-game return with no sheet only clears status", () => {
  [true, false].forEach(subMode => {
    const players = roster(8).map((player, index) => (
      index === 0 ? { ...player, out: true, number: "7", name: "Remi Stone" } : player
    ));
    const state = baseState({
      id: players[0].id,
      players,
      lineups: {},
      segments: {},
      subMode,
    }, { hasSheet: false, autoRegen: true, realEvents: { 1: ["kept"] } });
    const result = commitReturn(state, { type: "mark-available" });
    const player = result.players.find(item => item.id === players[0].id);
    assert.equal(player.out, false);
    assert.equal(player.injured, false);
    assert.equal(player.doneForToday, false);
    assert.equal(result.regenerated, false);
    assert.equal(result.lineups, state.lineups);
    assert.equal(result.realEvents, state.realEvents);
    assert.equal(result.toast, "Remi is available.");
  });
});

test("auto-regen off updates status only and asks for a replan", () => {
  [true, false].forEach(subMode => {
    const sheet = sheetWithAbsence({ subMode, outFrom: 1 });
    const state = baseState(sheet, { autoRegen: false, realEvents: { 3: ["later"] } });
    const yes = commitReturn(state, { type: "confirm", quarter: 2, available: true });
    assert.equal(yes.regenerated, false);
    assert.equal(yes.lineups, state.lineups);
    assert.equal(yes.realEvents, state.realEvents);
    assert.equal(yes.toast, "Replan to include them.");
    assert.equal(yes.players.find(player => player.id === sheet.id).returnQuarter, 2);
    assert.equal(yes.players.find(player => player.id === sheet.id).out, false);
    const no = commitReturn(state, { type: "confirm", quarter: 2, available: false });
    assert.equal(no.players.find(player => player.id === sheet.id).returnQuarter, 3);
    assert.equal(no.lineups, state.lineups);
    assert.equal(no.toast, "Replan to include them.");
  });
});

test("each return answer maps onto the existing return path", () => {
  [true, false].forEach(subMode => {
    const sheet = sheetWithAbsence({ subMode, outFrom: 1 });
    const events = { 1: ["early"], 3: ["later"] };
    const state = baseState(sheet, {
      realEvents: events,
      viewingQuarter: 2,
      clocks: {},
    });

    const notLive = commitReturn(state, { type: "confirm", quarter: 2, available: true });
    assert.equal(quarterIsLive(2, state), false);
    assert.equal(notLive.regenerated, true);
    assert.equal(notLive.players.find(player => player.id === sheet.id).returnQuarter, 2);
    assert.equal(notLive.players.find(player => player.id === sheet.id).out, false);
    assert.equal(periodHasRealEvent(notLive.realEvents, 3), false);
    assert.deepEqual(realEventPlayerIds(notLive.realEvents, 1), ["early"]);
    flagIdsDidNotGrow(events, notLive.realEvents);
    assert.notEqual(playerQuarterPresence(notLive.lineups[2], sheet.id), "blank");
    assert.match(notLive.toast, subMode ? /back for Q2/ : /back for Q2/);

    const held = commitReturn(state, { type: "confirm", quarter: 2, available: false });
    assert.equal(held.players.find(player => player.id === sheet.id).returnQuarter, 3);
    assert.deepEqual(starterIds(held.lineups[2]), starterIds(state.lineups[2]));
    assert.equal(playerQuarterPresence(held.lineups[2], sheet.id), "blank");
    assert.equal(periodHasRealEvent(held.realEvents, 1), true);
    flagIdsDidNotGrow(events, held.realEvents);
    assert.match(held.toast, /held until Q3/);

    const liveState = baseState(sheet, {
      realEvents: { 2: [goalkeeperId(sheet.lineups[2])] },
      clocks: { 2: { sec: 90, stints: {} } },
      viewingQuarter: 3,
      viewingClock: 0,
    });
    assert.equal(quarterIsLive(2, liveState), true);
    const beforeGk = goalkeeperId(sheet.lineups[2]);
    const liveYes = commitReturn(liveState, { type: "confirm", quarter: 2, available: true });
    assert.equal(goalkeeperId(liveYes.lineups[2]), beforeGk);
    assert.notEqual(goalkeeperId(liveYes.lineups[2]), sheet.id);
    const gkSlot = (liveYes.lineups[2].starters || []).find(slot => isGkPosition(slot.pos));
    assert.notEqual(gkSlot?.player?.id, sheet.id);
    flagIdsDidNotGrow(liveState.realEvents, liveYes.realEvents);
    assert.equal(periodHasRealEvent(liveYes.realEvents, 2), true);
    if (subMode) {
      assert.match(liveYes.toast, /is back\. Q2 re-planned\./);
    } else {
      const name = sheet.players.find(player => player.id === sheet.id).name.split(" ")[0];
      assert.equal(playerQuarterPresence(liveYes.lineups[2], sheet.id), "on");
      assert.equal(liveYes.toast, `${name} back for Q2.`);
      assert.notEqual(playerQuarterPresence(liveYes.lineups[3], sheet.id), "blank");
      assert.equal(realEventPlayerIds(liveYes.realEvents, 2).includes(sheet.id), false);
    }
  });
});

test("a 0:00 flag on the return quarter keeps that swap and leaves the flags unchanged", () => {
  [true, false].forEach(subMode => {
    const sheet = sheetWithAbsence({ subMode, outFrom: 1 });
    const quarterLineup = sheet.lineups[2];
    const keeper = goalkeeperId(quarterLineup);
    const outgoing = quarterLineup.starters.find(slot => (
      slot.player?.id && slot.player.id !== keeper && !isGkPosition(slot.pos)
    )).player;
    const incoming = quarterLineup.bench.find(player => player.id !== sheet.id);
    const lineups = {
      ...sheet.lineups,
      2: swapFieldBench(quarterLineup, outgoing.id, incoming.id),
    };
    const events = { 2: [outgoing.id, incoming.id] };
    const state = baseState({ ...sheet, lineups }, {
      realEvents: events,
      viewingQuarter: 2,
      viewingClock: 0,
      clocks: {},
    });
    assert.equal(quarterIsLive(2, state), true);
    assert.equal(quarterIsLive(1, state), false);
    assert.equal(quarterIsLive(3, state), false);
    const back = commitReturn(state, { type: "confirm", quarter: 2, available: true });
    const shared = {
      source: "roster",
      autoRegen: true,
      players: state.players,
      playerId: sheet.id,
      quarter: 2,
      totalQuarters: 4,
      lineups,
      segments: state.segments,
      slots: SLOTS,
      subMode,
      minHalves: 4,
    };
    const live = returnToGame({
      ...shared,
      livePeriod: true,
      protectedIds: [outgoing.id, incoming.id],
    });
    assert.deepEqual(starterIds(back.lineups[2]), starterIds(live.lineups[2]));
    assert.equal(goalkeeperId(back.lineups[2]), goalkeeperId(lineups[2]));
    assert.deepEqual(realEventPlayerIds(back.realEvents, 2), [outgoing.id, incoming.id]);
    assert.deepEqual(back.realEvents, events);
    if (subMode) {
      const cold = returnToGame({ ...shared, livePeriod: false, protectedIds: [] });
      assert.notEqual(goalkeeperId(cold.lineups[2]), goalkeeperId(lineups[2]));
    }
  });
});

test("a pre-kickoff swap in a later quarter does not finish earlier ones", () => {
  [true, false].forEach(subMode => {
    const sheet = sheetWithAbsence({ subMode, outFrom: 1 });
    const keeper = goalkeeperId(sheet.lineups[3]);
    const swapped = (sheet.lineups[3].starters || [])
      .map(slot => slot.player?.id)
      .filter(id => id && id !== keeper)
      .slice(0, 2);
    const events = { 3: swapped };
    const state = baseState(sheet, {
      realEvents: events,
      viewingQuarter: 3,
      viewingClock: 0,
      clocks: { 1: { sec: 120, stints: {} } },
    });
    const finished = finishedQuarterList({
      totalQuarters: 4,
      selectedQuarter: 3,
      clocks: state.clocks,
      viewingClock: 0,
      periodSeconds: 600,
    });
    assert.deepEqual(finished, []);
    assert.equal(quarterIsLive(3, state), true);
    assert.equal(quarterIsLive(2, state), false);
    assert.equal(quarterIsLive(1, { ...state, viewingQuarter: 3, viewingClock: 0 }), true);
    assert.equal(quarterIsLive(1, { clocks: state.clocks, viewingQuarter: 1, viewingClock: 120 }), true);
    const choices = quarterChoices({ totalQuarters: 4, selectedQuarter: 3, outSince: 1, finished });
    assert.equal(choices.defaultQuarter, 3);
    assert.equal(choices.choices.find(choice => choice.quarter === 1).disabled, false);
    assert.equal(choices.choices.find(choice => choice.quarter === 2).disabled, false);
    assert.equal(choices.choices.find(choice => choice.quarter === 1).finished, false);

    const back = commitReturn(state, { type: "confirm", quarter: 2, available: true });
    assert.equal(quarterIsLive(2, state), false);
    assert.equal(periodHasRealEvent(back.realEvents, 3), false);
    assert.equal(periodHasRealEvent(back.realEvents, 4), false);
    const shared = {
      source: "roster",
      autoRegen: true,
      players: state.players,
      playerId: sheet.id,
      quarter: 2,
      totalQuarters: 4,
      lineups: state.lineups,
      segments: state.segments,
      slots: SLOTS,
      subMode,
      minHalves: 4,
    };
    const nonLive = returnToGame({ ...shared, livePeriod: false, protectedIds: [] });
    const pinned = returnToGame({
      ...shared,
      livePeriod: true,
      protectedIds: realEventPlayerIds(events, 2),
    });
    assert.equal(goalkeeperId(pinned.lineups[2]), goalkeeperId(state.lineups[2]));
    assert.deepEqual(starterIds(back.lineups[2]), starterIds(nonLive.lineups[2]));
    assert.equal(goalkeeperId(back.lineups[2]), goalkeeperId(nonLive.lineups[2]));
    if (goalkeeperId(nonLive.lineups[2]) !== goalkeeperId(pinned.lineups[2])) {
      assert.notEqual(goalkeeperId(back.lineups[2]), goalkeeperId(pinned.lineups[2]));
    }
  });
});

test("a full-mode live yes replans that period the same way main does", () => {
  const slots = ["GK", "LD", "CD", "RD", "LM", "RM", "CF"];
  const players = roster(10);
  const opened = scheduleWholeGame({
    players,
    format: "7v7",
    slotOverride: slots,
    totalPeriods: 3,
    minFraction: 0.5,
    seed: 4,
  });
  const id = opened[1].bench[0].id;
  const absent = players.map(player => (
    player.id === id
      ? { ...player, out: true, injured: false, injuredInQuarter: 1, returnQuarter: null }
      : player
  ));
  const planned = planAvailability({
    autoRegen: true,
    kind: "absent",
    players: absent,
    slots,
    lineups: opened,
    segments: {},
    absentId: id,
    quarter: 1,
    minHalves: 4,
    subMode: false,
    totalQuarters: 3,
    livePeriod: false,
  });
  const gk = goalkeeperId(planned.lineups[3]);
  const state = baseState({
    id,
    players: absent,
    lineups: planned.lineups,
    segments: planned.segments,
    subMode: false,
  }, {
    totalQuarters: 3,
    slots,
    minHalves: 4,
    minQ: 2,
    quarters: [1, 2, 3],
    viewingQuarter: 3,
    viewingClock: 40,
    realEvents: { 3: [gk] },
  });
  assert.equal(quarterIsLive(3, state), true);
  const liveYes = commitReturn(state, { type: "confirm", quarter: 3, available: true });
  const main = returnToGame({
    source: state.source,
    autoRegen: true,
    players: state.players,
    playerId: id,
    quarter: 3,
    totalQuarters: 3,
    lineups: state.lineups,
    segments: state.segments,
    slots,
    subMode: false,
    minHalves: 4,
    livePeriod: true,
    protectedIds: realEventPlayerIds(state.realEvents, 3),
  });
  assert.equal(playerQuarterPresence(liveYes.lineups[3], id), "on");
  assert.equal(playerQuarterPresence(main.lineups[3], id), "on");
  assert.equal(goalkeeperId(liveYes.lineups[3]), gk);
  assert.equal(goalkeeperId(main.lineups[3]), gk);
  const gkSlot = (liveYes.lineups[3].starters || []).find(slot => isGkPosition(slot.pos));
  assert.notEqual(gkSlot?.player?.id, id);
  [1, 2, 3].forEach(quarter => {
    assert.deepEqual(starterIds(liveYes.lineups[quarter]), starterIds(main.lineups[quarter]), `Q${quarter}`);
  });
  const quarters = [1, 2, 3];
  absent.forEach(player => {
    const dialogHalves = equityHalves(player.id, { lineups: liveYes.lineups, segments: liveYes.segments, credit: {}, quarters });
    const mainHalves = equityHalves(player.id, { lineups: main.lineups, segments: main.segments, credit: {}, quarters });
    assert.equal(dialogHalves, mainHalves, player.id);
    assert.equal(Math.max(0, 4 - dialogHalves), Math.max(0, 4 - mainHalves), `${player.id} shortfall`);
  });
  const returnerHalves = equityHalves(id, { lineups: liveYes.lineups, segments: liveYes.segments, credit: {}, quarters });
  assert.equal(Math.max(0, 4 - returnerHalves), Math.max(0, 4 - equityHalves(id, {
    lineups: main.lineups, segments: main.segments, credit: {}, quarters,
  })));
  assert.deepEqual(realEventPlayerIds(liveYes.realEvents, 3), [gk]);
  flagIdsDidNotGrow(state.realEvents, liveYes.realEvents);
  assert.equal(liveYes.players.find(player => player.id === id).out, false);
  assert.match(liveYes.toast, /back for Q3/);
});

test("the last quarter yes returns into that quarter and no means done for today", () => {
  [true, false].forEach(subMode => {
    const sheet = sheetWithAbsence({ subMode, outFrom: 1 });
    const events = { 4: ["keep-me"] };
    const state = baseState(sheet, { realEvents: events, viewingQuarter: 4 });
    const yes = commitReturn(state, { type: "confirm", quarter: 4, available: true });
    assert.equal(yes.players.find(player => player.id === sheet.id).out, false);
    assert.equal(yes.players.find(player => player.id === sheet.id).returnQuarter, 4);
    assert.equal(yes.players.find(player => player.id === sheet.id).doneForToday, false);
    assert.notEqual(playerQuarterPresence(yes.lineups[4], sheet.id), "blank");
    flagIdsDidNotGrow(events, yes.realEvents);
    const gk = goalkeeperId(sheet.lineups[4]);
    const liveState = baseState(sheet, {
      realEvents: { 4: [gk] },
      viewingQuarter: 4,
      viewingClock: 30,
    });
    const liveYes = commitReturn(liveState, { type: "confirm", quarter: 4, available: true });
    assert.equal(goalkeeperId(liveYes.lineups[4]), gk);
    assert.notEqual(goalkeeperId(liveYes.lineups[4]), sheet.id);

    const no = commitReturn(state, { type: "confirm", quarter: 4, available: false });
    const player = no.players.find(item => item.id === sheet.id);
    assert.equal(player.doneForToday, true);
    assert.equal(player.out, true);
    assert.equal(no.regenerated, false);
    assert.equal(no.lineups, state.lineups);
    assert.equal(no.segments, state.segments);
    assert.equal(no.realEvents, state.realEvents);
    assert.equal(no.toast, `${player.name.split(" ")[0]} is done for today.`);
    assert.match(no.fairInfo, /information only, not a fair-play violation/);
    assert.equal(no.fairInfo.includes("Fair-play warning"), false);
  });
});

function quarterHalves(playerId, lineups, segments, quarter) {
  return equityHalves(playerId, { lineups, segments, credit: {}, quarters: [quarter] });
}

function sameLaterQuarters(back, whole, fromQuarter, total = 4) {
  for (let q = fromQuarter + 1; q <= total; q++) {
    assert.deepEqual(starterIds(back.lineups[q]), starterIds(whole.lineups[q]), `Q${q} lineup`);
    const ids = new Set([
      ...Object.keys(back.segments || {}),
      ...Object.keys(whole.segments || {}),
    ]);
    ids.forEach(id => {
      assert.equal(segmentAt(back.segments, id, q), segmentAt(whole.segments, id, q), `${id} Q${q}`);
    });
  }
}

test("old saved returns with no half field read as the whole quarter", () => {
  assert.deepEqual(readReturn({ returnQuarter: 2 }), { quarter: 2, half: "whole" });
  assert.deepEqual(readReturn({ returnQuarter: 3, returnHalf: "back" }), { quarter: 3, half: "back" });
  assert.deepEqual(readReturn({ returnAt: { quarter: 2 } }), { quarter: 2, half: "whole" });
  assert.deepEqual(readReturn({ returnQuarter: 2, returnAt: { quarter: 2, half: "back" } }), { quarter: 2, half: "back" });
  assert.equal(readReturn({ returnQuarter: null }), null);
  assert.equal(isBackHalfReturn({ id: "p1", out: true, returnAt: { quarter: 2, half: "back" } }, 2), false);
});

test("back-half copy, greying, and mismatch understand halves without changing whole-quarter copy", () => {
  const sub = availabilityCopy({ quarter: 3, subMode: true, totalQuarters: 4, live: true, name: "Wes Johnson" });
  assert.equal(sub.question, "Available to sub in at the next rotation in Q3?");
  assert.equal(sub.yes, "Yes — eligible for Q3");
  assert.equal(sub.helper, "Re-plans this quarter with Wes on the field. Keeps the goalkeeper.");
  const back = availabilityCopy({ quarter: 2, subMode: true, totalQuarters: 4, half: "back", name: "Remi" });
  assert.equal(back.question, "Available to sub in at the half in Q2?");
  assert.equal(back.yes, "Yes — eligible for the 2nd half of Q2");
  assert.match(back.helper, /half of Q2/);
  assert.match(back.helper, /goalkeeper stays/);
  assert.equal(back.no, "No — hold until Q3");
  const last = availabilityCopy({ quarter: 4, subMode: false, totalQuarters: 4, half: "back" });
  assert.equal(last.no, "No — sit out the rest of the game.");
  assert.equal(last.yes, "Yes — available for the 2nd half of Q4");
  assert.equal(returnMismatch({ selectedQuarter: 2, chosenQuarter: 2 }), null);
  assert.equal(returnMismatch({ selectedQuarter: 1, chosenQuarter: 2 }).text, "You're viewing Q1.");
  assert.deepEqual(returnOptionAvailability({ disabled: true, live: true, clock: 10, periodSeconds: 600 }), { whole: false, back: false });
  assert.deepEqual(returnOptionAvailability({ live: false, clock: 500, periodSeconds: 600, halfApplied: true }), { whole: true, back: true });
  assert.deepEqual(returnOptionAvailability({ live: true, clock: 100, periodSeconds: 600 }), { whole: true, back: true });
  assert.deepEqual(returnOptionAvailability({ live: true, clock: 300, periodSeconds: 600 }), { whole: false, back: true });
  assert.deepEqual(returnOptionAvailability({ live: true, clock: 301, periodSeconds: 600, halfApplied: false }), { whole: false, back: true });
  assert.deepEqual(returnOptionAvailability({ live: true, clock: 301, periodSeconds: 600, halfApplied: true }), { whole: false, back: false });
  assert.deepEqual(returnOptionAvailability({ live: true, clock: 300, periodSeconds: 600, subMode: false }), { whole: false, back: true });
  assert.deepEqual(returnOptionAvailability({ live: true, clock: 301, periodSeconds: 600, subMode: false }), { whole: false, back: false });
  assert.deepEqual(initialReturnSelection([
    { quarter: 2, viewed: true, whole: false, back: false },
    { quarter: 3, whole: true, back: true },
  ]), { quarter: 3, half: "whole" });
  assert.deepEqual(initialReturnSelection([
    { quarter: 2, viewed: true, disabled: true, whole: false, back: false },
    { quarter: 3, whole: false, back: true },
  ]), { quarter: 3, half: "back" });
  assert.deepEqual(initialReturnSelection([
    { quarter: 1, disabled: true, whole: false, back: false },
    { quarter: 2, disabled: true, whole: false, back: false },
  ]), { quarter: null, half: "whole" });
  assert.deepEqual(initialReturnSelection([
    { quarter: 2, viewed: true, whole: true, back: true },
  ]), { quarter: 2, half: "whole" });
});

test("a whole-quarter return stays byte-identical when half is omitted or whole", () => {
  [true, false].forEach(subMode => {
    for (let seed = 1; seed <= 12; seed += 1) {
      const sheet = sheetWithAbsence({ subMode, outFrom: 1, seed });
      const state = baseState(sheet, { viewingQuarter: 2 });
      const plain = commitReturn(state, { type: "confirm", quarter: 2, available: true });
      const explicit = commitReturn(state, { type: "confirm", quarter: 2, available: true, half: "whole" });
      assert.deepEqual(explicit.lineups, plain.lineups);
      assert.deepEqual(explicit.segments, plain.segments);
      assert.equal(explicit.toast, plain.toast);
      assert.equal(explicit.players.find(player => player.id === sheet.id).returnQuarter, 2);
      assert.equal(explicit.players.find(player => player.id === sheet.id).returnAt, undefined);
      assert.deepEqual(readReturn(explicit.players.find(player => player.id === sheet.id)), { quarter: 2, half: "whole" });
    }
  });
});

test("a back-half return gives 0.5, keeps the goalkeeper, and leaves later quarters on the whole-quarter plan", () => {
  [true, false].forEach(subMode => {
    const sheet = sheetWithAbsence({ subMode, outFrom: 1 });
    const state = baseState(sheet, { viewingQuarter: 1, realEvents: { 1: ["early"] } });
    const whole = commitReturn(state, { type: "confirm", quarter: 2, available: true });
    const back = commitReturn(state, { type: "confirm", quarter: 2, available: true, half: "back" });
    const id = sheet.id;
    const player = back.players.find(item => item.id === id);
    assert.equal(player.out, false);
    assert.equal(player.returnQuarter, 2);
    assert.deepEqual(player.returnAt, { quarter: 2, half: "back" });
    assert.equal(back.toast, `${player.name.split(" ")[0]} is back for the 2nd half of Q2.`);
    assert.equal(quarterHalves(id, back.lineups, back.segments, 2), 1);
    assert.equal(playCellKind({
      onField: true,
      segment: segmentAt(back.segments, id, 2),
    }), "partial-on");
    assert.deepEqual(playerHalfMask(id, back.lineups[2], segmentAt(back.segments, id, 2)), [false, true]);
    const gk = goalkeeperId(sheet.lineups[2]);
    assert.equal(goalkeeperId(back.lineups[2]), gk);
    assert.notEqual(gk, id);
    const gkSlot = back.lineups[2].starters.find(slot => isGkPosition(slot.pos));
    assert.notEqual(gkSlot?.player?.id, id);
    assert.equal(segmentAt(back.segments, gk, 2), null);
    const donorId = back.lineups[2].bench.find(item => segmentAt(back.segments, item.id, 2) === "left")?.id
      || back.lineups[2].bench[0]?.id;
    const ranked = (sheet.lineups[2].starters || [])
      .filter(slot => {
        const slotId = slot.player?.id;
        if (!slotId || slotId === id || slotId === gk || isGkPosition(slot.pos)) return false;
        const mark = segmentAt(sheet.segments, slotId, 2);
        return mark !== "entered" && mark !== "left";
      })
      .map(slot => ({
        id: slot.player.id,
        halves: equityHalves(slot.player.id, {
          lineups: sheet.lineups,
          segments: sheet.segments,
          credit: {},
          quarters: [1, 2, 3, 4],
        }),
      }))
      .sort((a, b) => b.halves - a.halves || String(a.id).localeCompare(String(b.id)));
    assert.equal(donorId, ranked[0].id);
    assert.notEqual(donorId, gk);
    assert.equal(segmentAt(back.segments, donorId, 2), "left");
    assert.equal(quarterHalves(donorId, back.lineups, back.segments, 2), 1);
    assert.equal(playCellKind({ onField: false, segment: "left" }), "partial-off");
    assert.equal(playerQuarterPresence(back.lineups[2], id), "on");
    assert.equal(playerQuarterPresence(back.lineups[1], id), "blank");
    sameLaterQuarters(back, whole, 2);
    const view = quarterHalfPresentation(back.lineups[2], back.segments, 2, { returnerId: id });
    assert.equal(view.start.starters.some(slot => slot.player?.id === id), false);
    assert.equal(view.after.starters.some(slot => slot.player?.id === id), true);
    assert.equal(view.pairs[0].inId, id);
    assert.equal(view.pairs[0].outId, donorId);
    assert.equal(view.start.starters.some(slot => slot.player?.id === donorId), true);
    const restored = applyBenchRotation(view.start, view.pairs);
    assert.deepEqual(starterIds(restored), starterIds(back.lineups[2]));
    const after = viewAfterSubs(view.start, view.pairs, null);
    assert.equal(after.lineup.starters.some(slot => slot.player?.id === id), true);
    assert.equal(goalkeeperId(after.lineup), gk);
    const sheetShare = withBackHalfShare(
      shareFieldSheet({ lineups: back.lineups, subMode, quarters: [1, 2, 3, 4] }),
      { players: back.players, lineups: back.lineups, segments: back.segments },
    );
    const panel = sheetShare.quarters.find(item => item.quarter === 2);
    assert.equal(panel.starters.some(slot => slot.id === id), false);
    assert.equal(panel.after.starters.some(slot => slot.id === id), true);
    assert.equal(panel.pairs[0].inId, id);
    assert.equal(panel.pairs[0].outId, donorId);
  });
});

test("a live back-half return waits for the pending half sub and still keeps the goalkeeper", () => {
  [true, false].forEach(subMode => {
    const sheet = sheetWithAbsence({ subMode, outFrom: 1 });
    const gk = goalkeeperId(sheet.lineups[2]);
    const state = baseState(sheet, {
      viewingQuarter: 2,
      viewingClock: 400,
      clocks: { 2: { sec: 400, stints: {} } },
      realEvents: { 2: [gk] },
    });
    assert.equal(quarterIsLive(2, state), true);
    const back = commitReturn(state, { type: "confirm", quarter: 2, available: true, half: "back" });
    assert.equal(goalkeeperId(back.lineups[2]), gk);
    assert.equal(quarterHalves(sheet.id, back.lineups, back.segments, 2), 1);
    assert.deepEqual(playerHalfMask(sheet.id, back.lineups[2], segmentAt(back.segments, sheet.id, 2)), [false, true]);
    assert.match(back.toast, /2nd half of Q2/);
    const done = commitReturn(state, { type: "confirm", quarter: 4, available: false, half: "back" });
    assert.equal(done.players.find(player => player.id === sheet.id).doneForToday, true);
    assert.equal(done.toast.endsWith("is done for today."), true);
  });
});

test("a back-half quarter keeps the normal half pairs and adds the returner pair", () => {
  const sheet = sheetWithAbsence({ subMode: true, outFrom: 1 });
  const state = baseState(sheet, { viewingQuarter: 2 });
  const back = commitReturn(state, { type: "confirm", quarter: 2, available: true, half: "back" });
  const id = sheet.id;
  const view = quarterHalfPresentation(back.lineups[2], back.segments, 2, { returnerId: id });
  const pairs = backHalfShownPairs({
    start: view.start,
    returnerPair: view.pairs[0],
    nextLineup: back.lineups[3],
  });
  const donorId = view.pairs[0].outId;
  assert.equal(pairs[0].inId, id);
  assert.equal(pairs[0].outId, donorId);
  assert.equal(pairs.filter(pair => pair.outId === donorId).length, 1);
  assert.equal(pairs.filter(pair => pair.inId === id).length, 1);
  view.start.bench.forEach(player => {
    assert.equal(pairs.some(pair => pair.inId === player.id), true, player.id);
  });
  const shared = withBackHalfShare(
    shareFieldSheet({ lineups: back.lineups, pairPlan: {}, subMode: true }),
    { players: back.players, lineups: back.lineups, segments: back.segments, pairPlan: {}, subMode: true },
  );
  const panel = shared.quarters.find(item => item.quarter === 2);
  assert.equal(panel.pairs.length, pairs.length);
  panel.pairs.forEach((pair, index) => {
    assert.equal(pair.inId, pairs[index].inId);
    assert.equal(pair.outId, pairs[index].outId);
  });
  const stripped = stripReturnAtFrom(back.players, 1);
  const returned = stripped.find(player => player.id === id);
  assert.equal(returned.returnAt, undefined);
  assert.equal(returned.returnQuarter, 2);
  assert.equal(isBackHalfReturn(returned, 2), false);
  const afterPlan = pairsForDisplay(
    planBenchRotation(back.lineups[2], { nextLineup: back.lineups[3] }),
    [],
    back.lineups[2],
  );
  (back.lineups[2].bench || []).forEach(player => {
    assert.equal(afterPlan.some(pair => pair.inId === player.id), true, player.id);
  });
});

test("a quarter with no outfield donor refuses a back-half return", () => {
  const players = roster(8);
  const starters = players.slice(0, 6).map((player, index) => ({ pos: SLOTS[index], player }));
  const bench = players.slice(6);
  const segments = {};
  starters.forEach((slot, index) => {
    if (index === 0) return;
    segments[slot.player.id] = { 2: index % 2 ? "entered" : "left" };
  });
  const lineups = { 2: { starters, bench } };
  const returner = { ...bench[0], out: true, injured: false, injuredInQuarter: 1, returnQuarter: null };
  const rosterPlayers = players.map(player => (player.id === returner.id ? returner : player));
  assert.equal(backHalfDonorAvailable({
    lineup: lineups[2],
    segments,
    quarter: 2,
    returnerId: returner.id,
    lineups,
  }), false);
  const refused = returnToGame({
    players: rosterPlayers,
    playerId: returner.id,
    quarter: 2,
    half: "back",
    lineups,
    segments,
    slots: SLOTS,
    subMode: true,
    totalQuarters: 4,
  });
  assert.equal(refused.refused, true);
  assert.equal(refused.lineups, lineups);
  assert.equal(refused.players, rosterPlayers);
  assert.equal(refused.players.find(player => player.id === returner.id).returnAt, undefined);
  const state = baseState({
    id: returner.id,
    players: rosterPlayers,
    lineups,
    segments,
    subMode: true,
  }, { viewingQuarter: 2 });
  const viaDialog = commitReturn(state, { type: "confirm", quarter: 2, available: true, half: "back" });
  assert.equal(viaDialog.changed, false);
  assert.equal(viaDialog.lineups, lineups);
});

test("an injury in the same quarter keeps the earlier half when they return at the half", () => {
  const players = roster(9);
  const opened = openSheet(players, true, 3);
  const victim = opened.lineups[2].starters.find(slot => (
    slot.player && !isGkPosition(slot.pos) && !segmentAt(opened.segments, slot.player.id, 2)
  )).player;
  const absent = players.map(player => (
    player.id === victim.id
      ? { ...player, injured: true, out: false, injuredInQuarter: 2, returnQuarter: null }
      : player
  ));
  const gone = planAvailability({
    autoRegen: true,
    kind: "absent",
    players: absent,
    absentId: victim.id,
    quarter: 2,
    lineups: opened.lineups,
    segments: opened.segments,
    slots: SLOTS,
    subMode: true,
    minHalves: 4,
    totalQuarters: 4,
    livePeriod: true,
  });
  const marked = noteSubSegment(gone.segments, victim.id, 2, "left");
  assert.equal(segmentAt(marked, victim.id, 2), "left");
  assert.equal(quarterHalves(victim.id, gone.lineups, marked, 2), 1);
  const before = players.map(player => quarterHalves(player.id, gone.lineups, marked, 2));
  const back = returnToGame({
    players: absent,
    playerId: victim.id,
    quarter: 2,
    half: "back",
    lineups: gone.lineups,
    segments: marked,
    slots: SLOTS,
    subMode: true,
    minHalves: 4,
    totalQuarters: 4,
    livePeriod: true,
  });
  assert.notEqual(segmentAt(back.segments, victim.id, 2), "entered");
  assert.equal(quarterHalves(victim.id, back.lineups, back.segments, 2), 2);
  const donorId = back.lineups[2].bench.find(player => segmentAt(back.segments, player.id, 2) === "left"
    && quarterHalves(player.id, gone.lineups, marked, 2) === 2)?.id;
  assert.ok(donorId);
  assert.equal(quarterHalves(donorId, back.lineups, back.segments, 2), 1);
  const after = players.map(player => quarterHalves(player.id, back.lineups, back.segments, 2));
  assert.equal(after.reduce((sum, n) => sum + n, 0), before.reduce((sum, n) => sum + n, 0));
});

test("a back-half returner earns live minutes from the half, and the donor until then", () => {
  const halfSec = 300;
  const bank = {};
  const stints = {};
  const start = backHalfEarnedMinutes("wes", {
    bank, clockSec: 100, stintStartSec: stints, halfSec, phase: "start", returnerId: "wes", donorId: "trey",
  });
  const donorEarly = backHalfEarnedMinutes("trey", {
    bank, clockSec: 100, stintStartSec: stints, halfSec, phase: "start", returnerId: "wes", donorId: "trey",
  });
  assert.equal(start, 0);
  assert.equal(donorEarly, 100 / 60);
  const lateReturner = backHalfEarnedMinutes("wes", {
    bank, clockSec: 400, stintStartSec: stints, halfSec, phase: "after", returnerId: "wes", donorId: "trey",
  });
  const lateDonor = backHalfEarnedMinutes("trey", {
    bank, clockSec: 400, stintStartSec: stints, halfSec, phase: "after", returnerId: "wes", donorId: "trey",
  });
  assert.equal(lateReturner, 100 / 60);
  assert.equal(lateDonor, 300 / 60);
  const stillStart = backHalfEarnedMinutes("wes", {
    bank, clockSec: 400, stintStartSec: stints, halfSec, phase: "start", returnerId: "wes", donorId: "trey",
  });
  assert.equal(stillStart, 0);
});

function lineupIds(lineup) {
  return {
    on: (lineup?.starters || []).map(slot => slot.player?.id || null),
    bench: (lineup?.bench || []).map(player => player?.id || null),
  };
}

function panelIds(panel) {
  return {
    on: (panel?.starters || []).map(slot => slot.id || null),
    bench: (panel?.bench || []).map(player => player?.id || null),
  };
}

test("share and print After match the live After for every back-half quarter", () => {
  let cases = 0;
  [9, 10].forEach(count => {
    [true, false].forEach(subMode => {
      for (let seed = 1; seed <= 12; seed += 1) {
        [2, 3, 4].forEach(quarter => {
          const sheet = sheetWithAbsence({ subMode, outFrom: 1, seed, count });
          const back = returnToGame({
            players: sheet.players,
            playerId: sheet.id,
            quarter,
            half: "back",
            lineups: sheet.lineups,
            segments: sheet.segments,
            slots: SLOTS,
            subMode,
            minHalves: 4,
            totalQuarters: 4,
          });
          const returner = back.players.find(player => player.id === sheet.id);
          if (back.refused || !isBackHalfReturn(returner, quarter)) return;
          const view = quarterHalfPresentation(back.lineups[quarter], back.segments, quarter, { returnerId: sheet.id });
          assert.ok(view?.pairs?.length, `no presentation seed ${seed} q${quarter} sub ${subMode} n ${count}`);
          const minutesById = {};
          back.players.forEach((player, index) => {
            minutesById[player.id] = (index * 3) % 7;
          });
          const pairs = subMode
            ? backHalfShownPairs({
              start: view.start,
              returnerPair: view.pairs[0],
              nextLineup: back.lineups[quarter + 1] || null,
              minutesById,
              manualPairs: [],
            })
            : view.pairs;
          const live = sameAfterLineup(view.start, pairs, null);
          const shared = withBackHalfShare(
            shareFieldSheet({ lineups: back.lineups, pairPlan: {}, subMode, quarters: [1, 2, 3, 4] }),
            {
              players: back.players,
              lineups: back.lineups,
              segments: back.segments,
              pairPlan: {},
              minutesById,
              subMode,
            },
          );
          const panel = shared.quarters.find(item => item.quarter === quarter);
          assert.deepEqual(panelIds(panel.after), lineupIds(live), `seed ${seed} q${quarter} sub ${subMode} n ${count}`);
          assert.deepEqual(panelIds(panel), lineupIds(view.start));
          cases += 1;
        });
      }
    });
  });
  assert.equal(cases, 144);
});

test("a dragged After lineup is the one share prints", () => {
  const sheet = sheetWithAbsence({ subMode: true, outFrom: 1, seed: 2 });
  const back = returnToGame({
    players: sheet.players,
    playerId: sheet.id,
    quarter: 2,
    half: "back",
    lineups: sheet.lineups,
    segments: sheet.segments,
    slots: SLOTS,
    subMode: true,
    minHalves: 4,
    totalQuarters: 4,
  });
  const view = quarterHalfPresentation(back.lineups[2], back.segments, 2, { returnerId: sheet.id });
  const pairs = backHalfShownPairs({
    start: view.start,
    returnerPair: view.pairs[0],
    nextLineup: back.lineups[3],
  });
  const derived = sameAfterLineup(view.start, pairs, null);
  const slots = {};
  derived.starters.forEach((slot, index) => {
    if (slot.player?.id) slots[index] = slot.player.id;
  });
  const swap = slots[1];
  slots[1] = slots[2];
  slots[2] = swap;
  const override = { formation: formationKey(view.start), slots };
  const live = sameAfterLineup(view.start, pairs, override);
  const shared = withBackHalfShare(
    shareFieldSheet({ lineups: back.lineups, pairPlan: {}, subMode: true }),
    {
      players: back.players,
      lineups: back.lineups,
      segments: back.segments,
      subMode: true,
      afterSubs: { 2: override },
    },
  );
  const panel = shared.quarters.find(item => item.quarter === 2);
  assert.deepEqual(panelIds(panel.after), lineupIds(live));
  assert.notDeepEqual(lineupIds(live).on, lineupIds(derived).on);
});

function namedRoster(names) {
  const positions = ["GK", "LD", "RD", "LM", "RM", "CM", "CF", "LW", "RW", "ST"];
  return names.map((name, index) => ({
    id: `p${index + 1}`,
    name,
    number: String(index + 1),
    positions,
    injured: false,
    out: false,
    ratings: {},
  }));
}

test("full mode: Wes injured in Q2 comes back at the half for John, who replaced him", () => {
  const players = namedRoster([
    "John Smith", "Wes Johnson", "Jaxon Williams", "Remi Brown", "Sean Jones",
    "Henry Davis", "Jude Garcia", "Trey Miller", "Maddox Anderson",
  ]);
  const john = players[0];
  const wes = players[1];
  const starters = [
    { pos: "GK", player: players[5] },
    { pos: "LD", player: wes },
    { pos: "RD", player: players[2] },
    { pos: "LM", player: players[3] },
    { pos: "RM", player: players[4] },
    { pos: "CF", player: players[6] },
  ];
  const bench = [john, players[7], players[8]];
  const lineups = {};
  for (let q = 1; q <= 4; q += 1) {
    lineups[q] = {
      starters: starters.map(slot => ({ ...slot })),
      bench: [...bench],
    };
  }
  const absent = players.map(player => (
    player.id === wes.id
      ? { ...player, injured: true, out: false, midGameInjury: true, injuredInQuarter: 2, returnQuarter: null }
      : player
  ));
  const gone = planAvailability({
    autoRegen: true,
    kind: "absent",
    players: absent,
    absentId: wes.id,
    quarter: 2,
    lineups,
    segments: {},
    slots: SLOTS,
    subMode: false,
    minHalves: 4,
    totalQuarters: 4,
    livePeriod: true,
  });
  const replacedBy = vacatedSpotHolder(lineups[2], gone.lineups[2], wes.id);
  assert.equal(replacedBy, john.id);
  const injured = absent.map(player => (
    player.id === wes.id ? { ...player, replacedBy } : player
  ));
  const marked = noteSubSegment(gone.segments, wes.id, 2, "left");
  assert.equal(gone.lineups[2].starters.find(slot => slot.pos === "LD").player.id, john.id);
  const before = players.reduce((sum, player) => sum + quarterHalves(player.id, gone.lineups, marked, 2), 0);
  const gk = goalkeeperId(gone.lineups[2]);
  const back = returnToGame({
    players: injured,
    playerId: wes.id,
    quarter: 2,
    half: "back",
    lineups: gone.lineups,
    segments: marked,
    slots: SLOTS,
    subMode: false,
    minHalves: 4,
    totalQuarters: 4,
    livePeriod: true,
  });
  assert.equal(back.players.find(player => player.id === wes.id).replacedBy, undefined);
  assert.equal(goalkeeperId(back.lineups[2]), gk);
  assert.notEqual(segmentAt(back.segments, wes.id, 2), "entered");
  assert.equal(quarterHalves(wes.id, back.lineups, back.segments, 2), 2);
  assert.equal(quarterHalves(john.id, back.lineups, back.segments, 2), 1);
  const afterSum = players.reduce((sum, player) => sum + quarterHalves(player.id, back.lineups, back.segments, 2), 0);
  assert.equal(afterSum, before);
  const view = quarterHalfPresentation(back.lineups[2], back.segments, 2, { returnerId: wes.id });
  assert.equal(view.pairs[0].inId, wes.id);
  assert.equal(view.pairs[0].outId, john.id);
  assert.equal(view.start.starters.some(slot => slot.player?.id === john.id), true);
  assert.equal(view.start.starters.some(slot => slot.player?.id === wes.id), false);
  const after = sameAfterLineup(view.start, view.pairs, null);
  assert.equal(after.starters.some(slot => slot.player?.id === wes.id), true);
  assert.equal(after.starters.some(slot => slot.player?.id === john.id), false);
  assert.equal(goalkeeperId(after), gk);
});

test("sub mode: Leo's injury replacement is the donor for the same quarter", () => {
  const players = namedRoster(["Ann Stone", "Bea Stone", "Cal Stone", "Dee Stone", "Eve Stone", "Fay Stone", "Gia Stone", "Hal Stone", "Ian Stone", "Leo Stone"]);
  const leo = players.find(player => player.name.startsWith("Leo"));
  let checked = 0;
  for (let seed = 1; seed <= 12; seed += 1) {
    const opened = openSheet(players, true, seed);
    const beforeLineup = opened.lineups[2];
    if (!beforeLineup?.starters?.some(slot => slot.player?.id === leo.id)) continue;
    const absent = players.map(player => (
      player.id === leo.id
        ? { ...player, injured: true, out: false, midGameInjury: true, injuredInQuarter: 2, returnQuarter: null }
        : player
    ));
    const gone = planAvailability({
      autoRegen: true,
      kind: "absent",
      players: absent,
      absentId: leo.id,
      quarter: 2,
      lineups: opened.lineups,
      segments: opened.segments,
      slots: SLOTS,
      subMode: true,
      minHalves: 4,
      totalQuarters: 4,
      livePeriod: true,
    });
    const replacedBy = vacatedSpotHolder(beforeLineup, gone.lineups[2], leo.id);
    const injured = absent.map(player => (
      player.id === leo.id ? { ...player, replacedBy } : player
    ));
    const marked = noteSubSegment(gone.segments, leo.id, 2, "left");
    const before = players.reduce((sum, player) => sum + quarterHalves(player.id, gone.lineups, marked, 2), 0);
    const back = returnToGame({
      players: injured,
      playerId: leo.id,
      quarter: 2,
      half: "back",
      lineups: gone.lineups,
      segments: marked,
      slots: SLOTS,
      subMode: true,
      minHalves: 4,
      totalQuarters: 4,
      livePeriod: true,
    });
    const afterSum = players.reduce((sum, player) => sum + quarterHalves(player.id, back.lineups, back.segments, 2), 0);
    const view = quarterHalfPresentation(back.lineups[2], back.segments, 2, { returnerId: leo.id });
    assert.ok(view?.pairs?.length, `presentation seed ${seed}`);
    const gk = goalkeeperId(back.lineups[2]);
    const onField = (gone.lineups[2].starters || []).some(slot => (
      slot.player?.id === replacedBy && !isGkPosition(slot.pos)
    ));
    if (onField && replacedBy && replacedBy !== gk) {
      assert.equal(view.pairs[0].outId, replacedBy, `donor seed ${seed}`);
    }
    assert.notEqual(view.pairs[0].outId, gk);
    assert.equal(view.start.starters.some(slot => slot.player?.id === leo.id), false);
    assert.equal(view.start.starters.some(slot => slot.player?.id === view.pairs[0].outId), true);
    const pairs = backHalfShownPairs({
      start: view.start,
      returnerPair: view.pairs[0],
      nextLineup: back.lineups[3] || null,
    });
    assert.equal(pairs[0].inId, leo.id);
    view.start.bench.forEach(player => {
      assert.equal(pairs.some(pair => pair.inId === player.id), true, `${player.id} seed ${seed}`);
    });
    const after = sameAfterLineup(view.start, pairs, null);
    assert.equal(after.starters.some(slot => slot.player?.id === leo.id), true);
    const donorId = view.pairs[0].outId;
    const donorBeforeMask = playerHalfMask(donorId, gone.lineups[2], segmentAt(marked, donorId, 2));
    const donorAfterMask = playerHalfMask(donorId, back.lineups[2], segmentAt(back.segments, donorId, 2));
    assert.equal(donorAfterMask[0], donorBeforeMask[0], `donor H1 seed ${seed}`);
    assert.equal(donorAfterMask[1], false, `donor H2 seed ${seed}`);
    assert.equal(segmentAt(back.segments, donorId, 2), donorBeforeMask[0] ? "left" : null, `donor mark seed ${seed}`);
    assert.notEqual(segmentAt(back.segments, leo.id, 2), "entered", `returner mark seed ${seed}`);
    assert.equal(quarterHalves(leo.id, back.lineups, back.segments, 2), 2, `returner seed ${seed}`);
    assert.equal(quarterHalves(donorId, back.lineups, back.segments, 2), donorBeforeMask[0] ? 1 : 0, `donor seed ${seed}`);
    assert.equal(afterSum, before, `sum seed ${seed}`);
    checked += 1;
  }
  assert.ok(checked >= 8, `checked ${checked}`);
});

test("the goalkeeper is never the back-half donor, even as the injury replacement", () => {
  const players = namedRoster([
    "John Smith", "Wes Johnson", "Jaxon Williams", "Remi Brown", "Sean Jones",
    "Henry Davis", "Jude Garcia", "Trey Miller", "Maddox Anderson",
  ]);
  const wes = players[1];
  const keeper = players[5];
  const starters = [
    { pos: "GK", player: keeper },
    { pos: "LD", player: players[2] },
    { pos: "RD", player: players[3] },
    { pos: "LM", player: players[4] },
    { pos: "RM", player: players[6] },
    { pos: "CF", player: players[7] },
  ];
  const bench = [wes, players[0], players[8]];
  const lineups = { 2: { starters, bench } };
  const injured = players.map(player => (
    player.id === wes.id
      ? { ...player, injured: true, out: false, injuredInQuarter: 2, returnQuarter: null, replacedBy: keeper.id }
      : player
  ));
  const back = returnToGame({
    players: injured,
    playerId: wes.id,
    quarter: 2,
    half: "back",
    lineups,
    segments: { [wes.id]: { 2: "left" } },
    slots: SLOTS,
    subMode: false,
    minHalves: 4,
    totalQuarters: 4,
    livePeriod: true,
  });
  const view = quarterHalfPresentation(back.lineups[2], back.segments, 2, { returnerId: wes.id });
  assert.ok(view);
  assert.notEqual(view.pairs[0].outId, keeper.id);
  assert.equal(goalkeeperId(back.lineups[2]), keeper.id);
  assert.equal(goalkeeperId(view.start), keeper.id);
});

test("redraw of one quarter clears returnAt for that quarter only", () => {
  const players = [
    { id: "a", returnQuarter: 2, returnAt: { quarter: 2, half: "back" } },
    { id: "b", returnQuarter: 3, returnAt: { quarter: 3, half: "back" }, returnHalf: "back" },
    { id: "c", returnQuarter: 2 },
  ];
  const next = stripReturnAtForQuarter(players, 2);
  assert.equal(next[0].returnAt, undefined);
  assert.equal(next[0].returnQuarter, 2);
  assert.equal(isBackHalfReturn(next[0], 2), false);
  assert.deepEqual(next[1].returnAt, { quarter: 3, half: "back" });
  assert.equal(isBackHalfReturn(next[1], 3), true);
  assert.equal(next[2].returnQuarter, 2);
  assert.equal(next[2].returnAt, undefined);
  assert.equal(stripReturnAtForQuarter(players, 4), players);
});

test("a donor who only had one half still gives up the back half", () => {
  [true, false].forEach(subMode => {
    const players = namedRoster([
      "John Smith", "Wes Johnson", "Jaxon Williams", "Remi Brown", "Sean Jones",
      "Henry Davis", "Jude Garcia", "Trey Miller", "Maddox Anderson",
    ]);
    const john = players[0];
    const wes = players[1];
    const starters = [
      { pos: "GK", player: players[5] },
      { pos: "LD", player: john },
      { pos: "RD", player: players[2] },
      { pos: "LM", player: players[3] },
      { pos: "RM", player: players[4] },
      { pos: "CF", player: players[6] },
    ];
    const bench = [wes, players[7], players[8]];
    const lineups = {};
    for (let q = 1; q <= 4; q += 1) {
      lineups[q] = {
        starters: starters.map(slot => ({ ...slot })),
        bench: [...bench],
      };
    }
    const segments = {
      [wes.id]: { 2: "left" },
      [john.id]: { 2: "entered" },
    };
    const injured = players.map(player => (
      player.id === wes.id
        ? { ...player, injured: true, out: false, midGameInjury: true, injuredInQuarter: 2, returnQuarter: null, replacedBy: john.id }
        : player
    ));
    assert.equal(quarterHalves(wes.id, lineups, segments, 2), 1);
    assert.equal(quarterHalves(john.id, lineups, segments, 2), 1);
    const before = players.reduce((sum, player) => sum + quarterHalves(player.id, lineups, segments, 2), 0);
    const back = returnToGame({
      players: injured,
      playerId: wes.id,
      quarter: 2,
      half: "back",
      lineups,
      segments,
      slots: SLOTS,
      subMode,
      minHalves: 4,
      totalQuarters: 4,
      livePeriod: true,
    });
    assert.notEqual(segmentAt(back.segments, wes.id, 2), "entered", `sub ${subMode}`);
    assert.equal(quarterHalves(wes.id, back.lineups, back.segments, 2), 2, `sub ${subMode}`);
    assert.equal(segmentAt(back.segments, john.id, 2), null, `sub ${subMode}`);
    assert.equal(quarterHalves(john.id, back.lineups, back.segments, 2), 0, `sub ${subMode}`);
    const after = players.reduce((sum, player) => sum + quarterHalves(player.id, back.lineups, back.segments, 2), 0);
    assert.equal(after, before, `sub ${subMode}`);
    const view = quarterHalfPresentation(back.lineups[2], back.segments, 2, { returnerId: wes.id });
    assert.equal(view.pairs[0].outId, john.id, `sub ${subMode}`);
    assert.notEqual(view.pairs[0].outId, goalkeeperId(back.lineups[2]));
  });
});

function sitOut(players, id, quarter) {
  return players.map(player => (
    player.id === id
      ? { ...player, out: true, injured: false, injuredInQuarter: quarter, returnQuarter: null }
      : player
  ));
}

function assertNoStaleBackHalf(players, lineups, segments, fromQuarter, totalQuarters = 4) {
  for (let q = fromQuarter; q <= totalQuarters; q += 1) {
    (players || []).filter(player => isBackHalfReturn(player, q)).forEach(returner => {
      const lineup = lineups?.[q];
      const view = quarterHalfPresentation(lineup, segments, q, { returnerId: returner.id });
      const who = returner.name || returner.id;
      assert.ok(view, `${who} Q${q} kept a back-half mark without a presentation`);
      assert.equal(view.start.starters.some(slot => slot.player?.id === returner.id), false, `${who} Q${q} starts on the field`);
      assert.equal(view.start.bench.some(player => player?.id === returner.id), true, `${who} Q${q} is not benched at the start`);
      const donorId = view.pairs[0].outId;
      assert.ok(donorId, `${who} Q${q} has no donor`);
      assert.notEqual(String(donorId), String(goalkeeperId(lineup) || ""), `${who} Q${q} donor is the goalkeeper`);
    });
  }
}

test("a whole-quarter return leaves other back-half marks for the app to revalidate", () => {
  const players = namedRoster([
    "John Smith", "Wes Johnson", "Jaxon Williams", "Remi Brown", "Sean Jones",
    "Henry Davis", "Jude Garcia", "Trey Miller", "Maddox Anderson",
  ]);
  const wes = players.find(player => player.name.startsWith("Wes"));
  const jaxon = players.find(player => player.name.startsWith("Jaxon"));
  const remi = players.find(player => player.name.startsWith("Remi"));
  const opened = openSheet(players, true, 2);
  const wesPlayers = sitOut(players, wes.id, 1);
  const wesGone = planAvailability({
    autoRegen: true,
    kind: "absent",
    players: wesPlayers,
    absentId: wes.id,
    quarter: 1,
    lineups: opened.lineups,
    segments: opened.segments,
    slots: SLOTS,
    subMode: true,
    minHalves: 4,
    totalQuarters: 4,
  });
  const wesBack = returnToGame({
    players: wesPlayers,
    playerId: wes.id,
    quarter: 2,
    half: "back",
    lineups: wesGone.lineups,
    segments: wesGone.segments,
    slots: SLOTS,
    subMode: true,
    minHalves: 4,
    totalQuarters: 4,
  });
  assert.equal(isBackHalfReturn(wesBack.players.find(player => player.id === wes.id), 2), true);
  const jaxonPlayers = sitOut(wesBack.players, jaxon.id, 1);
  const jaxonGone = planAvailability({
    autoRegen: true,
    kind: "absent",
    players: jaxonPlayers,
    absentId: jaxon.id,
    quarter: 1,
    lineups: wesBack.lineups,
    segments: wesBack.segments,
    slots: SLOTS,
    subMode: true,
    minHalves: 4,
    totalQuarters: 4,
  });
  const jaxonBack = returnToGame({
    players: jaxonPlayers,
    playerId: jaxon.id,
    quarter: 3,
    half: "back",
    lineups: jaxonGone.lineups,
    segments: jaxonGone.segments,
    slots: SLOTS,
    subMode: true,
    minHalves: 4,
    totalQuarters: 4,
  });
  assert.equal(isBackHalfReturn(jaxonBack.players.find(player => player.id === wes.id), 2), true);
  assert.equal(isBackHalfReturn(jaxonBack.players.find(player => player.id === jaxon.id), 3), true);
  const remiPlayers = sitOut(jaxonBack.players, remi.id, 1);
  const remiGone = planAvailability({
    autoRegen: true,
    kind: "absent",
    players: remiPlayers,
    absentId: remi.id,
    quarter: 1,
    lineups: jaxonBack.lineups,
    segments: jaxonBack.segments,
    slots: SLOTS,
    subMode: true,
    minHalves: 4,
    totalQuarters: 4,
  });
  const whole = returnToGame({
    players: remiPlayers,
    playerId: remi.id,
    quarter: 2,
    half: "whole",
    lineups: remiGone.lineups,
    segments: remiGone.segments,
    slots: SLOTS,
    subMode: true,
    minHalves: 4,
    totalQuarters: 4,
  });
  const viaDialog = commitReturn({
    players: remiPlayers,
    playerId: remi.id,
    lineups: remiGone.lineups,
    segments: remiGone.segments,
    hasSheet: true,
    autoRegen: true,
    subMode: true,
    totalQuarters: 4,
    slots: SLOTS,
    minHalves: 4,
    quarters: [1, 2, 3, 4],
  }, { type: "confirm", quarter: 2, available: true, half: "whole" });
  assert.equal(isBackHalfReturn(whole.players.find(player => player.id === wes.id), 2), true);
  assert.equal(isBackHalfReturn(whole.players.find(player => player.id === jaxon.id), 3), true);
  assert.equal(isBackHalfReturn(viaDialog.players.find(player => player.id === wes.id), 2), true);
  assert.equal(isBackHalfReturn(viaDialog.players.find(player => player.id === jaxon.id), 3), true);
  const checked = revalidateBackHalfMarks({
    players: whole.players,
    lineups: whole.lineups,
    segments: whole.segments,
    fromQuarter: 2,
    totalQuarters: 4,
  });
  assertNoStaleBackHalf(checked.players, checked.lineups, checked.segments, 2);
  checked.players.forEach(player => {
    const original = whole.players.find(item => item.id === player.id);
    if (original?.returnQuarter) assert.equal(player.returnQuarter, original.returnQuarter);
  });
  const redraw = redrawQuarterMembership(checked.players, checked.lineups, 2, 2, 4, {
    segments: checked.segments,
    lockGoalkeeper: true,
  });
  assert.equal(redraw.ok, true, redraw.reason);
});

function halfCensus(players, lineups, segments, quarter) {
  const lineup = lineups?.[quarter];
  let h1 = 0;
  let h2 = 0;
  players.forEach(player => {
    const mask = playerHalfMask(player.id, lineup, segmentAt(segments, player.id, quarter));
    if (mask[0]) h1 += 1;
    if (mask[1]) h2 += 1;
  });
  const slotN = (lineup?.starters || []).length;
  return { h1, h2, slotN, exact: h1 === slotN && h2 === slotN };
}

function injureStarter(players, lineups, segments, id, subMode, quarter = 2, slots = SLOTS) {
  const absent = players.map(player => (
    player.id === id
      ? { ...player, injured: true, out: false, midGameInjury: true, injuredInQuarter: quarter, returnQuarter: null }
      : player
  ));
  const gone = planAvailability({
    autoRegen: true,
    kind: "absent",
    players: absent,
    absentId: id,
    quarter,
    lineups,
    segments,
    slots,
    subMode,
    minHalves: 4,
    totalQuarters: 4,
    livePeriod: true,
  });
  const replacedBy = vacatedSpotHolder(lineups[quarter], gone.lineups[quarter], id);
  const injured = absent.map(player => (
    player.id === id ? { ...player, replacedBy } : player
  ));
  return {
    players: injured,
    lineups: gone.lineups,
    segments: noteSubSegment(gone.segments, id, quarter, "left"),
    replacedBy,
  };
}

function sameQuarterInjurySweep(subMode, twoInjuries = false) {
  const totals = {
    cases: 0, donorMatch: 0, unchanged: 0, stable: 0, donorRule: 0,
    exactBefore: 0, exactAfter: 0, refused: 0,
  };
  [9, 10].forEach(count => {
    for (let seed = 1; seed <= 60; seed += 1) {
      const players = roster(count);
      const opened = openSheet(players, subMode, seed);
      const starters = (opened.lineups[2]?.starters || []).filter(slot => slot.player && !isGkPosition(slot.pos));
      starters.forEach((slot, index) => {
        const id = slot.player.id;
        totals.cases += 1;
        let state = injureStarter(players, opened.lineups, opened.segments, id, subMode);
        if (twoInjuries) {
          const other = starters[(index + 1) % starters.length].player.id;
          state = injureStarter(state.players, state.lineups, state.segments, other, subMode);
        }
        const beforeSum = players.reduce((sum, player) => sum + quarterHalves(player.id, state.lineups, state.segments, 2), 0);
        const beforeCensus = halfCensus(players, state.lineups, state.segments, 2);
        if (beforeCensus.exact) totals.exactBefore += 1;
        const back = returnToGame({
          players: state.players,
          playerId: id,
          quarter: 2,
          half: "back",
          lineups: state.lineups,
          segments: state.segments,
          slots: SLOTS,
          subMode,
          minHalves: 4,
          totalQuarters: 4,
          livePeriod: true,
        });
        const afterSum = players.reduce((sum, player) => sum + quarterHalves(player.id, back.lineups, back.segments, 2), 0);
        const afterCensus = halfCensus(players, back.lineups, back.segments, 2);
        const label = `sub ${subMode} two ${twoInjuries} seed ${seed} ${id}`;
        assert.equal(afterSum, beforeSum, `total ${label}`);
        assert.equal(afterCensus.h1, beforeCensus.h1, `H1 ${label}`);
        assert.equal(afterCensus.h2, beforeCensus.h2, `H2 ${label}`);
        totals.unchanged += 1;
        totals.stable += 1;
        if (afterCensus.exact) totals.exactAfter += 1;
        if (back.refused) {
          totals.refused += 1;
          return;
        }
        const view = quarterHalfPresentation(back.lineups[2], back.segments, 2, { returnerId: id });
        const gk = goalkeeperId(back.lineups[2]);
        assert.ok(view?.pairs?.[0]?.outId, `presentation ${label}`);
        assert.notEqual(view.pairs[0].outId, gk, `gk donor ${label}`);
        if (!twoInjuries) {
          const eligible = state.replacedBy && state.replacedBy !== gk && (state.lineups[2]?.starters || []).some(item => (
            item.player?.id === state.replacedBy && !isGkPosition(item.pos)
          ));
          assert.equal(eligible, true, `holder ${label}`);
          assert.equal(view.pairs[0].outId, state.replacedBy, `donor ${label}`);
          totals.donorMatch += 1;
        }
        const donorId = view.pairs[0].outId;
        const donorBefore = playerHalfMask(donorId, state.lineups[2], segmentAt(state.segments, donorId, 2));
        const donorAfter = playerHalfMask(donorId, back.lineups[2], segmentAt(back.segments, donorId, 2));
        assert.equal(donorAfter[0], donorBefore[0], `donor H1 ${label}`);
        assert.equal(donorAfter[1], false, `donor H2 ${label}`);
        assert.equal(segmentAt(back.segments, donorId, 2), donorBefore[0] ? "left" : null, `donor mark ${label}`);
        const returnerBefore = playerHalfMask(id, state.lineups[2], segmentAt(state.segments, id, 2));
        const returnerAfter = playerHalfMask(id, back.lineups[2], segmentAt(back.segments, id, 2));
        assert.equal(returnerAfter[0], returnerBefore[0], `returner H1 ${label}`);
        assert.equal(returnerAfter[1], true, `returner H2 ${label}`);
        totals.donorRule += 1;
      });
    }
  });
  return totals;
}

test("the post-replan spot holder donates in every same-quarter injury", () => {
  const sub = sameQuarterInjurySweep(true);
  const full = sameQuarterInjurySweep(false);
  const subTwo = sameQuarterInjurySweep(true, true);
  const fullTwo = sameQuarterInjurySweep(false, true);
  [sub, full, subTwo, fullTwo].forEach(row => {
    assert.equal(row.cases, 600);
    assert.equal(row.unchanged, 600);
    assert.equal(row.stable, 600);
    assert.equal(row.exactAfter, row.exactBefore);
    assert.equal(row.refused, 0);
    assert.equal(row.donorRule, 600);
  });
  assert.equal(sub.donorMatch, 600);
  assert.equal(full.donorMatch, 600);
  assert.equal(sub.exactBefore, 246);
  assert.equal(full.exactBefore, 0);
  assert.equal(subTwo.exactBefore, subTwo.exactAfter);
  assert.equal(fullTwo.exactBefore, fullTwo.exactAfter);
  assert.equal(subTwo.exactBefore, 183);
  assert.equal(fullTwo.exactBefore, 0);
});

test("an entered donor is cleared so that half is not credited twice", () => {
  const players = roster(8);
  const opened = openSheet(players, true, 1);
  const quarter = 4;
  assert.equal(opened.lineups[quarter].starters.find(slot => slot.pos === "CF").player.id, "p8");
  const state = injureStarter(players, opened.lineups, opened.segments, "p8", true, quarter);
  assert.equal(state.replacedBy, "p7");
  assert.equal(segmentAt(state.segments, "p7", quarter), "entered");
  const beforeSum = players.reduce((sum, player) => sum + quarterHalves(player.id, state.lineups, state.segments, quarter), 0);
  const beforeCensus = halfCensus(players, state.lineups, state.segments, quarter);
  assert.equal(beforeSum, 12);
  assert.equal(beforeCensus.exact, true);
  const back = returnToGame({
    players: state.players,
    playerId: "p8",
    quarter,
    half: "back",
    lineups: state.lineups,
    segments: state.segments,
    slots: SLOTS,
    subMode: true,
    minHalves: 4,
    totalQuarters: 4,
    livePeriod: true,
  });
  const afterSum = players.reduce((sum, player) => sum + quarterHalves(player.id, back.lineups, back.segments, quarter), 0);
  const afterCensus = halfCensus(players, back.lineups, back.segments, quarter);
  assert.equal(segmentAt(back.segments, "p7", quarter), null);
  assert.equal(quarterHalves("p7", back.lineups, back.segments, quarter), 0);
  assert.equal(quarterHalves("p8", back.lineups, back.segments, quarter), 2);
  assert.equal(afterSum, 12);
  assert.equal(afterCensus.exact, true);
  assert.equal(afterCensus.h1, 6);
  assert.equal(afterCensus.h2, 6);
  const view = quarterHalfPresentation(back.lineups[quarter], back.segments, quarter, { returnerId: "p8" });
  assert.equal(view.pairs[0].outId, "p7");
  assert.equal(view.start.starters.some(slot => slot.player?.id === "p8"), false);
  assert.equal(view.start.starters.some(slot => slot.player?.id === "p7"), true);
});

function manualQuarter(starters, bench) {
  return { starters, bench };
}

test("revalidate keeps a benched returner and reinstalls one drawn from 0:00", () => {
  const players = namedRoster([
    "John Smith", "Wes Johnson", "Jaxon Williams", "Remi Brown", "Sean Jones",
    "Henry Davis", "Jude Garcia", "Trey Miller", "Maddox Anderson",
  ]);
  const john = players[0];
  const wes = players[1];
  const keeper = players[5];
  const marked = players.map(player => (
    player.id === wes.id ? { ...player, returnQuarter: 2, returnAt: { quarter: 2, half: "back" } } : player
  ));
  const field = [
    { pos: "GK", player: keeper },
    { pos: "LD", player: john },
    { pos: "RD", player: players[2] },
    { pos: "LM", player: players[3] },
    { pos: "RM", player: players[4] },
    { pos: "CF", player: players[6] },
  ];
  const kept = revalidateBackHalfMarks({
    players: marked,
    lineups: { 1: manualQuarter(field, [wes, players[7], players[8]]), 2: manualQuarter(field, [wes, players[7], players[8]]) },
    segments: {},
    fromQuarter: 2,
    totalQuarters: 2,
  });
  assert.equal(isBackHalfReturn(kept.players.find(player => player.id === wes.id), 2), true);
  assert.equal(kept.notices.length, 0);
  const earlier = kept.players.find(player => player.id === wes.id);
  assert.equal(earlier.returnAt.quarter, 2);
  const view = quarterHalfPresentation(kept.lineups[2], kept.segments, 2, { returnerId: wes.id });
  assert.equal(view.pairs[0].outId, john.id);
  assert.equal(view.start.starters.some(slot => slot.player?.id === wes.id), false);
  assert.notEqual(view.pairs[0].outId, keeper.id);
  const drawn = revalidateBackHalfMarks({
    players: marked,
    lineups: {
      2: manualQuarter(
        field.map(slot => (slot.pos === "LD" ? { ...slot, player: wes } : slot)),
        [john, players[7], players[8]],
      ),
    },
    segments: {},
    fromQuarter: 2,
    totalQuarters: 2,
  });
  assert.equal(isBackHalfReturn(drawn.players.find(player => player.id === wes.id), 2), true);
  assert.equal(drawn.players.find(player => player.id === wes.id).returnQuarter, 2);
  assert.equal(drawn.notices.length, 0);
  const drawnView = quarterHalfPresentation(drawn.lineups[2], drawn.segments, 2, { returnerId: wes.id });
  assert.equal(drawnView.pairs[0].outId, john.id);
  assert.notEqual(drawnView.pairs[0].outId, keeper.id);
  assert.equal(drawnView.start.starters.some(slot => slot.player?.id === wes.id), false);
  assert.equal(drawn.lineups[2].starters.filter(slot => slot.player?.id).length, 6);
  assert.equal(playerHalfMask(wes.id, drawn.lineups[2], segmentAt(drawn.segments, wes.id, 2))[0], false);
});

function freshSheet(subMode, seed = 2) {
  const players = namedRoster([
    "John Smith", "Wes Johnson", "Jaxon Williams", "Remi Brown", "Sean Jones",
    "Henry Davis", "Jude Garcia", "Trey Miller", "Maddox Anderson",
  ]);
  const opened = openSheet(players, subMode, seed);
  return { players, lineups: opened.lineups, segments: opened.segments, subMode };
}

function withAbsence(state, id, quarter) {
  const players = sitOut(state.players, id, quarter);
  const gone = planAvailability({
    autoRegen: true,
    kind: "absent",
    players,
    absentId: id,
    quarter,
    lineups: state.lineups,
    segments: state.segments,
    slots: state.slots || SLOTS,
    subMode: state.subMode,
    minHalves: 4,
    totalQuarters: 4,
  });
  return { ...state, players, lineups: gone.lineups, segments: gone.segments };
}

function returnFor(state, id, quarter, half) {
  const back = returnToGame({
    players: state.players,
    playerId: id,
    quarter,
    half,
    lineups: state.lineups,
    segments: state.segments,
    slots: state.slots || SLOTS,
    subMode: state.subMode,
    minHalves: 4,
    totalQuarters: 4,
  });
  return {
    ...state,
    players: back.players,
    lineups: back.lineups,
    segments: back.segments,
    regenerated: back.regenerated,
    refused: back.refused,
  };
}

function sheetWithBackHalf(subMode) {
  const wesId = freshSheet(subMode).players.find(player => player.name.startsWith("Wes")).id;
  let state = withAbsence(freshSheet(subMode), wesId, 1);
  state = returnFor(state, wesId, 3, "back");
  assert.equal(state.refused, undefined, `back half refused sub ${subMode}`);
  assert.equal(isBackHalfReturn(state.players.find(player => player.id === wesId), 3), true);
  return { ...state, wesId };
}

function markAbsentLikeApp(state, id, quarter, mode) {
  const wasOn = !!state.lineups[quarter]?.starters?.some(slot => slot.player?.id === id);
  const players = state.players.map(player => {
    if (player.id !== id) return player;
    const extra = { injuredInQuarter: quarter, returnQuarter: null };
    return mode === "out"
      ? markOut(player, { ...extra, midGameInjury: false })
      : markInjured(player, { ...extra, midGameInjury: true });
  });
  const gone = planAvailability({
    autoRegen: true,
    kind: "absent",
    players,
    absentId: id,
    quarter,
    lineups: state.lineups,
    segments: state.segments,
    slots: state.slots || SLOTS,
    subMode: state.subMode,
    minHalves: 4,
    totalQuarters: 4,
    livePeriod: true,
  });
  let roster = players;
  let segments = gone.segments;
  if (wasOn) {
    const holder = vacatedSpotHolder(state.lineups[quarter], gone.lineups[quarter], id);
    if (holder) roster = roster.map(player => (player.id === id ? { ...player, replacedBy: holder } : player));
    segments = noteSubSegment(segments, id, quarter, "left");
  }
  return { players: roster, lineups: gone.lineups, segments };
}

function replanLikeApp(state, fromQuarter) {
  const slots = state.slots || SLOTS;
  const locked = {};
  for (let q = 1; q < fromQuarter; q += 1) locked[q] = state.lineups[q];
  const planned = state.subMode
    ? scheduleHalfRotation(state.players, slots, {
      minHalves: 4,
      fromQuarter,
      lockedLineups: locked,
      lockedSegments: state.segments || {},
      totalQuarters: 4,
      seed: 4,
    })
    : {
      lineups: scheduleWholeGame({
        players: state.players,
        format: state.format || "6v6",
        slotOverride: slots,
        lockedLineups: locked,
        fromQuarter,
        totalPeriods: 4,
        minFraction: 0.5,
        seed: 4,
      }),
      segments: {},
    };
  return {
    players: state.players,
    lineups: planned.lineups,
    segments: planned.segments || {},
  };
}

function onFieldCount(lineup) {
  return (lineup?.starters || []).filter(slot => slot.player?.id).length;
}

function sheetPlayers(lineup) {
  const ids = [];
  (lineup?.starters || []).forEach(slot => { if (slot.player?.id) ids.push(slot.player.id); });
  (lineup?.bench || []).forEach(player => { if (player?.id) ids.push(player.id); });
  return ids;
}

function halfOwners(lineup, segments, quarter) {
  const h1Ids = [];
  const h2Ids = [];
  sheetPlayers(lineup).forEach(id => {
    const mask = playerHalfMask(id, lineup, segmentAt(segments, id, quarter));
    if (mask[0]) h1Ids.push(id);
    if (mask[1]) h2Ids.push(id);
  });
  return { h1: h1Ids.length, h2: h2Ids.length, h1Ids, h2Ids };
}

function assertBackHalfInvariants(label, raw, checked, fromQuarter) {
  assert.ok(Array.isArray(checked.notices), `${label} notices`);
  const beforePlayers = raw.players;
  for (let q = fromQuarter; q <= 4; q += 1) {
    const lineup = checked.lineups?.[q];
    if (!lineup?.starters?.length) continue;
    const size = lineup.starters.length;
    const on = onFieldCount(lineup);
    const waiting = (lineup.bench || []).filter(player => player?.id).length;
    const quarterHadMark = (beforePlayers || []).some(player => isBackHalfReturn(player, q) && !player.out && !player.injured);
    const donorBench = (lineup.bench || []).filter(player => {
      if (!player?.id) return false;
      return checked.players.some(returner => {
        if (!isBackHalfReturn(returner, q)) return false;
        const pair = quarterHalfPresentation(lineup, checked.segments, q, { returnerId: returner.id });
        return String(pair?.pairs?.[0]?.outId) === String(player.id);
      });
    }).length;
    const fillers = waiting - donorBench;
    if (quarterHadMark && on + fillers >= size) {
      assert.equal(on, size, `${label} Q${q} field ${on}/${size} with ${waiting} benched`);
    }
    (lineup.starters || []).forEach(slot => {
      if (!slot.player?.id) return;
      assert.notEqual(segmentAt(checked.segments, slot.player.id, q), "left", `${label} Q${q} on-field left ${slot.player.id}`);
    });
    const returnerIds = new Set((beforePlayers || []).filter(player => isBackHalfReturn(player, q)).map(player => player.id));
    const donorIds = new Set();
    checked.players.filter(player => isBackHalfReturn(player, q)).forEach(player => {
      const pair = quarterHalfPresentation(lineup, checked.segments, q, { returnerId: player.id });
      if (pair?.pairs?.[0]?.outId) donorIds.add(pair.pairs[0].outId);
    });
    (beforePlayers || []).forEach(player => {
      const beforeHalves = equityHalves(player.id, { lineups: raw.lineups, segments: raw.segments, credit: {}, quarters: [q] });
      const afterHalves = equityHalves(player.id, { lineups: checked.lineups, segments: checked.segments, credit: {}, quarters: [q] });
      if (afterHalves >= beforeHalves) return;
      assert.equal(beforeHalves - afterHalves, 1, `${label} Q${q} ${player.name} lost more than a half`);
      const droppedExtraLeft = segmentAt(raw.segments, player.id, q) === "left"
        && segmentAt(checked.segments, player.id, q) == null
        && !donorIds.has(player.id);
      if (droppedExtraLeft) return;
      assert.ok(
        returnerIds.has(player.id) || donorIds.has(player.id),
        `${label} Q${q} ${player.name} lost a half without being the returner or the donor`,
      );
    });
    const owners = halfOwners(lineup, checked.segments, q);
    assert.equal(owners.h2, on, `${label} Q${q} second-half owners ${owners.h2} field ${on}`);
    assert.equal(new Set(owners.h1Ids).size, owners.h1Ids.length, `${label} Q${q} H1 owners are not distinct`);
    assert.equal(new Set(owners.h2Ids).size, owners.h2Ids.length, `${label} Q${q} H2 owners are not distinct`);
    const credit = owners.h1 + owners.h2;
    const injuryReturn = checked.players.some(player => (
      isBackHalfReturn(player, q) && Number(player.injuredInQuarter) === q
    ));
    const sheetIds = new Set(sheetPlayers(lineup).map(id => String(id)));
    const sheetLeft = injuryReturn
      ? Object.keys(checked.segments || {}).filter(id => (
        sheetIds.has(String(id)) && segmentAt(checked.segments, id, q) === "left"
      )).length
      : 0;
    const enteredMarks = injuryReturn
      ? Object.keys(checked.segments || {}).filter(id => segmentAt(checked.segments, id, q) === "entered").length
      : 0;
    const injuryExtras = injuryReturn ? Math.max(0, sheetLeft - enteredMarks) : 0;
    const creditOk = credit === on * 2 || (injuryExtras > 0 && credit === on * 2 + injuryExtras);
    assert.equal(creditOk, true, `${label} Q${q} credit ${credit} field ${on} extras ${injuryExtras}`);
    checked.players.filter(player => isBackHalfReturn(player, q)).forEach(returner => {
      const view = quarterHalfPresentation(lineup, checked.segments, q, { returnerId: returner.id });
      const who = `${label} ${returner.name || returner.id} Q${q}`;
      assert.ok(view, `${who} has no at-the-half pairing`);
      assert.equal(view.start.starters.some(slot => slot.player?.id === returner.id), false, `${who} plays the first half`);
      const donorId = view.pairs[0].outId;
      assert.notEqual(String(donorId), String(goalkeeperId(lineup) || ""), `${who} donor is the goalkeeper`);
      const donorMark = segmentAt(checked.segments, donorId, q);
      const retMark = segmentAt(checked.segments, returner.id, q);
      assert.ok(donorMark === "left" || donorMark == null, `${who} donor mark ${donorMark}`);
      if (Number(returner.injuredInQuarter) === q) {
        assert.equal(retMark == null || retMark === "entered", true, `${who} injury mark ${retMark}`);
        assert.ok(lineup.starters.some(slot => slot.player?.id === returner.id), `${who} is not on at the half`);
      } else {
        assert.equal(retMark, "entered", `${who} mark ${retMark}`);
        assert.equal(playerHalfMask(returner.id, lineup, retMark)[0], false, `${who} is credited the first half`);
      }
    });
  }
  (beforePlayers || []).forEach(player => {
    for (let q = fromQuarter; q <= 4; q += 1) {
      if (!isBackHalfReturn(player, q)) continue;
      const still = checked.players.find(item => item.id === player.id);
      if (isBackHalfReturn(still, q)) continue;
      const name = String(player.name || "This player").split(" ")[0];
      assert.ok(
        checked.notices.some(note => note.includes(name) && note.includes(`Q${q}`)),
        `${label} stripped ${name} Q${q} without a notice`,
      );
    }
  });
}

function markOutManual(state, id, quarter, mode = "out") {
  const players = state.players.map(player => {
    if (player.id !== id) return player;
    const extra = { injuredInQuarter: quarter, returnQuarter: null };
    return mode === "injury"
      ? markInjured(player, { ...extra, midGameInjury: true })
      : markOut(player, { ...extra, midGameInjury: false });
  });
  const segments = clearPlayerSegmentsFrom(state.segments, id, quarter, state.lineups);
  return {
    players,
    lineups: pullFromPlan(state.lineups, id, quarter, 4),
    segments,
  };
}

test("a kept sub-mode pair does not lose a half to a new donor", () => {
  const players = namedRoster([
    "John Smith", "Wes Johnson", "Jaxon Williams", "Remi Brown", "Sean Jones",
    "Henry Davis", "Jude Garcia", "Trey Miller", "Maddox Anderson",
  ]);
  const john = players[0];
  const wes = players[1];
  const jude = players[6];
  const field = [
    { pos: "GK", player: players[5] },
    { pos: "LD", player: john },
    { pos: "RD", player: players[2] },
    { pos: "LM", player: players[3] },
    { pos: "RM", player: players[4] },
    { pos: "CF", player: wes },
  ];
  const bench = [jude, players[7], players[8]];
  const segments = { [wes.id]: { 3: "entered" }, [jude.id]: { 3: "left" } };
  const marked = players.map(player => (
    player.id === wes.id ? { ...player, returnQuarter: 3, returnAt: { quarter: 3, half: "back" } } : player
  ));
  const beforeLineups = { 3: { starters: field.map(slot => ({ ...slot })), bench: [...bench] } };
  assert.equal(quarterHalves(john.id, beforeLineups, segments, 3), 2);
  const checked = revalidateBackHalfMarks({
    players: marked,
    lineups: beforeLineups,
    segments,
    fromQuarter: 3,
    totalQuarters: 4,
  });
  assert.equal(isBackHalfReturn(checked.players.find(player => player.id === wes.id), 3), true);
  assert.equal(checked.notices.length, 0);
  assert.equal(quarterHalves(john.id, checked.lineups, checked.segments, 3), 2);
  assert.equal(players.reduce((sum, player) => sum + quarterHalves(player.id, checked.lineups, checked.segments, 3), 0), 12);
  assert.equal(checked.lineups[3].starters.some(slot => slot.player?.id === jude.id), false);
  assert.equal(segmentAt(checked.segments, jude.id, 3), "left");
  const view = quarterHalfPresentation(checked.lineups[3], checked.segments, 3, { returnerId: wes.id });
  assert.equal(view.pairs[0].outId, jude.id);
});

test("a later replan keeps a same-quarter injury return on the half", () => {
  [true, false].forEach(subMode => {
    const players = namedRoster([
      "John Smith", "Wes Johnson", "Jaxon Williams", "Remi Brown", "Sean Jones",
      "Henry Davis", "Jude Garcia", "Trey Miller", "Maddox Anderson",
    ]);
    const wes = players[1];
    const opened = openSheet(players, subMode, 2);
    const state = injureStarter(players, opened.lineups, opened.segments, wes.id, subMode, 2);
    const back = returnToGame({
      players: state.players,
      playerId: wes.id,
      quarter: 2,
      half: "back",
      lineups: state.lineups,
      segments: state.segments,
      slots: SLOTS,
      subMode,
      minHalves: 4,
      totalQuarters: 4,
      livePeriod: true,
    });
    assert.equal(quarterHalves(wes.id, back.lineups, back.segments, 2), 2, `install ${subMode}`);
    const locked = { 1: back.lineups[1] };
    const planned = subMode
      ? scheduleHalfRotation(back.players, SLOTS, {
        minHalves: 4, fromQuarter: 2, lockedLineups: locked, totalQuarters: 4, seed: 4,
      })
      : {
        lineups: scheduleWholeGame({
          players: back.players, format: "6v6", slotOverride: SLOTS, lockedLineups: locked,
          fromQuarter: 2, totalPeriods: 4, minFraction: 0.5, seed: 4,
        }),
        segments: {},
      };
    const checked = revalidateBackHalfMarks({
      players: back.players,
      lineups: planned.lineups,
      segments: planned.segments || {},
      fromQuarter: 2,
      totalQuarters: 4,
    });
    const mode = subMode ? "sub" : "full";
    assert.equal(isBackHalfReturn(checked.players.find(player => player.id === wes.id), 2), true, mode);
    assert.equal(checked.notices.length, 0, mode);
    const view = quarterHalfPresentation(checked.lineups[2], checked.segments, 2, { returnerId: wes.id });
    assert.ok(view, `${mode} toggle`);
    assert.equal(view.start.starters.some(slot => slot.player?.id === wes.id), false, mode);
    assert.notEqual(view.pairs[0].outId, goalkeeperId(checked.lineups[2]), mode);
    assert.equal(quarterHalves(wes.id, checked.lineups, checked.segments, 2), 2, mode);
    assert.equal(onFieldCount(checked.lineups[2]), 6, mode);
  });
});

test("revalidating an unchanged same-quarter injury return strips nothing", () => {
  [true, false].forEach(subMode => {
    [false, true].forEach(two => {
      let cases = 0;
      let strips = 0;
      [9, 10].forEach(count => {
        for (let seed = 1; seed <= 60; seed += 1) {
          const players = roster(count);
          const opened = openSheet(players, subMode, seed);
          const starters = (opened.lineups[2]?.starters || []).filter(slot => slot.player && !isGkPosition(slot.pos));
          starters.forEach((slot, index) => {
            const id = slot.player.id;
            let state = injureStarter(players, opened.lineups, opened.segments, id, subMode);
            if (two) {
              const other = starters[(index + 1) % starters.length].player.id;
              state = injureStarter(state.players, state.lineups, state.segments, other, subMode);
            }
            const back = returnToGame({
              players: state.players,
              playerId: id,
              quarter: 2,
              half: "back",
              lineups: state.lineups,
              segments: state.segments,
              slots: SLOTS,
              subMode,
              minHalves: 4,
              totalQuarters: 4,
              livePeriod: true,
            });
            if (back.refused) return;
            cases += 1;
            const once = revalidateBackHalfMarks({
              players: back.players,
              lineups: back.lineups,
              segments: back.segments,
              fromQuarter: 2,
              totalQuarters: 4,
            });
            if (!isBackHalfReturn(once.players.find(player => player.id === id), 2)) strips += 1;
            const twice = revalidateBackHalfMarks({
              players: once.players,
              lineups: once.lineups,
              segments: once.segments,
              fromQuarter: 2,
              totalQuarters: 4,
            });
            assert.deepEqual(twice.players, once.players);
            assert.deepEqual(twice.lineups, once.lineups);
            assert.deepEqual(twice.segments, once.segments);
            assert.deepEqual(twice.notices, once.notices);
          });
        }
      });
      assert.equal(cases, 600, `cases ${subMode} ${two}`);
      assert.equal(strips, 0, `strips ${subMode} ${two}`);
    });
  });
});

test("a live full replan keeps the injury replacement's first half", () => {
  const players = namedRoster([
    "John Smith", "Wes Johnson", "Jaxon Williams", "Remi Brown", "Sean Jones",
    "Henry Davis", "Jude Garcia", "Trey Miller", "Maddox Anderson",
  ]);
  const jaxon = players.find(player => player.name.startsWith("Jaxon"));
  const wes = players.find(player => player.name.startsWith("Wes"));
  const opened = openSheet(players, false, 1);
  const state = injureStarter(players, opened.lineups, opened.segments, jaxon.id, false, 2);
  const back = returnToGame({
    players: state.players, playerId: jaxon.id, quarter: 2, half: "back",
    lineups: state.lineups, segments: state.segments, slots: SLOTS, subMode: false,
    minHalves: 4, totalQuarters: 4, livePeriod: true,
  });
  const locked = { 1: back.lineups[1] };
  const planned = scheduleWholeGame({
    players: back.players, format: "6v6", slotOverride: SLOTS, lockedLineups: locked,
    fromQuarter: 2, totalPeriods: 4, minFraction: 0.5, seed: 4,
  });
  const segments = segmentsSavedForFullReplan(back.segments, planned, { fromQuarter: 2, livePeriod: true });
  const before = quarterCredit(players, planned, segments, 2);
  assert.equal(before, 13);
  assert.equal(segmentAt(segments, wes.id, 2), "left");
  const checked = revalidateBackHalfMarks({
    players: back.players, lineups: planned, segments, fromQuarter: 2, totalQuarters: 4,
  });
  assert.equal(isBackHalfReturn(checked.players.find(player => player.id === jaxon.id), 2), true);
  assert.equal(checked.notices.length, 0);
  assert.equal(segmentAt(checked.segments, wes.id, 2), "left");
  assert.equal(quarterCredit(players, checked.lineups, checked.segments, 2), 13);
});

test("rechecking a Q1 injury return keeps both first halves", () => {
  const players = roster(8);
  const opened = openSheet(players, true, 3);
  const state = injureStarter(players, opened.lineups, opened.segments, "p3", true, 1);
  const back = returnToGame({
    players: state.players, playerId: "p3", quarter: 1, half: "back",
    lineups: state.lineups, segments: state.segments, slots: SLOTS, subMode: true,
    minHalves: 4, totalQuarters: 4, livePeriod: true,
  });
  const before = quarterCredit(back.players, back.lineups, back.segments, 1);
  assert.equal(before, 14);
  const once = revalidateBackHalfMarks({
    players: back.players, lineups: back.lineups, segments: back.segments, fromQuarter: 1, totalQuarters: 4,
  });
  assert.equal(isBackHalfReturn(once.players.find(player => player.id === "p3"), 1), true);
  assert.equal(once.notices.length, 0);
  assert.equal(quarterCredit(once.players, once.lineups, once.segments, 1), 14);
  assert.equal(segmentAt(once.segments, "p2", 1), "left");
  assert.equal(segmentAt(once.segments, "p7", 1), "left");
  const twice = revalidateBackHalfMarks({
    players: once.players, lineups: once.lineups, segments: once.segments, fromQuarter: 1, totalQuarters: 4,
  });
  assert.deepEqual(twice.players, once.players);
  assert.deepEqual(twice.lineups, once.lineups);
  assert.deepEqual(twice.segments, once.segments);
  [true, false].forEach(subMode => {
    [1, 2, 3, 4].forEach(quarter => {
      let strips = 0;
      [8, 9].forEach(count => {
        for (let seed = 1; seed <= 15; seed += 1) {
          const squad = roster(count);
          const sheet = openSheet(squad, subMode, seed);
          const starters = (sheet.lineups[quarter]?.starters || []).filter(slot => slot.player && !isGkPosition(slot.pos));
          starters.forEach(slot => {
            const injured = injureStarter(squad, sheet.lineups, sheet.segments, slot.player.id, subMode, quarter);
            const returned = returnToGame({
              players: injured.players, playerId: slot.player.id, quarter, half: "back",
              lineups: injured.lineups, segments: injured.segments, slots: SLOTS, subMode,
              minHalves: 4, totalQuarters: 4, livePeriod: true,
            });
            if (returned.refused) return;
            const creditBefore = quarterCredit(returned.players, returned.lineups, returned.segments, quarter);
            const checked = revalidateBackHalfMarks({
              players: returned.players, lineups: returned.lineups, segments: returned.segments,
              fromQuarter: quarter, totalQuarters: 4,
            });
            if (!isBackHalfReturn(checked.players.find(player => player.id === slot.player.id), quarter)) strips += 1;
            assert.ok(
              quarterCredit(checked.players, checked.lineups, checked.segments, quarter) >= creditBefore,
              `${subMode} Q${quarter} seed ${seed} lost credit`,
            );
          });
        }
      });
      assert.equal(strips, 0, `${subMode ? "sub" : "full"} Q${quarter}`);
    });
  });
});

test("an unpartnered left keeps the back-half mark", () => {
  const players = roster(7);
  const slots = ["GK", "LD", "RD", "CM", "CF"];
  const wes = players[1];
  const jude = players[6];
  const lineup = {
    starters: [
      { pos: "GK", player: players[5] },
      { pos: "LD", player: players[2] },
      { pos: "RD", player: players[3] },
      { pos: "CM", player: players[4] },
      { pos: "CF", player: wes },
    ],
    bench: [jude],
  };
  const marked = players.map(player => (
    player.id === wes.id
      ? { ...player, returnQuarter: 2, injuredInQuarter: 1, returnAt: { quarter: 2, half: "back" } }
      : player
  ));
  const segments = { [jude.id]: { 2: "left" } };
  const checked = revalidateBackHalfMarks({
    players: marked, lineups: { 2: lineup }, segments, fromQuarter: 2, totalQuarters: 2,
  });
  assert.equal(isBackHalfReturn(checked.players.find(player => player.id === wes.id), 2), true);
  assert.equal(checked.notices.length, 0);
  assert.equal(segmentAt(checked.segments, jude.id, 2), "left");
  assert.equal(segmentAt(checked.segments, wes.id, 2), "entered");
  const view = quarterHalfPresentation(checked.lineups[2], checked.segments, 2, { returnerId: wes.id });
  assert.equal(view.pairs[0].outId, jude.id);
});

test("auto replan off repairs the short half an Out creates", () => {
  const players = roster(7);
  const opened = openSheet(players, true, 1);
  const updated = players.map(player => (
    player.id === "p2" ? { ...player, out: true, injured: false, injuredInQuarter: 1, returnQuarter: null } : player
  ));
  const next = pullFromPlan(opened.lineups, "p2", 1, 4);
  const checked = revalidateBackHalfMarks({
    players: updated, lineups: next, segments: opened.segments, fromQuarter: 1, totalQuarters: 4,
  });
  let halves = 0;
  for (let quarter = 1; quarter <= 4; quarter += 1) {
    const lineup = checked.lineups[quarter];
    const owners = halfOwners(lineup, checked.segments, quarter);
    assert.equal(owners.h1, onFieldCount(lineup), `Q${quarter}`);
    halves += owners.h1 + owners.h2;
  }
  assert.equal(halves, 48);
  assert.deepEqual(checked.lineups, next);
});

test("a live Out keeps the first half the replacement already played", () => {
  const slots = ["GK", "LD", "RD", "CM", "CF"];
  const players = roster(10);
  const opened = openSheet(players, true, 1, slots, "5v5");
  const outId = "p4";
  const incoming = benchReplacementId(opened.lineups[1], outId);
  let segments = clearPlayerSegmentsFrom(opened.segments, outId, 2, opened.lineups);
  segments = clearSegmentQuarter(segments, outId, 1);
  const next = pullFromPlan(opened.lineups, outId, 1, 4);
  if (segmentAt(segments, incoming, 1) === "left") segments = clearSegmentQuarter(segments, incoming, 1);
  else segments = noteSubSegment(segments, incoming, 1, "entered");
  const updated = players.map(player => (
    player.id === outId ? { ...player, out: true, injured: false, injuredInQuarter: 1, returnQuarter: null } : player
  ));
  const checked = revalidateBackHalfMarks({
    players: updated, lineups: next, segments, fromQuarter: 1, totalQuarters: 4,
  });
  for (let quarter = 1; quarter <= 4; quarter += 1) {
    const lineup = checked.lineups[quarter];
    assert.equal(halfOwners(lineup, checked.segments, quarter).h1, onFieldCount(lineup), `Q${quarter}`);
  }
  assert.equal(segmentAt(checked.segments, incoming, 1) == null, true);
});

test("a free donor keeps the back-half mark in the three reported games", () => {
  const names = [
    "John Smith", "Wes Johnson", "Jaxon Williams", "Remi Brown", "Sean Jones",
    "Henry Davis", "Jude Garcia", "Trey Miller", "Maddox Anderson", "Leo Martinez",
    "Nico Thomas",
  ];
  const nine = ["GK", "LD", "CD", "RD", "LM", "CM", "RM", "LF", "RF"];
  const eleven = namedRoster(names);
  const wes = eleven[1];
  const opened = openSheet(eleven, false, 1, nine, "9v9");
  let wide = {
    players: eleven, lineups: opened.lineups, segments: opened.segments, subMode: false, slots: nine, format: "9v9",
  };
  wide = withAbsence(wide, wes.id, 1);
  wide = returnFor(wide, wes.id, 3, "back");
  const starter = (wide.lineups[2]?.starters || []).find(slot => (
    slot.player && !isGkPosition(slot.pos) && slot.player.id !== wes.id
  ));
  const manual = markOutManual(wide, starter.player.id, 2);
  const wideChecked = revalidateBackHalfMarks({
    players: manual.players, lineups: manual.lineups, segments: manual.segments, fromQuarter: 2, totalQuarters: 4,
  });
  assert.equal(segmentAt(manual.segments, "p5", 3) == null, true);
  assert.equal(isBackHalfReturn(wideChecked.players.find(player => player.id === wes.id), 3), true);
  assert.equal(wideChecked.notices.length, 0);

  const eight = namedRoster(names.slice(0, 8));
  const john = eight[0];
  const smallOpen = openSheet(eight, true, 1, SLOTS, "6v6");
  let small = {
    players: eight, lineups: smallOpen.lineups, segments: smallOpen.segments, subMode: true, slots: SLOTS, format: "6v6",
  };
  small = withAbsence(small, eight[1].id, 1);
  small = returnFor(small, eight[1].id, 3, "back");
  const before = quarterHalfPresentation(small.lineups[3], small.segments, 3, { returnerId: eight[1].id });
  assert.equal(before.pairs[0].outId, john.id);
  const replanned = replanLikeApp(small, 3);
  const smallChecked = revalidateBackHalfMarks({
    players: replanned.players, lineups: replanned.lineups, segments: replanned.segments, fromQuarter: 3, totalQuarters: 4,
  });
  assert.equal(isBackHalfReturn(smallChecked.players.find(player => player.id === eight[1].id), 3), true);
  const keptPair = quarterHalfPresentation(smallChecked.lineups[3], smallChecked.segments, 3, { returnerId: eight[1].id });
  assert.equal(keptPair.pairs[0].outId, john.id);
  assert.equal(segmentAt(smallChecked.segments, john.id, 3), "left");
  assert.equal(smallChecked.notices.length, 0);

  const ten = namedRoster(names.slice(0, 10));
  const jude = ten.find(player => player.name.startsWith("Jude"));
  const leo = ten.find(player => player.name.startsWith("Leo"));
  const tenWes = ten[1];
  const tenOpen = openSheet(ten, false, 6, SLOTS, "6v6");
  let squad = {
    players: ten, lineups: tenOpen.lineups, segments: tenOpen.segments, subMode: false, slots: SLOTS, format: "6v6",
  };
  squad = withAbsence(squad, tenWes.id, 1);
  squad = returnFor(squad, tenWes.id, 3, "back");
  const judeOut = markOutManual(squad, jude.id, 2);
  assert.equal((judeOut.lineups[3].bench || []).some(player => player.id === leo.id), true);
  assert.equal(segmentAt(judeOut.segments, leo.id, 3) == null, true);
  const tenChecked = revalidateBackHalfMarks({
    players: judeOut.players, lineups: judeOut.lineups, segments: judeOut.segments, fromQuarter: 2, totalQuarters: 4,
  });
  assert.equal(isBackHalfReturn(tenChecked.players.find(player => player.id === tenWes.id), 3), true);
  const tenPair = quarterHalfPresentation(tenChecked.lineups[3], tenChecked.segments, 3, { returnerId: tenWes.id });
  assert.equal(tenPair.pairs[0].outId, leo.id);
  assert.equal(tenChecked.notices.length, 0);
});

test("auto replan off does not leave an empty slot while someone sits", () => {
  const players = namedRoster([
    "John Smith", "Wes Johnson", "Jaxon Williams", "Remi Brown", "Sean Jones",
    "Henry Davis", "Jude Garcia", "Trey Miller", "Maddox Anderson",
  ]);
  const wes = players[1];
  const opened = openSheet(players, true, 2);
  const absent = players.map(player => (
    player.id === wes.id ? { ...player, out: true, injured: false, injuredInQuarter: 1, returnQuarter: null } : player
  ));
  const gone = planAvailability({
    autoRegen: true, kind: "absent", players: absent, absentId: wes.id, quarter: 1,
    lineups: opened.lineups, segments: opened.segments, slots: SLOTS, subMode: true, minHalves: 4, totalQuarters: 4,
  });
  const back = returnToGame({
    players: absent, playerId: wes.id, quarter: 3, half: "back",
    lineups: gone.lineups, segments: gone.segments, slots: SLOTS, subMode: true, minHalves: 4, totalQuarters: 4,
  });
  let state = { players: back.players, lineups: back.lineups, segments: back.segments };
  [0, 2, 3].forEach(index => {
    const id = players[index].id;
    state = {
      players: state.players.map(player => (
        player.id === id ? markOut(player, { injuredInQuarter: 2, returnQuarter: null, midGameInjury: false }) : player
      )),
      lineups: pullFromPlan(state.lineups, id, 2, 4),
      segments: state.segments,
    };
  });
  const checked = revalidateBackHalfMarks({
    players: state.players, lineups: state.lineups, segments: state.segments, fromQuarter: 2, totalQuarters: 4,
  });
  assert.equal(onFieldCount(checked.lineups[3]), 6);
  assert.equal((checked.lineups[3].bench || []).filter(player => player?.id).length, 0);
  assert.equal(isBackHalfReturn(checked.players.find(player => player.id === wes.id), 3), false);
  assert.deepEqual(checked.notices, [backHalfStripNotice(wes, 3, "Q")]);
});

test("marking an out donor clears his future-quarter half", () => {
  const players = namedRoster([
    "John Smith", "Wes Johnson", "Jaxon Williams", "Remi Brown", "Sean Jones",
    "Henry Davis", "Jude Garcia", "Trey Miller", "Maddox Anderson",
  ]);
  const wes = players[1];
  const opened = openSheet(players, false, 2);
  let state = withAbsence({ players, lineups: opened.lineups, segments: opened.segments, subMode: false }, wes.id, 1);
  state = returnFor(state, wes.id, 3, "back");
  const donorId = quarterHalfPresentation(state.lineups[3], state.segments, 3, { returnerId: wes.id }).pairs[0].outId;
  assert.equal(segmentAt(state.segments, donorId, 3), "left");
  assert.equal(quarterHalves(donorId, state.lineups, state.segments, 3), 1);
  const manual = markOutManual(state, donorId, 2);
  assert.equal(segmentAt(manual.segments, donorId, 3), null);
  assert.equal(quarterHalves(donorId, manual.lineups, manual.segments, 3), 0);
  const checked = revalidateBackHalfMarks({
    players: manual.players, lineups: manual.lineups, segments: manual.segments, fromQuarter: 2, totalQuarters: 4,
  });
  assert.equal(quarterHalves(donorId, checked.lineups, checked.segments, 3), 0);
  const still = isBackHalfReturn(checked.players.find(player => player.id === wes.id), 3);
  if (still) {
    const view = quarterHalfPresentation(checked.lineups[3], checked.segments, 3, { returnerId: wes.id });
    assert.notEqual(view.pairs[0].outId, donorId);
    assert.notEqual(view.pairs[0].outId, goalkeeperId(checked.lineups[3]));
  } else {
    assert.ok(checked.notices.some(note => note.includes("Wes") && note.includes("Q3")));
  }
});

const FORMAT_SLOTS = {
  "5v5": ["GK", "LD", "RD", "CM", "CF"],
  "6v6": SLOTS,
  "7v7": ["GK", "LD", "RD", "LM", "CM", "RM", "CF"],
  "9v9": ["GK", "LD", "CD", "RD", "LM", "CM", "RM", "LF", "RF"],
};

const SWEEP_TRIGGERS = [
  "Out",
  "Injured",
  "earlier back-half return",
  "whole-quarter return",
  "Replan",
  "Replan Q2",
  "Replan Q3",
  "Replan Q4",
  "auto replan off plus Out",
  "auto replan off plus Injured",
  "second injury",
  "second out",
  "Out Q3",
  "Injured Q3",
  "later back-half return",
  "later whole-quarter return",
];

function h1Except(lineup, segments, quarter, skipId) {
  const seen = new Set();
  let count = 0;
  const add = (id) => {
    if (!id || seen.has(String(id))) return;
    seen.add(String(id));
    if (skipId && String(id) === String(skipId)) return;
    if (playerHalfMask(id, lineup, segmentAt(segments, id, quarter))[0]) count += 1;
  };
  (lineup?.starters || []).forEach(slot => add(slot.player?.id));
  (lineup?.bench || []).forEach(player => add(player?.id));
  return count;
}

test("every replan trigger keeps a back-half constraint or posts a notice", () => {
  assert.equal(SWEEP_TRIGGERS.length, 16);
  const totals = {};
  const seen = new Set();
  let overStrips = 0;
  [true, false].forEach(subMode => {
    Object.entries(FORMAT_SLOTS).forEach(([format, slots]) => {
      [8, 9, 10, 11, 12].forEach(count => {
        for (let seed = 1; seed <= 10; seed += 1) {
          [1, 2].forEach(marks => {
            const players = namedRoster([
              "John Smith", "Wes Johnson", "Jaxon Williams", "Remi Brown", "Sean Jones",
              "Henry Davis", "Jude Garcia", "Trey Miller", "Maddox Anderson", "Leo Martinez",
              "Nico Thomas", "Owen Clark",
            ].slice(0, count));
            const opened = openSheet(players, subMode, seed, slots, format);
            let state = {
              players, lineups: opened.lineups, segments: opened.segments, subMode, slots, format,
            };
            const wes = state.players[1];
            state = withAbsence(state, wes.id, 1);
            state = returnFor(state, wes.id, 3, "back");
            if (state.refused) return;
            if (marks === 2) {
              const other = state.players[2];
              state = withAbsence(state, other.id, 1);
              state = returnFor(state, other.id, 4, "back");
              if (state.refused) return;
            }
            const mode = `${format} ${subMode ? "sub" : "full"} ${marks === 1 ? "1 injury" : "2 injuries"}`;
            const jaxon = state.players.find(player => player.name.startsWith("Jaxon")) || state.players[3];
            const run = (name, from, raw) => {
              const checked = revalidateBackHalfMarks({
                players: raw.players,
                lineups: raw.lineups,
                segments: raw.segments,
                fromQuarter: from,
                totalQuarters: 4,
              });
              const label = `${mode} seed ${seed} roster ${count} ${name}`;
              assertBackHalfInvariants(label, raw, checked, from);
              for (let q = from; q <= 4; q += 1) {
                (raw.players || []).filter(player => isBackHalfReturn(player, q)).forEach(returner => {
                  const lineup = raw.lineups?.[q];
                  const on = onFieldCount(lineup);
                  const without = h1Except(lineup, raw.segments, q, returner.id);
                  const sheetIds = new Set(sheetPlayers(lineup).map(id => String(id)));
                  const lefts = Object.keys(raw.segments || {}).filter(id => sheetIds.has(String(id)) && segmentAt(raw.segments, id, q) === "left").length;
                  const entered = Object.keys(raw.segments || {}).filter(id => segmentAt(raw.segments, id, q) === "entered").length;
                  const still = isBackHalfReturn(checked.players.find(player => player.id === returner.id), q);
                  if (!still && on > 0 && without === on && lefts > entered) overStrips += 1;
                });
              }
              const key = `${format} ${subMode ? "sub" : "full"} ${name}`;
              const kept = isBackHalfReturn(checked.players.find(player => player.id === wes.id), 3);
              totals[key] = totals[key] || { kept: 0, stripped: 0 };
              totals[key][kept ? "kept" : "stripped"] += 1;
              seen.add(`${format} ${subMode ? "sub" : "full"} ${name}`);
            };
            const q3starter = (state.lineups[3]?.starters || []).find(slot => (
              slot.player && !isGkPosition(slot.pos) && slot.player.id !== wes.id
            ));
            run("Out", 1, markAbsentLikeApp({ ...state }, jaxon.id, 1, "out"));
            run("Injured", 1, markAbsentLikeApp({ ...state }, jaxon.id, 1, "injury"));
            const earlierSit = withAbsence(state, jaxon.id, 1);
            const earlierBack = returnFor(earlierSit, jaxon.id, 2, "back");
            if (!earlierBack.refused) run("earlier back-half return", 3, earlierBack);
            const whole = returnFor(withAbsence(state, jaxon.id, 1), jaxon.id, 2, "whole");
            if (!whole.refused) run("whole-quarter return", 2, whole);
            run("Replan", 1, replanLikeApp(state, 1));
            run("Replan Q2", 2, replanLikeApp(state, 2));
            run("Replan Q3", 3, replanLikeApp(state, 3));
            run("Replan Q4", 4, replanLikeApp(state, 4));
            const outfield = (state.lineups[2]?.starters || []).find(slot => slot.player && !isGkPosition(slot.pos) && slot.player.id !== wes.id);
            if (outfield) {
              run("auto replan off plus Out", 2, markOutManual(state, outfield.player.id, 2));
              run("auto replan off plus Injured", 2, markOutManual(state, outfield.player.id, 2, "injury"));
            }
            const q2starter = (state.lineups[2]?.starters || []).find(slot => slot.player && !isGkPosition(slot.pos));
            if (q2starter) {
              const injured = injureStarter(
                state.players, state.lineups, state.segments, q2starter.player.id, subMode, 2, slots,
              );
              const returned = returnToGame({
                players: injured.players, playerId: q2starter.player.id, quarter: 2, half: "back",
                lineups: injured.lineups, segments: injured.segments, slots, subMode, minHalves: 4, totalQuarters: 4, livePeriod: true,
              });
              if (!returned.refused) {
                const other = (returned.lineups[2]?.starters || []).find(slot => (
                  slot.player && !isGkPosition(slot.pos) && slot.player.id !== q2starter.player.id
                ));
                if (other) {
                  const carried = {
                    players: returned.players, lineups: returned.lineups, segments: returned.segments, subMode, slots, format,
                  };
                  run("second injury", 2, markAbsentLikeApp(carried, other.player.id, 2, "injury"));
                  run("second out", 2, markAbsentLikeApp(carried, other.player.id, 2, "out"));
                }
              }
            }
            if (q3starter) {
              run("Out Q3", 3, markAbsentLikeApp({ ...state }, q3starter.player.id, 3, "out"));
              run("Injured Q3", 3, markAbsentLikeApp({ ...state }, q3starter.player.id, 3, "injury"));
            }
            const laterBack = returnFor(withAbsence(state, jaxon.id, 1), jaxon.id, 4, "back");
            if (!laterBack.refused) run("later back-half return", 4, laterBack);
            const laterWhole = returnFor(withAbsence(state, jaxon.id, 1), jaxon.id, 4, "whole");
            if (!laterWhole.refused) run("later whole-quarter return", 4, laterWhole);
          });
        }
      });
    });
  });
  SWEEP_TRIGGERS.forEach(name => {
    ["5v5", "6v6", "7v7", "9v9"].forEach(format => {
      ["sub", "full"].forEach(mode => {
        const key = `${format} ${mode} ${name}`;
        assert.ok(seen.has(key), `${key} never ran`);
        assert.ok(totals[key].kept + totals[key].stripped > 0, `${key} had no cases`);
      });
    });
  });
  assert.equal(overStrips, 0);
  const six = {};
  Object.entries(totals).forEach(([key, value]) => {
    if (key.startsWith("6v6 ")) six[key.slice(4)] = value;
  });
  assert.deepEqual(six, {
    "sub Out": { kept: 20, stripped: 60 },
    "sub Injured": { kept: 20, stripped: 60 },
    "sub earlier back-half return": { kept: 40, stripped: 40 },
    "sub whole-quarter return": { kept: 40, stripped: 40 },
    "sub Replan": { kept: 30, stripped: 50 },
    "sub Replan Q2": { kept: 29, stripped: 51 },
    "sub Replan Q3": { kept: 70, stripped: 10 },
    "sub Replan Q4": { kept: 80, stripped: 0 },
    "sub auto replan off plus Out": { kept: 30, stripped: 50 },
    "sub auto replan off plus Injured": { kept: 30, stripped: 50 },
    "sub second injury": { kept: 1, stripped: 79 },
    "sub second out": { kept: 1, stripped: 79 },
    "sub Out Q3": { kept: 10, stripped: 70 },
    "sub Injured Q3": { kept: 10, stripped: 70 },
    "sub later back-half return": { kept: 80, stripped: 0 },
    "sub later whole-quarter return": { kept: 80, stripped: 0 },
    "full Out": { kept: 100, stripped: 0 },
    "full Injured": { kept: 100, stripped: 0 },
    "full earlier back-half return": { kept: 100, stripped: 0 },
    "full whole-quarter return": { kept: 100, stripped: 0 },
    "full Replan": { kept: 100, stripped: 0 },
    "full Replan Q2": { kept: 100, stripped: 0 },
    "full Replan Q3": { kept: 100, stripped: 0 },
    "full Replan Q4": { kept: 100, stripped: 0 },
    "full auto replan off plus Out": { kept: 90, stripped: 10 },
    "full auto replan off plus Injured": { kept: 90, stripped: 10 },
    "full second injury": { kept: 90, stripped: 10 },
    "full second out": { kept: 90, stripped: 10 },
    "full Out Q3": { kept: 90, stripped: 10 },
    "full Injured Q3": { kept: 90, stripped: 10 },
    "full later back-half return": { kept: 100, stripped: 0 },
    "full later whole-quarter return": { kept: 100, stripped: 0 },
  });
});

function quarterCredit(players, lineups, segments, quarter) {
  return players.reduce((sum, player) => sum + quarterHalves(player.id, lineups, segments, quarter), 0);
}

test("Wes is not given John, who already owns Sean's first half", () => {
  const players = namedRoster([
    "John Smith", "Wes Johnson", "Jaxon Williams", "Remi Brown", "Sean Jones",
    "Henry Davis", "Jude Garcia", "Trey Miller", "Maddox Anderson",
  ]);
  const [john, wes, jaxon, remi, sean, henry, jude, trey, maddox] = players;
  const starters = [
    { pos: "GK", player: henry },
    { pos: "LD", player: wes },
    { pos: "RD", player: jude },
    { pos: "LM", player: sean },
    { pos: "RM", player: trey },
    { pos: "CF", player: maddox },
  ];
  const marked = players.map(player => (
    player.id === wes.id
      ? { ...player, returnQuarter: 3, injuredInQuarter: 1, returnAt: { quarter: 3, half: "back" } }
      : player
  ));
  const trap = {
    3: { starters: starters.map(slot => ({ ...slot })), bench: [john, remi, jaxon] },
  };
  const trapSegments = {
    [sean.id]: { 3: "entered" },
    [trey.id]: { 3: "entered" },
    [maddox.id]: { 3: "entered" },
    [john.id]: { 3: "left" },
    [remi.id]: { 3: "left" },
    [jaxon.id]: { 3: "left" },
  };
  assert.equal(quarterCredit(players, trap, trapSegments, 3), 12);
  const trapped = revalidateBackHalfMarks({
    players: marked, lineups: trap, segments: trapSegments, fromQuarter: 3, totalQuarters: 4,
  });
  assert.equal(quarterCredit(players, trapped.lineups, trapped.segments, 3), 12);
  const owners = halfOwners(trapped.lineups[3], trapped.segments, 3);
  assert.equal(new Set(owners.h1Ids).size, owners.h1Ids.length);
  assert.equal(owners.h1 + owners.h2, 12);
  if (isBackHalfReturn(trapped.players.find(player => player.id === wes.id), 3)) {
    const view = quarterHalfPresentation(trapped.lineups[3], trapped.segments, 3, { returnerId: wes.id });
    assert.notEqual(view.pairs[0].outId, john.id);
    assert.equal(segmentAt(trapped.segments, john.id, 3), "left");
  } else {
    assert.deepEqual(trapped.notices, [backHalfStripNotice(wes, 3, "Q")]);
    assert.equal(segmentAt(trapped.segments, john.id, 3), "left");
    assert.equal(segmentAt(trapped.segments, sean.id, 3), "entered");
  }

  const openBench = {
    3: { starters: starters.map(slot => ({ ...slot })), bench: [john, remi, jaxon] },
  };
  const openSegments = {
    [sean.id]: { 3: "entered" },
    [john.id]: { 3: "left" },
  };
  assert.equal(quarterCredit(players, openBench, openSegments, 3), 12);
  const installed = revalidateBackHalfMarks({
    players: marked, lineups: openBench, segments: openSegments, fromQuarter: 3, totalQuarters: 4,
  });
  assert.equal(installed.notices.length, 0);
  assert.equal(isBackHalfReturn(installed.players.find(player => player.id === wes.id), 3), true);
  assert.equal(quarterCredit(players, installed.lineups, installed.segments, 3), 12);
  const view = quarterHalfPresentation(installed.lineups[3], installed.segments, 3, { returnerId: wes.id });
  assert.equal(view.pairs[0].outId, remi.id);
  assert.notEqual(view.pairs[0].outId, john.id);
  assert.equal(segmentAt(installed.segments, john.id, 3), "left");
  assert.equal(segmentAt(installed.segments, sean.id, 3), "entered");
  assert.equal(view.start.starters.some(slot => slot.player?.id === wes.id), false);
});

test("clearing an out player's half also clears his partner", () => {
  const players = namedRoster([
    "John Smith", "Wes Johnson", "Jaxon Williams", "Remi Brown", "Sean Jones",
    "Henry Davis", "Jude Garcia", "Trey Miller", "Maddox Anderson",
  ]);
  const field = players.slice(0, 6);
  const bench = players.slice(6);
  const lineups = {};
  for (let quarter = 1; quarter <= 4; quarter += 1) {
    lineups[quarter] = {
      starters: SLOTS.map((pos, index) => ({ pos, player: field[index] })),
      bench: bench.map(player => ({ ...player })),
    };
  }
  const entered = field[4];
  const left = bench[0];
  const segments = {
    [entered.id]: { 2: "entered" },
    [left.id]: { 2: "left" },
  };
  assert.equal(quarterCredit(players, lineups, segments, 1)
    + quarterCredit(players, lineups, segments, 2)
    + quarterCredit(players, lineups, segments, 3)
    + quarterCredit(players, lineups, segments, 4), 48);
  const cleared = clearPlayerSegmentsFrom(segments, left.id, 2, lineups);
  assert.equal(segmentAt(cleared, left.id, 2), null);
  assert.equal(segmentAt(cleared, entered.id, 2), null);
  const total = [1, 2, 3, 4].reduce((sum, quarter) => (
    sum + quarterCredit(players, lineups, cleared, quarter)
  ), 0);
  assert.equal(total, 48);
});

test("an out or injured returner is cleared with a status notice", () => {
  const players = namedRoster([
    "John Smith", "Wes Johnson", "Jaxon Williams", "Remi Brown", "Sean Jones",
    "Henry Davis", "Jude Garcia", "Trey Miller", "Maddox Anderson",
  ]);
  const wes = players[1];
  const john = players[0];
  ["out", "injury"].forEach(mode => {
    const marked = players.map(player => {
      if (player.id !== wes.id) return player;
      return {
        ...player,
        out: mode === "out",
        injured: mode === "injury",
        returnQuarter: 3,
        returnAt: { quarter: 3, half: "back" },
      };
    });
    const lineups = {
      3: {
        starters: SLOTS.map((pos, index) => ({ pos, player: index === 1 ? wes : players[index + 3] })),
        bench: [john, players[2], players[7]],
      },
    };
    const segments = { [wes.id]: { 3: "entered" }, [john.id]: { 3: "left" } };
    const checked = revalidateBackHalfMarks({
      players: marked, lineups, segments, fromQuarter: 3, totalQuarters: 4,
    });
    const status = mode === "out" ? "Out" : "Injured";
    assert.equal(isBackHalfReturn(checked.players.find(player => player.id === wes.id), 3), false, status);
    assert.deepEqual(checked.notices, [backHalfStatusNotice(marked.find(player => player.id === wes.id), "Q")], status);
    assert.equal(checked.notices[0], `Wes is marked ${status}, so his 2nd-half return in Q3 was cleared.`);
  });
});

test("a silent replan leaves the back-half notice up", () => {
  const sentence = backHalfStripNotice({ name: "Wes Johnson" }, 3, "Q");
  assert.equal(nextBackHalfNotice(sentence, ""), sentence);
  assert.equal(nextBackHalfNotice(sentence, "   "), sentence);
  const status = "Wes is marked Out, so his 2nd-half return in Q3 was cleared.";
  assert.equal(nextBackHalfNotice(sentence, status), status);
  assert.equal(nextBackHalfNotice(null, ""), null);
});
