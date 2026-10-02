import test from "node:test";
import assert from "node:assert/strict";
import {
  equityHalves,
  goalkeeperId,
  isGkPosition,
  periodHasRealEvent,
  planAvailability,
  playerQuarterPresence,
  realEventPlayerIds,
  returnToGame,
  scheduleHalfRotation,
  scheduleWholeGame,
} from "./gameDay.js";
import {
  availabilityCopy,
  commitReturn,
  finishedQuarterList,
  mismatchCopy,
  pregameCopy,
  quarterChoices,
  quarterIsLive,
  returnHeading,
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

function openSheet(players, subMode) {
  if (subMode) {
    return scheduleHalfRotation(players, SLOTS, { minHalves: 4, totalQuarters: 4, seed: 3 });
  }
  return {
    lineups: scheduleWholeGame({
      players,
      format: "6v6",
      slotOverride: SLOTS,
      totalPeriods: 4,
      minFraction: 0.5,
      seed: 3,
    }),
    segments: {},
  };
}

function sheetWithAbsence({ subMode, outFrom = 1 }) {
  const players = roster(9);
  const opened = openSheet(players, subMode);
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
