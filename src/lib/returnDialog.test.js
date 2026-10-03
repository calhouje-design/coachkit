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
  returnToGame,
  scheduleHalfRotation,
  scheduleWholeGame,
  segmentAt,
  shareFieldSheet,
  stripReturnAtFrom,
  stripReturnAtForQuarter,
  vacatedSpotHolder,
} from "./gameDay.js";
import { redrawQuarterMembership } from "./fairPlay.js";
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

function openSheet(players, subMode, seed = 3) {
  if (subMode) {
    return scheduleHalfRotation(players, SLOTS, { minHalves: 4, totalQuarters: 4, seed });
  }
  return {
    lineups: scheduleWholeGame({
      players,
      format: "6v6",
      slotOverride: SLOTS,
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
    const donorBefore = quarterHalves(donorId, gone.lineups, marked, 2);
    assert.notEqual(segmentAt(back.segments, leo.id, 2), "entered", `returner mark seed ${seed}`);
    assert.equal(segmentAt(back.segments, donorId, 2), "left", `donor mark seed ${seed}`);
    assert.equal(quarterHalves(leo.id, back.lineups, back.segments, 2), 2, `returner seed ${seed}`);
    assert.equal(quarterHalves(donorId, back.lineups, back.segments, 2), 1, `donor seed ${seed}`);
    assert.equal(afterSum, before + (donorBefore >= 2 ? 0 : 1), `sum seed ${seed}`);
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
    assert.equal(segmentAt(back.segments, john.id, 2), "left", `sub ${subMode}`);
    assert.equal(quarterHalves(john.id, back.lineups, back.segments, 2), 1, `sub ${subMode}`);
    const after = players.reduce((sum, player) => sum + quarterHalves(player.id, back.lineups, back.segments, 2), 0);
    assert.equal(after, before + 1, `sub ${subMode}`);
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

test("a whole-quarter return leaves other back-half marks for the app to strip", () => {
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
  const stripped = stripReturnAtFrom(whole.players, 2);
  assert.equal(isBackHalfReturn(stripped.find(player => player.id === wes.id), 2), false);
  assert.equal(isBackHalfReturn(stripped.find(player => player.id === jaxon.id), 3), false);
  assert.equal(stripped.find(player => player.id === wes.id).returnQuarter, 2);
  assert.equal(stripped.find(player => player.id === jaxon.id).returnQuarter, 3);
  const redraw = redrawQuarterMembership(stripped, whole.lineups, 2, 2, 4, {
    segments: whole.segments,
    lockGoalkeeper: true,
  });
  assert.equal(redraw.ok, true, redraw.reason);
});

function sameQuarterInjurySweep(subMode) {
  const totals = { cases: 0, donorMatch: 0, sumSame: 0, sumPlus: 0, sumOther: 0 };
  [9, 10].forEach(count => {
    for (let seed = 1; seed <= 60; seed += 1) {
      const players = roster(count);
      const opened = openSheet(players, subMode, seed);
      const before = opened.lineups[2];
      (before?.starters || []).forEach(slot => {
        if (!slot.player || isGkPosition(slot.pos)) return;
        const id = slot.player.id;
        totals.cases += 1;
        const absent = players.map(player => (
          player.id === id
            ? { ...player, injured: true, out: false, midGameInjury: true, injuredInQuarter: 2, returnQuarter: null }
            : player
        ));
        const gone = planAvailability({
          autoRegen: true,
          kind: "absent",
          players: absent,
          absentId: id,
          quarter: 2,
          lineups: opened.lineups,
          segments: opened.segments,
          slots: SLOTS,
          subMode,
          minHalves: 4,
          totalQuarters: 4,
          livePeriod: true,
        });
        const replacedBy = vacatedSpotHolder(before, gone.lineups[2], id);
        const injured = absent.map(player => (
          player.id === id ? { ...player, replacedBy } : player
        ));
        const marked = noteSubSegment(gone.segments, id, 2, "left");
        const beforeSum = players.reduce((sum, player) => sum + quarterHalves(player.id, gone.lineups, marked, 2), 0);
        const back = returnToGame({
          players: injured,
          playerId: id,
          quarter: 2,
          half: "back",
          lineups: gone.lineups,
          segments: marked,
          slots: SLOTS,
          subMode,
          minHalves: 4,
          totalQuarters: 4,
          livePeriod: true,
        });
        const view = quarterHalfPresentation(back.lineups[2], back.segments, 2, { returnerId: id });
        const gk = goalkeeperId(gone.lineups[2]);
        const eligible = replacedBy && replacedBy !== gk && (gone.lineups[2]?.starters || []).some(item => (
          item.player?.id === replacedBy && !isGkPosition(item.pos)
        ));
        assert.equal(eligible, true, `holder sub ${subMode} seed ${seed} ${id}`);
        assert.equal(view?.pairs?.[0]?.outId, replacedBy, `donor sub ${subMode} seed ${seed} ${id}`);
        assert.notEqual(view.pairs[0].outId, gk);
        totals.donorMatch += 1;
        const donorBefore = quarterHalves(replacedBy, gone.lineups, marked, 2);
        assert.notEqual(segmentAt(back.segments, id, 2), "entered");
        assert.equal(segmentAt(back.segments, replacedBy, 2), "left");
        assert.equal(quarterHalves(id, back.lineups, back.segments, 2), 2);
        assert.equal(quarterHalves(replacedBy, back.lineups, back.segments, 2), 1);
        const afterSum = players.reduce((sum, player) => sum + quarterHalves(player.id, back.lineups, back.segments, 2), 0);
        const delta = afterSum - beforeSum;
        if (donorBefore >= 2) assert.equal(delta, 0, `sum sub ${subMode} seed ${seed} ${id}`);
        else assert.equal(delta, 1, `sum sub ${subMode} seed ${seed} ${id}`);
        if (delta === 0) totals.sumSame += 1;
        else if (delta === 1) totals.sumPlus += 1;
        else totals.sumOther += 1;
      });
    }
  });
  return totals;
}

test("the post-replan spot holder donates in every same-quarter injury", () => {
  const sub = sameQuarterInjurySweep(true);
  const full = sameQuarterInjurySweep(false);
  assert.equal(sub.cases, 600);
  assert.equal(sub.donorMatch, 600);
  assert.equal(sub.sumOther, 0);
  assert.equal(full.cases, 600);
  assert.equal(full.donorMatch, 600);
  assert.equal(full.sumSame, 600);
  assert.equal(full.sumPlus, 0);
  assert.equal(full.sumOther, 0);
  assert.equal(sub.sumSame, 305);
  assert.equal(sub.sumPlus, 295);
});
