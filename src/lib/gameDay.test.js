import test from "node:test";
import assert from "node:assert/strict";
import { minQuarters } from "./fairPlay.js";
import { resolveSetup } from "./leagueRules.js";
import {
  effectiveQuarters,
  addMinutes,
  earnedMinutes,
  minuteGap,
  rankWhosNext,
  addPendingSwap,
  cancelOneSwap,
  parseDrop,
  resolveDragDrop,
  pullFromQuarter,
  pullFromPlan,
  addLateArrival,
  countedQuarters,
  setAppearanceCreditFor,
  noteSubSegment,
  clearSubSegmentsFrom,
  playCellKind,
  planBenchRotation,
  applyBenchRotation,
  segmentAt,
  markQuarterSub,
  retargetPair,
  pairsForDisplay,
  cellHalves,
  equityHalves,
  formatQuarterEquity,
  lineStopAtCircle,
  fieldMarker,
  shareFieldSheet,
  sharePlayTimeSheet,
  playerHalfMask,
  maxConsecutiveSits,
  goalkeeperId,
  planAvailability,
  returnToGame,
  scheduleHalfRotation,
  scheduleWholeGame,
  firstDifferentPlan,
  plansDiffer,
  planHistoryKey,
  sheetMeetsMinimum,
  liveReplanGoalkeeper,
  liveReplanClockDecision,
  clockAfterPeriodSwitch,
  periodHasRealEvent,
  noteRealPeriodEvent,
  realEventsThrough,
  giveReturnerHalfSlots,
  segmentsAfterFullReplan,
  rotatePlanSheet,
  replanCarryForward,
  preservePeriodMarks,
  segmentsSavedForSubReplan,
  segmentsSavedForFullReplan,
  gameLogFromStrategy,
  upsertGameLog,
  playerQuarterPresence,
  regenerateForAbsence,
} from "./gameDay.js";

test("appearance credit stacks on lineup quarters and banked minutes are not replaced", () => {
  assert.equal(effectiveQuarters(1, [2]), 2);
  const once = addMinutes({}, "a", 6);
  const twice = addMinutes(once, "a", 4);
  assert.equal(twice.a, 10);
  assert.equal(addMinutes(twice, "a", 0).a, 10);
});

test("live minutes add the open stint and the gap is what is left to the target", () => {
  const earned = earnedMinutes("a", {
    bank: { a: 8 },
    onField: true,
    clockSec: 180,
    stintStartSec: { a: 60 },
  });
  assert.equal(earned, 10);
  assert.equal(minuteGap(earned, 16), 6);
  assert.equal(earnedMinutes("a", { bank: { a: 8 }, onField: false, clockSec: 180, stintStartSec: {} }), 8);
});

test("who's next is the bench player with the fewest minutes", () => {
  const bench = [{ id: "b", name: "Bea" }, { id: "a", name: "Ann" }, { id: "c", name: "Cal" }];
  const ranked = rankWhosNext(bench, { a: 4, b: 12, c: 4 });
  assert.deepEqual(ranked.map(player => player.id), ["a", "c", "b"]);
});

test("queue accepts up to three and cancel removes only one", () => {
  let queue = [];
  for (const [outId, inId] of [["a", "b"], ["c", "d"], ["e", "f"]]) {
    const added = addPendingSwap(queue, { id: outId, outId, inId });
    assert.equal(added.ok, true);
    queue = added.queue;
  }
  const blocked = addPendingSwap(queue, { id: "g", outId: "g", inId: "h" });
  assert.equal(blocked.ok, false);
  assert.equal(blocked.queue.length, 3);
  const left = cancelOneSwap(queue, "c");
  assert.deepEqual(left.map(row => row.id), ["a", "e"]);
});

test("drag resolves field-field and field-bench, and ignores a drop on itself", () => {
  assert.deepEqual(parseDrop("field:2"), { type: "field", idx: 2 });
  assert.deepEqual(parseDrop("bench:p9"), { type: "bench", playerId: "p9" });
  assert.equal(resolveDragDrop({ type: "field", idx: 0 }, { type: "field", idx: 0 }).action, "none");
  assert.deepEqual(
    resolveDragDrop({ type: "field", idx: 1 }, { type: "field", idx: 3 }),
    { action: "swap-field", a: 1, b: 3 }
  );
  assert.deepEqual(
    resolveDragDrop({ type: "bench", playerId: "p2" }, { type: "field", idx: 0 }),
    { action: "swap-bench", fieldIdx: 0, playerId: "p2" }
  );
  assert.equal(resolveDragDrop({ type: "field", idx: 1 }, { type: "bench-zone" }).action, "bench-zone");
});

test("pulling a player keeps everyone else and does not touch earlier quarters", () => {
  const keep = { id: "keep", name: "Keep" };
  const gone = { id: "gone", name: "Gone" };
  const sub = { id: "sub", name: "Sub" };
  const q1 = {
    starters: [{ pos: "GK", player: keep }, { pos: "CF", player: gone }],
    bench: [sub],
  };
  const q2 = {
    starters: [{ pos: "GK", player: keep }, { pos: "CF", player: gone }],
    bench: [sub],
  };
  const next = pullFromPlan({ 1: q1, 2: q2 }, "gone", 2, 4);
  assert.equal(next[1], q1);
  assert.equal(next[2].starters[0].player.id, "keep");
  assert.equal(next[2].starters[1].player.id, "sub");
  assert.deepEqual(next[2].bench, []);
  const emptied = pullFromQuarter({ starters: [{ pos: "CF", player: gone }], bench: [] }, "gone");
  assert.equal(emptied.starters[0].player, null);
});

test("late arrival joins the bench without taking a starter spot", () => {
  const starter = { id: "s", name: "Start" };
  const newbie = { id: "n", name: "New" };
  const lineup = { starters: [{ pos: "GK", player: starter }], bench: [] };
  const next = addLateArrival(lineup, newbie);
  assert.equal(next.starters[0].player.id, "s");
  assert.equal(next.bench[0].id, "n");
  assert.equal(addLateArrival(next, newbie), next);
});

test("a quarter credited off the field is not counted again when the player returns", () => {
  assert.equal(countedQuarters([1], [1, 2]), 2);
  const off = setAppearanceCreditFor({}, "a", 2, true);
  assert.deepEqual(off.a, [2]);
  const back = setAppearanceCreditFor(off, "a", 2, false);
  assert.equal(back.a, undefined);
  const marked = noteSubSegment({}, "a", 2, "left");
  assert.equal(marked.a[2], "left");
  assert.deepEqual(clearSubSegmentsFrom({ a: { 1: "left", 2: "entered" } }, 2), { a: { 1: "left" } });
});

test("play chart distinguishes a full quarter from a partial sub", () => {
  assert.equal(playCellKind({ onField: true, segment: null }), "full");
  assert.equal(playCellKind({ onField: true, segment: "entered" }), "partial-on");
  assert.equal(playCellKind({ onField: false, segment: "left" }), "partial-off");
  assert.equal(playCellKind({ onField: false, segment: null }), "bench");
});

test("a mid-quarter plan never sends the goalkeeper off, even with the most minutes", () => {
  const lineup = {
    starters: [
      { pos: "GK", player: { id: "sam", name: "Sam" } },
      { pos: "CF", player: { id: "dee", name: "Dee" } },
    ],
    bench: [{ id: "bea", name: "Bea" }],
  };
  const pairs = planBenchRotation(lineup, { minutesById: { sam: 40, dee: 1, bea: 0 } });
  assert.deepEqual(pairs, [{ inId: "bea", outId: "dee", fromPlan: false }]);
  const swapped = applyBenchRotation(lineup, [{ inId: "bea", outId: "sam", fromPlan: false }, ...pairs]);
  assert.equal(swapped.starters.find(slot => slot.pos === "GK").player.id, "sam");
});

test("bench rotation names who comes on for whom from the next quarter", () => {
  const lineup = {
    starters: [
      { pos: "GK", player: { id: "sam", name: "Sam" } },
      { pos: "CF", player: { id: "dee", name: "Dee" } },
    ],
    bench: [
      { id: "bea", name: "Bea" },
      { id: "cal", name: "Cal" },
    ],
  };
  const next = {
    starters: [
      { pos: "GK", player: { id: "bea", name: "Bea" } },
      { pos: "CF", player: { id: "cal", name: "Cal" } },
    ],
    bench: [
      { id: "sam", name: "Sam" },
      { id: "dee", name: "Dee" },
    ],
  };
  const pairs = planBenchRotation(lineup, {
    minutesById: { sam: 10, dee: 4, bea: 1, cal: 2 },
    nextLineup: next,
  });
  assert.deepEqual(pairs, [{ inId: "bea", outId: "dee", fromPlan: true }]);
  assert.ok(pairs.every(pair => pair.outId !== "sam"));
});

test("everyone on the bench is paired even when the next quarter only covers some", () => {
  const lineup = {
    starters: [
      { pos: "GK", player: { id: "a", name: "Ann" } },
      { pos: "CF", player: { id: "b", name: "Bea" } },
    ],
    bench: [
      { id: "c", name: "Cal" },
      { id: "d", name: "Dee" },
    ],
  };
  const next = {
    starters: [
      { pos: "GK", player: { id: "c", name: "Cal" } },
      { pos: "CF", player: { id: "a", name: "Ann" } },
    ],
    bench: [
      { id: "b", name: "Bea" },
      { id: "d", name: "Dee" },
    ],
  };
  const pairs = planBenchRotation(lineup, { minutesById: {}, nextLineup: next });
  assert.deepEqual(pairs, [
    { inId: "c", outId: "b", fromPlan: true },
  ]);
  assert.ok(pairs.every(pair => pair.outId !== "a"));
});

test("a mid-quarter sub in Q2, Q3, or Q4 is stored and read like Q1", () => {
  let segments = markQuarterSub({}, 1, "ann", "bea");
  segments = markQuarterSub(segments, 2, "cal", "dee");
  segments = markQuarterSub(segments, 3, "gus", "hal");
  segments = markQuarterSub(segments, 4, "eve", "fay");
  const stored = JSON.parse(JSON.stringify(segments));
  assert.equal(segmentAt(stored, "ann", 1), "left");
  assert.equal(segmentAt(stored, "bea", 1), "entered");
  assert.equal(segmentAt(stored, "cal", 2), "left");
  assert.equal(segmentAt(stored, "dee", 2), "entered");
  assert.equal(segmentAt(stored, "gus", 3), "left");
  assert.equal(segmentAt(stored, "hal", 3), "entered");
  assert.equal(segmentAt(stored, "eve", 4), "left");
  assert.equal(segmentAt(stored, "fay", 4), "entered");
  assert.equal(playCellKind({ onField: false, segment: segmentAt(stored, "cal", 2) }), "partial-off");
  assert.equal(playCellKind({ onField: true, segment: segmentAt(stored, "dee", 2) }), "partial-on");
  assert.equal(playCellKind({ onField: false, segment: segmentAt(stored, "gus", 3) }), "partial-off");
  assert.equal(playCellKind({ onField: true, segment: segmentAt(stored, "hal", 3) }), "partial-on");
  assert.equal(playCellKind({ onField: true, segment: segmentAt(stored, "fay", 4) }), "partial-on");
  assert.equal(playCellKind({ onField: false, segment: segmentAt(stored, "eve", 4) }), "partial-off");
  assert.equal(segmentAt(stored, "cal", 4), null);
  assert.equal(playCellKind({ onField: true, segment: segmentAt(stored, "cal", 3) }), "full");
});

test("two taps retarget the dotted line without dropping the other bench players", () => {
  const lineup = {
    starters: [
      { pos: "GK", player: { id: "sam", name: "Sam" } },
      { pos: "CF", player: { id: "dee", name: "Dee" } },
    ],
    bench: [
      { id: "bea", name: "Bea" },
      { id: "cal", name: "Cal" },
    ],
  };
  const auto = [
    { inId: "bea", outId: "sam", fromPlan: true },
    { inId: "cal", outId: "dee", fromPlan: true },
  ];
  const refused = retargetPair([], "bea", "sam", lineup);
  assert.deepEqual(refused, []);
  const manual = retargetPair([], "bea", "dee", lineup);
  const shown = pairsForDisplay(auto, manual, lineup);
  assert.deepEqual(shown.find(pair => pair.inId === "bea"), { inId: "bea", outId: "dee", fromPlan: false });
  assert.equal(shown.find(pair => pair.outId === "sam"), undefined);
});

test("half-quarters sum to the 50% line and a split is not a full quarter", () => {
  const lineups = {
    1: { starters: [{ player: { id: "jaxon" } }], bench: [] },
    2: { starters: [{ player: { id: "ellis" } }], bench: [{ id: "jaxon" }] },
    3: { starters: [{ player: { id: "jaxon" } }], bench: [] },
    4: { starters: [{ player: { id: "ellis" } }], bench: [{ id: "jaxon" }] },
  };
  const segments = { jaxon: { 1: "entered" } };
  const halves = equityHalves("jaxon", { lineups, segments, credit: { jaxon: [1] }, quarters: [1, 2, 3, 4] });
  assert.equal(cellHalves({ onField: true, segment: "entered", credited: true }), 1);
  assert.equal(cellHalves({ onField: true, segment: null }), 2);
  assert.equal(cellHalves({ onField: false, segment: "left", credited: true }), 1);
  assert.equal(cellHalves({ onField: false, segment: null, credited: true }), 2);
  assert.equal(halves, 3);
  assert.equal(formatQuarterEquity(halves), "1½");
  assert.ok(halves < 4, "3 halves is under 2 of 4 quarters");
  const met = equityHalves("ellis", {
    lineups,
    segments: {},
    credit: {},
    quarters: [1, 2, 3, 4],
  });
  assert.equal(met, 4);
  assert.equal(formatQuarterEquity(5), "2½");
});

test("a connector stops on the circle rim, not the center", () => {
  const end = lineStopAtCircle(0, 50, 100, 50, 20);
  assert.equal(Math.round(end.x), 80);
  assert.equal(Math.round(end.y), 50);
  const diagonal = lineStopAtCircle(0, 0, 30, 40, 10);
  const dist = Math.hypot(diagonal.x - 30, diagonal.y - 40);
  assert.ok(Math.abs(dist - 10) < 0.001);
});

test("bringing the bench on keeps positions and does not touch the original lineup", () => {
  const lineup = {
    starters: [
      { pos: "GK", player: { id: "a", name: "Ann" } },
      { pos: "CF", player: { id: "b", name: "Bea" } },
      { pos: "CM", player: { id: "c", name: "Cal" } },
    ],
    bench: [
      { id: "d", name: "Dee" },
      { id: "e", name: "Eve" },
    ],
  };
  const pairs = planBenchRotation(lineup, { minutesById: { a: 1, b: 9, c: 5, d: 0, e: 3 } });
  assert.deepEqual(pairs, [
    { inId: "d", outId: "b", fromPlan: false },
    { inId: "e", outId: "c", fromPlan: false },
  ]);
  const next = applyBenchRotation(lineup, pairs);
  assert.deepEqual(next.starters.map(slot => slot.player.id), ["a", "d", "e"]);
  assert.deepEqual(next.starters.map(slot => slot.pos), ["GK", "CF", "CM"]);
  assert.deepEqual(next.bench.map(player => player.id).sort(), ["b", "c"]);
  assert.equal(lineup.starters[1].player.id, "b");
});

function halfRoster(count) {
  return Array.from({ length: count }, (_, i) => ({
    id: `p${i + 1}`,
    name: `P${i + 1}`,
    positions: ["GK", "CM", "CF"],
    injured: false,
    out: false,
  }));
}

function sitRun(playerId, lineups, segments) {
  const mask = [];
  for (let q = 1; q <= 4; q++) {
    mask.push(...playerHalfMask(playerId, lineups[q], segments?.[playerId]?.[q]));
  }
  return maxConsecutiveSits(mask);
}

test("sub mode spreads sit halves and still reaches 4 of 8", () => {
  const players = halfRoster(9);
  const slots = ["GK", "LD", "RD", "LM", "RM", "CF"];
  const { lineups, segments } = scheduleHalfRotation(players, slots, {
    minHalves: 4,
    rate: player => 10 - Number(player.id.slice(1)),
  });
  players.forEach(player => {
    const halves = equityHalves(player.id, { lineups, segments, credit: {}, quarters: [1, 2, 3, 4] });
    assert.ok(halves >= 4, `${player.id} has ${halves} halves`);
    assert.ok(sitRun(player.id, lineups, segments) <= 1, `${player.id} sat two halves in a row`);
  });
  const split = Object.values(segments).some(row => Object.keys(row).length > 0);
  assert.equal(split, true);
  [1, 2, 3, 4].forEach(q => {
    const gk = lineups[q].starters.find(slot => slot.pos === "GK");
    assert.ok(gk?.player, `Q${q} has a goalkeeper`);
    assert.equal(segments[gk.player.id]?.[q], undefined, `Q${q} goalkeeper is not a mid-quarter sub`);
  });
});

test("sub mode keeps earlier quarters when replanning from Q3", () => {
  const players = halfRoster(8);
  const slots = ["GK", "LD", "RD", "LM", "RM", "CF"];
  const locked = {
    1: {
      starters: players.slice(0, 6).map((player, i) => ({ pos: slots[i], player })),
      bench: players.slice(6),
    },
  };
  const { lineups } = scheduleHalfRotation(players, slots, {
    minHalves: 4,
    fromQuarter: 3,
    lockedLineups: locked,
    rate: () => 1,
  });
  assert.equal(lineups[1], locked[1]);
  assert.equal(lineups[3].starters.length, 6);
  assert.ok(lineups[4]);
});

test("a game log stores the strategy and a second save updates that day", () => {
  const entry = gameLogFromStrategy({
    id: "g1",
    date: "2026-09-27",
    opponent: "Rockets",
    homeScore: 2,
    oppScore: 1,
    formation: "2-2-1",
    formationLabel: "Balanced",
    subMode: true,
    format: "6v6",
    league: "U8 / Passers",
    lineups: { 1: { starters: [], bench: [] } },
    savedAt: "2026-09-27T12:00:00.000Z",
  });
  assert.equal(entry.strategy.subMode, true);
  assert.equal(entry.strategy.formation, "2-2-1");
  assert.equal(entry.strategy.sheets, null);
  const again = gameLogFromStrategy({ ...entry, id: "g2", formation: "3-2", subMode: false, homeScore: 9 });
  const updated = upsertGameLog([entry], again);
  assert.equal(updated.length, 1);
  assert.equal(updated[0].id, "g1");
  assert.equal(updated[0].homeScore, 2);
  assert.equal(updated[0].strategy.formation, "3-2");
  assert.equal(updated[0].strategy.subMode, false);
  const other = upsertGameLog(updated, gameLogFromStrategy({ id: "g3", date: "2026-10-04", opponent: "Rockets", formation: "2-1-2" }));
  assert.equal(other.length, 2);
});

test("field markers match the pitch and a repeated spot steps sideways", () => {
  const gk = fieldMarker("GK", 0, 1);
  assert.equal(gk.x, 160);
  assert.ok(Math.abs(gk.y - 418.6) < 0.01);
  const left = fieldMarker("CM", 0, 2);
  const right = fieldMarker("CM", 1, 2);
  assert.ok(left.x < right.x);
});

test("share sheets keep the bench, the sub lines, and the green-bar cells", () => {
  const slots = ["GK", "LD", "RD", "LM", "RM", "CF"];
  const names = ["Ann", "Bea", "Cal", "Dee", "Eve", "Fay", "Gia"];
  const players = names.map((name, i) => ({
    id: name[0].toLowerCase(),
    name,
    number: String(i + 1),
    injured: false,
    out: false,
  }));
  const on = players.slice(0, 6);
  const bench = [players[6]];
  const q2On = [players[6], ...on.slice(1)];
  const lineups = {
    1: { starters: on.map((player, i) => ({ pos: slots[i], player })), bench },
    2: { starters: q2On.map((player, i) => ({ pos: slots[i], player })), bench: [players[0]] },
  };
  const segments = { g: { 2: "entered" }, a: { 2: "left" } };
  const field = shareFieldSheet({ lineups, pairPlan: {}, subMode: true });
  assert.equal(field.quarters.length, 4);
  assert.equal(field.quarters[0].bench[0].id, "g");
  assert.equal(field.quarters[0].pairs.length, 1);
  assert.equal(field.quarters[0].pairs[0].inId, "g");
  assert.notEqual(field.quarters[0].pairs[0].outId, "a");
  assert.ok(field.quarters[0].starters.every(slot => slot.x > 0 && slot.y > 0));
  const quiet = shareFieldSheet({ lineups, subMode: false });
  assert.equal(quiet.quarters[0].pairs.length, 0);
  assert.equal(quiet.quarters[0].bench.length, 1);

  const play = sharePlayTimeSheet({ players, lineups, segments, credit: {}, minQ: 2 });
  const gia = play.rows.find(row => row.id === "g");
  assert.equal(gia.cells[0].kind, "bench");
  assert.equal(gia.cells[1].kind, "partial-on");
  const ann = play.rows.find(row => row.id === "a");
  assert.equal(ann.cells[0].kind, "full");
  assert.equal(ann.cells[1].kind, "partial-off");
  assert.match(ann.label, /Q$/);

  const saved = gameLogFromStrategy({
    id: "g9",
    date: "2026-09-27",
    opponent: "Rockets",
    formation: "2-2-1",
    subMode: true,
    lineups,
    sheets: { field, playTime: play },
  });
  assert.equal(saved.strategy.sheets.field.quarters.length, 4);
  assert.equal(saved.strategy.sheets.playTime.rows.length, 7);
});

test("injury in Q1 regenerates the lineup and leaves Q2 blank until they return in Q3", () => {
  const players = halfRoster(8);
  const slots = ["GK", "LD", "RD", "LM", "RM", "CF"];
  const before = scheduleHalfRotation(players, slots, { minHalves: 4, rate: () => 1 });
  const absentId = "p8";
  const gk = goalkeeperId(before.lineups[1]);
  assert.notEqual(gk, absentId);
  assert.notEqual(playerQuarterPresence(before.lineups[2], absentId), "blank");
  const injured = regenerateForAbsence({
    players,
    slots,
    lineups: before.lineups,
    segments: before.segments,
    absentId,
    fromQuarter: 1,
    returnQuarter: null,
    minHalves: 4,
    subMode: true,
    rate: () => 1,
  });
  [1, 2, 3, 4].forEach(q => {
    assert.equal(playerQuarterPresence(injured.lineups[q], absentId), "blank", `Q${q} still lists ${absentId}`);
    injured.lineups[q].starters.forEach(slot => {
      assert.ok(slot.player, `Q${q} ${slot.pos} was left empty`);
      assert.notEqual(slot.player.id, absentId);
    });
  });
  assert.equal(goalkeeperId(injured.lineups[1]), gk, "injury regen kept the quarter's goalkeeper");
  const back = regenerateForAbsence({
    players,
    slots,
    lineups: injured.lineups,
    segments: injured.segments,
    absentId,
    fromQuarter: 1,
    returnQuarter: 3,
    minHalves: 4,
    subMode: true,
    rate: () => 1,
  });
  assert.equal(playerQuarterPresence(back.lineups[1], absentId), "blank");
  assert.equal(playerQuarterPresence(back.lineups[2], absentId), "blank");
  assert.notEqual(playerQuarterPresence(back.lineups[3], absentId), "blank");
  back.lineups[2].starters.forEach(slot => assert.ok(slot.player, `Q2 ${slot.pos} dropped out of the reflow`));
  assert.equal(goalkeeperId(back.lineups[1]), gk);
});

test("full-quarter injury refills the open slot and stays blank until the return quarter", () => {
  const keep = { id: "keep", name: "Keep", injured: false, out: false, positions: ["GK"] };
  const gone = { id: "gone", name: "Gone", injured: false, out: false, positions: ["CF"] };
  const sub = { id: "sub", name: "Sub", injured: false, out: false, positions: ["CF"] };
  const quarter = {
    starters: [{ pos: "GK", player: keep }, { pos: "CF", player: gone }],
    bench: [sub],
  };
  const lineups = { 1: quarter, 2: quarter, 3: quarter, 4: quarter };
  const injured = regenerateForAbsence({
    players: [keep, gone, sub],
    slots: ["GK", "CF"],
    lineups,
    absentId: "gone",
    fromQuarter: 1,
    returnQuarter: null,
    subMode: false,
  });
  assert.equal(playerQuarterPresence(injured.lineups[2], "gone"), "blank");
  assert.equal(injured.lineups[2].starters[0].player.id, "keep");
  assert.equal(injured.lineups[2].starters[1].player.id, "sub");
  const back = regenerateForAbsence({
    players: [keep, gone, sub],
    slots: ["GK", "CF"],
    lineups: injured.lineups,
    absentId: "gone",
    fromQuarter: 1,
    returnQuarter: 3,
    subMode: false,
  });
  assert.equal(playerQuarterPresence(back.lineups[2], "gone"), "blank");
  assert.equal(playerQuarterPresence(back.lineups[1], "gone"), "blank");
  assert.notEqual(playerQuarterPresence(back.lineups[3], "gone"), "blank");
  assert.equal(back.lineups[3].starters[0].player.id, "keep");
});

test("a two-period game keeps the goalkeeper for both halves of each period", () => {
  const players = halfRoster(8);
  const slots = ["GK", "LD", "RD", "LM", "RM", "CF"];
  const { lineups, segments } = scheduleHalfRotation(players, slots, {
    minHalves: 2,
    totalQuarters: 2,
    rate: player => 10 - Number(player.id.slice(1)),
  });
  [1, 2].forEach(q => {
    const gk = goalkeeperId(lineups[q]);
    assert.ok(gk, `period ${q} has a goalkeeper`);
    assert.equal(segments[gk]?.[q], undefined, `period ${q} goalkeeper is not swapped at the half`);
  });
  assert.equal(lineups[3], undefined);
});

test("a lineup with no goalkeeper slot does not assign one", () => {
  const players = halfRoster(6);
  const slots = ["LD", "RD", "LM", "RM"];
  const { lineups } = scheduleHalfRotation(players, slots, {
    minHalves: 2,
    totalQuarters: 2,
    rate: () => 1,
  });
  [1, 2].forEach(q => {
    assert.equal(goalkeeperId(lineups[q]), null);
    assert.equal(lineups[q].starters.some(slot => slot.pos === "GK"), false);
    assert.equal(lineups[q].starters.length, 4);
  });
});

test("a three-period plan returns lineups for periods 1, 2, and 3", () => {
  const players = halfRoster(7);
  const slots = ["GK", "LD", "RD", "LM", "RM", "CF"];
  const { lineups } = scheduleHalfRotation(players, slots, {
    minHalves: 3,
    totalQuarters: 3,
    rate: () => 1,
  });
  assert.ok(lineups[1]);
  assert.ok(lineups[2]);
  assert.ok(lineups[3]);
  assert.equal(lineups[4], undefined);
  assert.equal(Object.keys(lineups).sort().join(","), "1,2,3");
});

function sheetFor(total, slots = ["GK", "LD", "RD", "LM", "RM", "CF"]) {
  const players = halfRoster(8).map(player => ({ ...player, positions: ["GK", "LD", "RD", "LM", "RM", "CF"] }));
  const planned = scheduleHalfRotation(players, slots, {
    minHalves: total,
    totalQuarters: total,
    rate: player => 10 - Number(player.id.slice(1)),
  });
  return { players, slots, ...planned };
}

test("a late arrival is planned from that period forward and earlier periods stay", () => {
  for (const total of [2, 3, 4]) {
    const { players, slots, lineups } = sheetFor(total);
    const gone = pullFromPlan(lineups, "p8", 1, total);
    for (let boundary = 1; boundary <= total; boundary++) {
      const arrived = planAvailability({
        autoRegen: true,
        kind: "return",
        players: players.map(player => player.id === "p8" ? { ...player, out: false, injured: false } : player),
        absentId: "p8",
        quarter: boundary,
        totalQuarters: total,
        lineups: gone,
        slots,
        subMode: true,
        minHalves: total,
        livePeriod: false,
      });
      for (let q = 1; q < boundary; q++) {
        assert.equal(arrived.lineups[q], gone[q], `${total} periods, before ${boundary}`);
        assert.equal(playerQuarterPresence(arrived.lineups[q], "p8"), "blank");
      }
      assert.notEqual(playerQuarterPresence(arrived.lineups[boundary], "p8"), "blank", `p8 missing at ${boundary} of ${total}`);
      assert.ok(arrived.lineups[total]);
      assert.equal(arrived.lineups[total + 1], undefined);
    }
  }
});

test("marking a player out rebuilds from the current period and leaves completed periods", () => {
  const { players, slots, lineups } = sheetFor(4);
  const out = planAvailability({
    autoRegen: true,
    kind: "absent",
    players: players.map(player => player.id === "p3" ? { ...player, out: true } : player),
    absentId: "p3",
    quarter: 3,
    totalQuarters: 4,
    lineups,
    slots,
    subMode: true,
    minHalves: 4,
    livePeriod: true,
  });
  assert.equal(out.lineups[1], lineups[1]);
  assert.equal(out.lineups[2], lineups[2]);
  assert.equal(playerQuarterPresence(out.lineups[3], "p3"), "blank");
  assert.equal(playerQuarterPresence(out.lineups[4], "p3"), "blank");
});

test("an injured player who returns is restored from the current period only", () => {
  const { players, slots, lineups } = sheetFor(4);
  const hurt = planAvailability({
    autoRegen: true,
    kind: "absent",
    players: players.map(player => player.id === "p4" ? { ...player, injured: true } : player),
    absentId: "p4",
    quarter: 2,
    totalQuarters: 4,
    lineups,
    slots,
    subMode: true,
    minHalves: 4,
  });
  assert.equal(hurt.lineups[1], lineups[1]);
  assert.equal(playerQuarterPresence(hurt.lineups[2], "p4"), "blank");
  const back = planAvailability({
    autoRegen: true,
    kind: "return",
    players,
    absentId: "p4",
    quarter: 3,
    totalQuarters: 4,
    lineups: hurt.lineups,
    segments: hurt.segments,
    slots,
    subMode: true,
    minHalves: 4,
    livePeriod: false,
  });
  assert.equal(back.lineups[1], hurt.lineups[1]);
  assert.equal(back.lineups[2], hurt.lineups[2]);
  assert.notEqual(playerQuarterPresence(back.lineups[3], "p4"), "blank");
});

test("a goalkeeper returning mid-period does not take the gloves", () => {
  const { players, slots, lineups } = sheetFor(3);
  const gk = goalkeeperId(lineups[2]);
  assert.ok(gk);
  const hurt = planAvailability({
    autoRegen: true,
    kind: "absent",
    players: players.map(player => player.id === gk ? { ...player, injured: true } : player),
    absentId: gk,
    quarter: 2,
    totalQuarters: 3,
    lineups,
    slots,
    subMode: true,
    minHalves: 3,
    livePeriod: true,
  });
  const replacement = goalkeeperId(hurt.lineups[2]);
  assert.ok(replacement);
  assert.notEqual(replacement, gk);
  const back = planAvailability({
    autoRegen: true,
    kind: "return",
    players,
    absentId: gk,
    quarter: 2,
    totalQuarters: 3,
    lineups: hurt.lineups,
    segments: hurt.segments,
    slots,
    subMode: true,
    minHalves: 3,
    livePeriod: true,
  });
  assert.equal(goalkeeperId(back.lineups[2]), replacement);
  assert.equal(back.lineups[1], hurt.lineups[1]);
});

test("auto-regenerate off does not rebuild the other players", () => {
  const { players, slots, lineups } = sheetFor(2);
  const keeper = goalkeeperId(lineups[2]);
  const out = planAvailability({
    autoRegen: false,
    kind: "absent",
    players,
    absentId: "p5",
    quarter: 2,
    totalQuarters: 2,
    lineups,
    slots,
  });
  assert.equal(out.lineups[1], lineups[1]);
  assert.equal(goalkeeperId(out.lineups[2]), keeper === "p5" ? goalkeeperId(out.lineups[2]) : keeper);
  const before = lineups[2].starters.filter(slot => slot.player?.id && slot.player.id !== "p5").map(slot => slot.player.id);
  const after = out.lineups[2].starters.filter(slot => slot.player?.id && slot.player.id !== "p5").map(slot => slot.player.id);
  before.forEach(id => assert.ok(after.includes(id), `${id} was rebuilt while auto-regenerate was off`));
  const back = planAvailability({
    autoRegen: false,
    kind: "return",
    players,
    absentId: "p5",
    quarter: 2,
    totalQuarters: 2,
    lineups: out.lineups,
    slots,
  });
  assert.equal(back.lineups[1], out.lineups[1]);
  assert.equal(back.lineups[2], out.lineups[2]);
});

test("return to the game uses one path from the top control and the roster button", () => {
  for (const total of [2, 3, 4]) {
    const { players, slots, lineups } = sheetFor(total);
    const gone = pullFromPlan(lineups, "p6", 1, total);
    const markedOut = players.map(player => player.id === "p6" ? { ...player, out: true, injured: false } : player);
    for (const source of ["top", "roster"]) {
      const back = returnToGame({
        source,
        autoRegen: true,
        players: markedOut,
        playerId: "p6",
        quarter: total,
        totalQuarters: total,
        lineups: gone,
        slots,
        subMode: true,
        minHalves: total,
        livePeriod: false,
      });
      assert.equal(back.source, source);
      assert.equal(back.regenerated, true);
      assert.equal(back.players.find(player => player.id === "p6").out, false);
      assert.equal(back.players.find(player => player.id === "p6").injured, false);
      for (let q = 1; q < total; q++) assert.equal(back.lineups[q], gone[q]);
      assert.notEqual(playerQuarterPresence(back.lineups[total], "p6"), "blank");
    }
    const hurt = players.map(player => player.id === "p6" ? { ...player, injured: true, out: false, midGameInjury: true } : player);
    const fromRoster = returnToGame({
      source: "roster",
      autoRegen: true,
      players: hurt,
      playerId: "p6",
      quarter: total,
      totalQuarters: total,
      lineups: gone,
      slots,
      subMode: true,
      minHalves: total,
      livePeriod: false,
    });
    assert.equal(fromRoster.players.find(player => player.id === "p6").injured, false);
    assert.equal(fromRoster.lineups[1], total === 1 ? gone[1] : gone[1]);
    for (let q = 1; q < total; q++) assert.equal(fromRoster.lineups[q], gone[q]);

    const quiet = returnToGame({
      source: "top",
      autoRegen: false,
      players: markedOut,
      playerId: "p6",
      quarter: 2,
      totalQuarters: total,
      lineups: gone,
      slots,
    });
    assert.equal(quiet.regenerated, false);
    assert.equal(quiet.lineups, gone);
    assert.equal(quiet.players.find(player => player.id === "p6").out, false);
  }
});

function gkCredit(lineups, segments, playerId, quarter) {
  const lineup = lineups[quarter];
  const onField = (lineup?.starters || []).some(slot => slot.player?.id === playerId);
  const segment = segmentAt(segments, playerId, quarter);
  return {
    onField,
    segment,
    kind: playCellKind({ onField, segment }),
    halves: equityHalves(playerId, { lineups, segments, quarters: [quarter] }),
  };
}

test("a live injury keeps full-period credit for the goalkeeper who stays in goal", () => {
  const roster = ["keep", "alt", "a", "b", "c", "hurt"].map(id => ({
    id,
    name: id,
    positions: id === "keep" || id === "alt" ? ["GK", "CM", "CF"] : ["CM", "CF"],
    injured: false,
    out: false,
  }));
  const byId = Object.fromEntries(roster.map(player => [player.id, player]));
  const slots = ["GK", "CM", "CF"];
  const lineups = {
    1: {
      starters: [
        { pos: "GK", player: byId.keep },
        { pos: "CM", player: byId.a },
        { pos: "CF", player: byId.b },
      ],
      bench: [byId.alt, byId.c, byId.hurt],
    },
    2: {
      starters: [
        { pos: "GK", player: byId.keep },
        { pos: "CM", player: byId.a },
        { pos: "CF", player: byId.c },
      ],
      bench: [byId.alt, byId.b, byId.hurt],
    },
  };
  for (const total of [2, 3, 4]) {
    const sheet = {};
    for (let q = 1; q <= total; q++) sheet[q] = lineups[q] || lineups[2];
    const hurt = planAvailability({
      autoRegen: true,
      kind: "absent",
      players: roster.map(player => player.id === "hurt" ? { ...player, injured: true } : player),
      absentId: "hurt",
      quarter: 2,
      totalQuarters: total,
      lineups: sheet,
      segments: { keep: { 1: "entered" } },
      slots,
      subMode: true,
      minHalves: Math.max(2, total),
      livePeriod: true,
    });
    assert.equal(goalkeeperId(hurt.lineups[2]), "keep", `${total} periods`);
    const credit = gkCredit(hurt.lineups, hurt.segments, "keep", 2);
    assert.equal(credit.segment, null, `${total} periods`);
    assert.equal(credit.kind, "full", `${total} periods`);
    assert.equal(credit.halves, 2, `${total} periods`);
    assert.equal(hurt.lineups[1], sheet[1]);
  }
});

test("a live return leaves the goalkeeper who stays in goal with a full period", () => {
  for (const total of [2, 3, 4]) {
    const players = Array.from({ length: 8 }, (_, i) => ({
      id: `p${i + 1}`,
      name: `P${i + 1}`,
      positions: ["GK", "LD", "RD", "LM", "RM", "CF"],
      injured: false,
      out: false,
    }));
    const slots = ["GK", "LD", "RD", "LM", "RM", "CF"];
    const planned = scheduleHalfRotation(players, slots, {
      minHalves: 1,
      totalQuarters: total,
      rate: player => 10 - Number(player.id.slice(1)),
    });
    const quarter = Math.min(2, total);
    const gk = goalkeeperId(planned.lineups[quarter]);
    const hurt = planAvailability({
      autoRegen: true,
      kind: "absent",
      players: players.map(player => player.id === gk ? { ...player, injured: true } : player),
      absentId: gk,
      quarter,
      totalQuarters: total,
      lineups: planned.lineups,
      segments: planned.segments,
      slots,
      subMode: true,
      minHalves: 1,
      livePeriod: true,
    });
    const replacement = goalkeeperId(hurt.lineups[quarter]);
    assert.ok(replacement);
    assert.notEqual(replacement, gk);
    const back = returnToGame({
      source: "top",
      autoRegen: true,
      players: players.map(player => player.id === gk ? { ...player, injured: true } : player),
      playerId: gk,
      quarter,
      totalQuarters: total,
      lineups: hurt.lineups,
      segments: hurt.segments,
      slots,
      subMode: true,
      minHalves: 1,
      livePeriod: true,
    });
    assert.equal(goalkeeperId(back.lineups[quarter]), replacement, `${total} periods`);
    const credit = gkCredit(back.lineups, back.segments, replacement, quarter);
    assert.equal(credit.segment, null, `${total} periods`);
    assert.equal(credit.kind, "full", `${total} periods`);
    assert.equal(credit.halves, 2, `${total} periods`);
    for (let q = 1; q < quarter; q++) assert.equal(back.lineups[q], hurt.lineups[q]);
  }
});

test("a goalkeeper returning from the roster does not take the gloves mid-period", () => {
  const { players, slots, lineups } = sheetFor(4);
  const gk = goalkeeperId(lineups[3]);
  const hurt = planAvailability({
    autoRegen: true,
    kind: "absent",
    players: players.map(player => player.id === gk ? { ...player, injured: true } : player),
    absentId: gk,
    quarter: 3,
    totalQuarters: 4,
    lineups,
    slots,
    subMode: true,
    minHalves: 4,
    livePeriod: true,
  });
  const replacement = goalkeeperId(hurt.lineups[3]);
  assert.notEqual(replacement, gk);
  const back = returnToGame({
    source: "roster",
    autoRegen: true,
    players,
    playerId: gk,
    quarter: 3,
    totalQuarters: 4,
    lineups: hurt.lineups,
    segments: hurt.segments,
    slots,
    subMode: true,
    minHalves: 4,
    livePeriod: true,
  });
  assert.equal(goalkeeperId(back.lineups[3]), replacement);
  assert.equal(back.lineups[1], hurt.lineups[1]);
  assert.equal(back.lineups[2], hurt.lineups[2]);
});

test("a no-goalkeeper sheet stays without a goalkeeper after an absence", () => {
  const slots = ["LD", "RD", "LM", "RM"];
  const { players, lineups } = sheetFor(2, slots);
  const out = planAvailability({
    autoRegen: true,
    kind: "absent",
    players: players.map(player => player.id === "p2" ? { ...player, out: true } : player),
    absentId: "p2",
    quarter: 1,
    totalQuarters: 2,
    lineups,
    slots,
    subMode: true,
    minHalves: 2,
  });
  [1, 2].forEach(q => {
    assert.equal(goalkeeperId(out.lineups[q]), null);
    assert.equal(out.lineups[q].starters.some(slot => slot.pos === "GK"), false);
  });
});

test("an override shape is used for that period only", () => {
  const players = halfRoster(8);
  const base = ["GK", "LD", "RD", "LM", "RM", "CF"];
  const wide = ["GK", "LB", "RB", "LW", "RW", "ST"];
  const { lineups } = scheduleHalfRotation(players, base, {
    minHalves: 2,
    totalQuarters: 2,
    slotsByQuarter: { 2: wide },
    rate: () => 1,
  });
  assert.deepEqual(lineups[1].starters.map(slot => slot.pos), base);
  assert.deepEqual(lineups[2].starters.map(slot => slot.pos), wide);
});

function variedRoster(count, { gk = true, injuredId = null, outId = null } = {}) {
  const positions = gk
    ? ["GK", "LD", "RD", "LM", "RM", "CM", "CF", "LW", "RW", "ST", "LB", "RB", "CDM", "CAM"]
    : ["LD", "RD", "LM", "RM", "CM", "CF", "LW", "RW", "ST", "LB", "RB"];
  return Array.from({ length: count }, (_, i) => ({
    id: `p${i + 1}`,
    name: `P${i + 1}`,
    positions,
    injured: injuredId === `p${i + 1}`,
    out: outId === `p${i + 1}`,
  }));
}

function assertVariedPlan(players, slots, planned, { minHalves, total, gk, fromQuarter = 1, locked = null }) {
  const active = players.filter(player => !player.injured && !player.out);
  const absent = players.filter(player => player.injured || player.out);
  const quarters = Array.from({ length: total }, (_, i) => i + 1);
  for (let q = 1; q < fromQuarter; q++) {
    if (locked?.[q]) assert.equal(planned.lineups[q], locked[q], `period ${q} was rebuilt`);
  }
  for (let q = fromQuarter; q <= total; q++) {
    const lineup = planned.lineups[q];
    assert.ok(lineup, `period ${q} is missing`);
    assert.equal(lineup.starters.length, slots.length, `period ${q} slot count`);
    const ids = lineup.starters.map(slot => slot.player?.id);
    assert.equal(ids.every(Boolean), true, `period ${q} has an empty spot`);
    assert.equal(new Set(ids).size, ids.length, `period ${q} repeats a player`);
    absent.forEach(player => {
      assert.equal(playerQuarterPresence(lineup, player.id), "blank", `${player.id} is still on period ${q}`);
    });
    if (gk) {
      const gkId = goalkeeperId(lineup);
      assert.ok(gkId, `period ${q} has no goalkeeper`);
      const onField = lineup.starters.some(slot => slot.player?.id === gkId);
      const segment = segmentAt(planned.segments, gkId, q);
      assert.equal(playCellKind({ onField, segment }), "full", `period ${q} goalkeeper is not full`);
      assert.equal(cellHalves({ onField, segment }), 2);
    } else {
      assert.equal(goalkeeperId(lineup), null);
      assert.equal(lineup.starters.some(slot => slot.pos === "GK"), false);
    }
  }
  active.forEach(player => {
    const halves = equityHalves(player.id, {
      lineups: planned.lineups,
      segments: planned.segments,
      credit: {},
      quarters,
    });
    assert.ok(halves >= minHalves, `${player.id} has ${halves} halves, minimum is ${minHalves}`);
  });
}

test("consecutive plan presses with different seeds produce different lineups", () => {
  const slots = ["GK", "LD", "RD", "LM", "RM", "CF"];
  const players = variedRoster(9);
  const options = { minHalves: 4, totalQuarters: 4, rate: () => 0 };
  const first = scheduleHalfRotation(players, slots, { ...options, seed: 1 });
  const second = scheduleHalfRotation(players, slots, { ...options, seed: 2 });
  assert.equal(plansDiffer(first.lineups, second.lineups, 1), true);
  let step = 0;
  const seeds = [1, 2];
  const pressed = firstDifferentPlan({
    currentLineups: first.lineups,
    fromQuarter: 1,
    nextSeed: () => seeds[Math.min(step++, seeds.length - 1)],
    plan: (seed) => scheduleHalfRotation(players, slots, { ...options, seed }),
  });
  assert.equal(plansDiffer(first.lineups, pressed.lineups, 1), true);
  assert.ok(step >= 2);
});

test("the same seed rebuilds the same lineup", () => {
  const slots = ["GK", "LD", "RD", "LM", "RM", "CF"];
  const players = variedRoster(9);
  const once = scheduleHalfRotation(players, slots, { minHalves: 4, seed: 42, rate: () => 3 });
  const twice = scheduleHalfRotation(players, slots, { minHalves: 4, seed: 42, rate: () => 3 });
  assert.deepEqual(once.lineups, twice.lineups);
  assert.deepEqual(once.segments, twice.segments);
  assert.equal(plansDiffer(once.lineups, twice.lineups, 1), false);
});

test("a roster that fits the field returns its only lineup without error", () => {
  const slots = ["GK", "LD", "RD", "LM", "RM", "CF"];
  const players = slots.map(pos => ({
    id: pos.toLowerCase(),
    name: pos,
    positions: [pos],
    injured: false,
    out: false,
  }));
  const seeds = [1, 7, 99, 1000, 0];
  const plans = seeds.map(seed => scheduleHalfRotation(players, slots, { minHalves: 4, seed }));
  plans.forEach(planned => {
    assertVariedPlan(players, slots, planned, { minHalves: 4, total: 4, gk: true });
    [1, 2, 3, 4].forEach(q => {
      assert.equal(planned.lineups[q].bench.length, 0);
      assert.equal(goalkeeperId(planned.lineups[q]), "gk");
    });
  });
  for (let i = 1; i < plans.length; i++) {
    assert.equal(plansDiffer(plans[0].lineups, plans[i].lineups, 1), false);
  }
  const only = firstDifferentPlan({
    currentLineups: plans[0].lineups,
    attempts: 5,
    nextSeed: () => 7,
    plan: (seed) => scheduleHalfRotation(players, slots, { minHalves: 4, seed }),
  });
  assert.equal(plansDiffer(plans[0].lineups, only.lineups, 1), false);
  assert.equal(only.lineups[1].starters.length, 6);
});

test("every seed keeps fair play, the goalkeeper, and absent players off the sheet", () => {
  const configs = [
    { league: "U8", settings: { org: "say-east" }, extras: 3, absent: "injured" },
    { league: "U10", settings: { org: "say-east" }, extras: 3, absent: null },
    { league: "U6", settings: { org: "us-soccer" }, extras: 2, absent: "out" },
    { league: "U11", settings: { org: "ohio" }, extras: 3, absent: null },
    { league: "U13", settings: { org: "custom", custom: { playersOnField: 7, gk: true, periods: 3, periodMinutes: 25 } }, extras: 3, absent: "injured" },
  ];
  let checks = 0;
  configs.forEach(config => {
    const setup = resolveSetup({ league: config.league, settings: config.settings });
    const slots = setup.slots;
    const minHalves = minQuarters(setup.minFraction, setup.periods) * 2;
    const absentId = config.absent ? "p1" : null;
    const players = variedRoster(setup.playersOnField + config.extras, {
      gk: setup.gk,
      injuredId: config.absent === "injured" ? absentId : null,
      outId: config.absent === "out" ? absentId : null,
    });
    for (let seed = 1; seed <= 40; seed++) {
      const planned = scheduleHalfRotation(players, slots, {
        minHalves,
        totalQuarters: setup.periods,
        seed,
        rate: () => 0,
      });
      assertVariedPlan(players, slots, planned, {
        minHalves,
        total: setup.periods,
        gk: setup.gk,
      });
      checks += 1;
    }
  });
  assert.ok(checks >= 200, `checked ${checks} seeds`);
});

test("replan after injury and return keeps played periods and varies the rest", () => {
  const slots = ["GK", "LD", "RD", "LM", "RM", "CF"];
  const players = variedRoster(9);
  const before = scheduleHalfRotation(players, slots, { minHalves: 4, seed: 4 });
  const hurtId = "p9";
  const injuredPlayers = players.map(player => player.id === hurtId ? { ...player, injured: true } : player);
  const hurt = planAvailability({
    autoRegen: true,
    kind: "absent",
    players: injuredPlayers,
    absentId: hurtId,
    quarter: 2,
    totalQuarters: 4,
    lineups: before.lineups,
    segments: before.segments,
    slots,
    subMode: true,
    minHalves: 4,
    livePeriod: false,
  });
  assert.equal(hurt.lineups[1], before.lineups[1]);
  assert.equal(playerQuarterPresence(hurt.lineups[2], hurtId), "blank");

  const replanFrom = (seed) => scheduleHalfRotation(injuredPlayers, slots, {
    minHalves: 4,
    fromQuarter: 2,
    lockedLineups: { 1: hurt.lineups[1] },
    lockedSegments: hurt.segments,
    totalQuarters: 4,
    seed,
  });
  const again = replanFrom(11);
  const other = replanFrom(19);
  assert.equal(again.lineups[1], hurt.lineups[1]);
  assert.equal(other.lineups[1], hurt.lineups[1]);
  [2, 3, 4].forEach(q => assert.equal(playerQuarterPresence(again.lineups[q], hurtId), "blank"));
  assert.equal(plansDiffer(again.lineups, other.lineups, 2), true);
  assertVariedPlan(injuredPlayers, slots, again, {
    minHalves: 4,
    total: 4,
    gk: true,
    fromQuarter: 2,
    locked: { 1: hurt.lineups[1] },
  });

  const back = returnToGame({
    source: "top",
    autoRegen: true,
    players: injuredPlayers,
    playerId: hurtId,
    quarter: 3,
    totalQuarters: 4,
    lineups: hurt.lineups,
    segments: hurt.segments,
    slots,
    subMode: true,
    minHalves: 4,
    livePeriod: false,
  });
  assert.equal(back.lineups[1], hurt.lineups[1]);
  assert.equal(back.lineups[2], hurt.lineups[2]);
  assert.notEqual(playerQuarterPresence(back.lineups[3], hurtId), "blank");

  const afterReturn = (seed) => scheduleHalfRotation(back.players, slots, {
    minHalves: 4,
    fromQuarter: 3,
    lockedLineups: { 1: back.lineups[1], 2: back.lineups[2] },
    lockedSegments: back.segments,
    totalQuarters: 4,
    seed,
  });
  const kept = afterReturn(6);
  const shifted = afterReturn(21);
  assert.equal(kept.lineups[1], back.lineups[1]);
  assert.equal(kept.lineups[2], back.lineups[2]);
  assert.equal(shifted.lineups[1], back.lineups[1]);
  assert.equal(shifted.lineups[2], back.lineups[2]);
  assert.equal(plansDiffer(kept.lineups, shifted.lineups, 3), true);
  assert.equal(playerQuarterPresence(kept.lineups[3], hurtId) === "blank", false);
});

test("a bench reorder is not a new sheet", () => {
  const left = {
    1: {
      starters: [{ pos: "GK", player: { id: "a" } }, { pos: "CF", player: { id: "b" } }],
      bench: [{ id: "c" }, { id: "d" }],
    },
  };
  const right = {
    1: {
      starters: left[1].starters,
      bench: [{ id: "d" }, { id: "c" }],
    },
  };
  assert.equal(plansDiffer(left, right, 1), false);
  const moved = {
    1: {
      starters: [{ pos: "GK", player: { id: "a" } }, { pos: "CF", player: { id: "c" } }],
      bench: [{ id: "b" }, { id: "d" }],
    },
  };
  assert.equal(plansDiffer(left, moved, 1), true);
});

test("plan selection prefers a fair sheet, skips recent ones, and caps attempts", () => {
  const sheet = (id) => ({
    1: { starters: [{ pos: "CF", player: { id } }], bench: [] },
  });
  const current = sheet("a");
  let cursor = 0;
  const seeds = [1, 2, 3];
  const chosen = firstDifferentPlan({
    currentLineups: current,
    attempts: 5,
    nextSeed: () => seeds[cursor++] ?? 3,
    fairPlay: (result) => result.fair,
    plan: (seed) => ({ lineups: sheet(seed === 1 ? "b" : "c"), fair: seed !== 1, seed }),
  });
  assert.equal(chosen.plan.seed, 2);
  assert.equal(chosen.meetsMinimum, true);
  assert.equal(chosen.unchanged, false);

  const shortOnly = firstDifferentPlan({
    currentLineups: current,
    attempts: 2,
    nextSeed: () => 1,
    fairPlay: () => false,
    plan: () => ({ lineups: sheet("z"), seed: 1 }),
  });
  assert.equal(shortOnly.meetsMinimum, false);
  assert.equal(shortOnly.lineups[1].starters[0].player.id, "z");

  const same = firstDifferentPlan({
    currentLineups: current,
    currentPlan: { lineups: current, kept: true },
    attempts: 4,
    nextSeed: () => 4,
    plan: () => ({ lineups: current }),
  });
  assert.equal(same.unchanged, true);
  assert.equal(same.plan.kept, true);

  const recent = firstDifferentPlan({
    currentLineups: current,
    recentKeys: [planHistoryKey(sheet("b"), 1)],
    attempts: 3,
    nextSeed: (() => {
      const order = [1, 2];
      let i = 0;
      return () => order[i++] ?? 2;
    })(),
    plan: (seed) => ({ lineups: sheet(seed === 1 ? "b" : "c"), seed }),
  });
  assert.equal(recent.plan.seed, 2);

  let calls = 0;
  firstDifferentPlan({
    currentLineups: current,
    attempts: Infinity,
    nextSeed: () => 1,
    plan: () => {
      calls += 1;
      return { lineups: current };
    },
  });
  assert.equal(calls, 24);
});

test("a live replan keeps the goalkeeper in half-period and full-period modes", () => {
  const slots = ["GK", "LD", "RD", "LM", "RM", "CF"];
  const players = variedRoster(8);
  assert.equal(liveReplanGoalkeeper({ 2: { starters: [{ pos: "GK", player: { id: "p1" } }], bench: [] } }, 2, false), null);
  const halfBase = scheduleHalfRotation(players, slots, { minHalves: 4, seed: 1 });
  const halfGk = goalkeeperId(halfBase.lineups[2]);
  assert.equal(liveReplanGoalkeeper(halfBase.lineups, 2, true), halfGk);
  const halfKeys = new Set();
  for (let seed = 1; seed <= 40; seed++) {
    const planned = scheduleHalfRotation(players, slots, {
      minHalves: 4,
      fromQuarter: 2,
      lockedLineups: { 1: halfBase.lineups[1] },
      lockedSegments: halfBase.segments,
      seed,
      lockGoalkeeperId: halfGk,
    });
    assert.equal(planned.lineups[1], halfBase.lineups[1]);
    assert.equal(goalkeeperId(planned.lineups[2]), halfGk, `half seed ${seed}`);
    const onField = planned.lineups[2].starters.some(slot => slot.player?.id === halfGk);
    assert.equal(playCellKind({ onField, segment: segmentAt(planned.segments, halfGk, 2) }), "full");
    assert.equal(segmentAt(planned.segments, halfGk, 2), null);
    halfKeys.add(planHistoryKey(planned.lineups, 2));
  }
  assert.ok(halfKeys.size > 1, "half-period replan still has another legal sheet");

  const fullBase = scheduleWholeGame({
    players,
    format: "6v6",
    slotOverride: slots,
    totalPeriods: 4,
    minFraction: 0.5,
    seed: 1,
  });
  const fullGk = goalkeeperId(fullBase[2]);
  assert.ok(fullGk);
  const fullKeys = new Set();
  for (let seed = 1; seed <= 40; seed++) {
    const planned = scheduleWholeGame({
      players,
      format: "6v6",
      slotOverride: slots,
      totalPeriods: 4,
      minFraction: 0.5,
      fromQuarter: 2,
      lockedLineups: { 1: fullBase[1] },
      seed,
      lockGoalkeeperId: fullGk,
    });
    assert.equal(planned[1], fullBase[1]);
    assert.equal(goalkeeperId(planned[2]), fullGk, `full seed ${seed}`);
    fullKeys.add(planHistoryKey(planned, 2));
  }
  assert.ok(fullKeys.size > 1, "full-period replan still has another legal sheet");
});

test("the same on-field group can change positions when the seed changes", () => {
  const slots = ["GK", "LD", "RD", "LM", "RM", "CF"];
  const players = variedRoster(6);
  const first = scheduleHalfRotation(players, slots, { minHalves: 4, seed: 1 });
  const second = scheduleHalfRotation(players, slots, { minHalves: 4, seed: 2 });
  [first, second].forEach(planned => {
    [1, 2, 3, 4].forEach(q => assert.equal(planned.lineups[q].bench.length, 0));
  });
  assert.equal(plansDiffer(first.lineups, second.lineups, 1), true);
});

test("a 3-period plan prefers a seed that meets the fair-play minimum", () => {
  const players = variedRoster(8);
  const slots = ["GK", "LD", "RD", "LM", "RM", "CF"];
  const minHalves = 4;
  let seedCursor = 1;
  const chosen = firstDifferentPlan({
    attempts: 24,
    nextSeed: () => seedCursor++,
    fairPlay: (result) => sheetMeetsMinimum(players, result.lineups, result.segments, {
      minHalves,
      totalQuarters: 3,
    }),
    plan: (seed) => scheduleHalfRotation(players, slots, { minHalves, totalQuarters: 3, seed }),
  });
  assert.equal(chosen.meetsMinimum, true);
  assert.equal(sheetMeetsMinimum(players, chosen.lineups, chosen.segments, { minHalves, totalQuarters: 3 }), true);
});

test("a full-period return is started often enough to reach the minimum", () => {
  const keep = { id: "keep", name: "Keep", positions: ["GK"], injured: false, out: false };
  const back = { id: "back", name: "Back", positions: ["CF"], injured: true, out: false };
  const sub = { id: "sub", name: "Sub", positions: ["CF"], injured: false, out: false };
  const on = (field, bench) => ({
    starters: [{ pos: "GK", player: keep }, { pos: "CF", player: field }],
    bench,
  });
  const lineups = {
    1: on(back, [sub]),
    2: on(sub, []),
    3: on(sub, []),
    4: on(sub, []),
  };
  const returned = returnToGame({
    source: "roster",
    autoRegen: true,
    players: [keep, back, sub],
    playerId: "back",
    quarter: 3,
    totalQuarters: 4,
    lineups,
    slots: ["GK", "CF"],
    subMode: false,
    minHalves: 4,
    livePeriod: false,
  });
  const halves = equityHalves("back", {
    lineups: returned.lineups,
    segments: returned.segments,
    credit: {},
    quarters: [1, 2, 3, 4],
  });
  assert.ok(halves >= 4, `returning player has ${halves} halves`);
  [3, 4].forEach(q => assert.equal(goalkeeperId(returned.lineups[q]), "keep"));
  assert.equal(returned.lineups[1], lineups[1]);
  assert.equal(returned.lineups[2], lineups[2]);
});

test("three valid sheets stay available across ten presses", () => {
  const sheet = (id) => ({
    1: { starters: [{ pos: "CF", player: { id } }], bench: [] },
  });
  const ids = ["a", "b", "c"];
  let current = sheet("a");
  let recent = [];
  const remember = (lineups) => {
    const key = planHistoryKey(lineups, 1);
    recent = [key, ...recent.filter(item => item !== key)].slice(0, 5);
  };
  remember(current);
  for (let press = 0; press < 10; press++) {
    let cursor = 0;
    const chosen = firstDifferentPlan({
      currentLineups: current,
      currentPlan: { lineups: current },
      recentKeys: recent,
      attempts: 24,
      nextSeed: () => {
        cursor += 1;
        return cursor;
      },
      plan: (seed) => ({ lineups: sheet(ids[(seed - 1) % 3]) }),
    });
    assert.equal(chosen.unchanged, false, `press ${press + 1} stuck on one sheet`);
    assert.equal(plansDiffer(current, chosen.lineups, 1), true);
    current = chosen.lineups;
    remember(current);
  }
});

test("a recent sheet is reused when it is the least recently shown", () => {
  const sheet = (id) => ({
    1: { starters: [{ pos: "CF", player: { id } }], bench: [] },
  });
  const current = sheet("now");
  const fair = sheet("fair");
  const older = sheet("older");
  const least = sheet("least");
  const chosen = firstDifferentPlan({
    currentLineups: current,
    currentPlan: { lineups: current },
    recentKeys: [planHistoryKey(fair, 1), planHistoryKey(older, 1), planHistoryKey(least, 1)],
    attempts: 3,
    nextSeed: (() => {
      const order = [1, 2, 3];
      let i = 0;
      return () => order[i++] ?? 3;
    })(),
    plan: (seed) => ({ lineups: [fair, older, least][seed - 1] }),
  });
  assert.equal(chosen.unchanged, false);
  assert.equal(chosen.lineups[1].starters[0].player.id, "least");

  const fairOverOldShort = firstDifferentPlan({
    currentLineups: current,
    recentKeys: [planHistoryKey(fair, 1), planHistoryKey(older, 1)],
    attempts: 2,
    nextSeed: (() => {
      const order = [1, 2];
      let i = 0;
      return () => order[i++] ?? 2;
    })(),
    fairPlay: (result) => result.fair,
    plan: (seed) => (seed === 1
      ? { lineups: fair, fair: true }
      : { lineups: older, fair: false }),
  });
  assert.equal(fairOverOldShort.lineups[1].starters[0].player.id, "fair");
  assert.equal(fairOverOldShort.meetsMinimum, true);
});

test("a two-half six-a-side game does not stick after five sheets", () => {
  const out = [
    ["LD", "CD", "RD"], ["LM", "CM", "RM"], ["CF", "LF", "RF", "ST"], ["LD", "LM"],
    ["RD", "RM"], ["CM", "CD"], ["CF", "CM"], ["LF", "LM"], ["RF", "RM"], ["CD", "RD"],
  ];
  const players = out.map((positions, i) => ({
    id: `p${i}`,
    name: `P${i}`,
    positions: i < 3 ? ["GK", ...positions] : positions,
    ratings: { a: 1 + ((i * 7) % 5), b: 1 + ((i * 3) % 5), c: 1 + (i % 4) },
    injured: false,
    out: false,
  }));
  const setup = resolveSetup({
    league: "U9",
    format: "",
    settings: { org: "custom", custom: { playersOnField: 6, gk: true, periods: 2, periodMinutes: 10 } },
  });
  const slots = setup.slots;
  const total = setup.periods;
  const minHalves = minQuarters(setup.minFraction ?? 0.5, total) * 2;
  const rate = (player) => {
    const vals = Object.values(player.ratings || {}).filter(value => value > 0);
    return vals.length ? vals.reduce((sum, value) => sum + value, 0) / vals.length : 0;
  };
  const slotsByQuarter = { 1: slots, 2: slots };
  let seedCtr = 1;
  const nextSeed = () => (seedCtr = (seedCtr * 1103515245 + 12345) >>> 0);
  const distinct = new Set();
  for (let i = 0; i < 400; i++) {
    distinct.add(planHistoryKey(scheduleWholeGame({
      players,
      format: setup.format,
      slotOverride: slots,
      totalPeriods: total,
      minFraction: setup.minFraction ?? 0.5,
      slotsByQuarter,
      seed: nextSeed(),
      rate,
    }), 1));
  }
  assert.equal(distinct.size, 5);
  let lineups = {};
  let recent = [];
  const remember = (sheet) => {
    if (!sheet || !Object.keys(sheet).some(key => sheet[key]?.starters)) return;
    const key = planHistoryKey(sheet, 1);
    recent = [key, ...recent.filter(item => item !== key)].slice(0, 5);
  };
  for (let press = 1; press <= 12; press++) {
    remember(lineups);
    const chosen = firstDifferentPlan({
      currentLineups: lineups,
      currentPlan: lineups,
      fromQuarter: 1,
      recentKeys: recent,
      nextSeed,
      fairPlay: (result) => sheetMeetsMinimum(players, result, {}, { minHalves, totalQuarters: total }),
      plan: (seed) => scheduleWholeGame({
        players,
        format: setup.format,
        slotOverride: slots,
        totalPeriods: total,
        minFraction: setup.minFraction ?? 0.5,
        slotsByQuarter,
        seed,
        rate,
      }),
    });
    assert.equal(chosen.unchanged, false, `press ${press} reported only one lineup`);
    lineups = chosen.lineups;
    remember(lineups);
  }
});

test("sub-mode replan with a pinned keeper fills every slot", () => {
  const players = [
    { id: "p0", name: "Avery", positions: ["GK", "LD", "CD", "RD"], ratings: { a: 1, b: 1, c: 1 } },
    { id: "p1", name: "Ben", positions: ["GK", "LM", "CM", "RM"], ratings: { a: 3, b: 4, c: 2 } },
    { id: "p2", name: "Cam", positions: ["GK", "CF", "LF", "RF", "ST"], ratings: { a: 5, b: 2, c: 3 } },
    { id: "p3", name: "Dani", positions: ["LD", "LM"], ratings: { a: 2, b: 5, c: 4 } },
    { id: "p4", name: "Eli", positions: ["RD", "RM"], ratings: { a: 4, b: 3, c: 1 } },
    { id: "p5", name: "Finn", positions: ["CM", "CD"], ratings: { a: 1, b: 1, c: 2 } },
    { id: "p6", name: "Gus", positions: ["CF", "CM"], ratings: { a: 3, b: 4, c: 3 } },
    { id: "p7", name: "Hana", positions: ["LF", "LM"], ratings: { a: 5, b: 2, c: 4 } },
  ].map(player => ({ ...player, injured: false, out: false }));
  const byId = Object.fromEntries(players.map(player => [player.id, player]));
  const slots = ["GK", "CD", "CM", "CF"];
  const lineup = (starterIds, benchIds) => ({
    starters: slots.map((pos, index) => ({ pos, player: byId[starterIds[index]] })),
    bench: benchIds.map(id => byId[id]),
  });
  const locked = {
    1: lineup(["p0", "p5", "p6", "p4"], ["p1", "p2", "p3", "p7"]),
    2: lineup(["p1", "p5", "p6", "p4"], ["p0", "p2", "p3", "p7"]),
  };
  const rate = (player) => {
    const vals = Object.values(player.ratings).filter(value => value > 0);
    return vals.reduce((sum, value) => sum + value, 0) / vals.length;
  };
  const used = [
    4158529536, 4149465088, 3088039936, 2872373248, 2796183552, 533401600, 3361079296,
    2157850624, 368746496, 2021019712, 2824067840, 2590928896, 119922688, 3579875392,
    395385856, 3880852544, 1302640640, 2402453504, 2381584384, 1614702592, 1849849856,
    48056320, 1411897400, 1814581248,
  ];
  const assertFilled = (planned, label) => {
    assert.equal(planned.lineups[1], locked[1], label);
    assert.equal(planned.lineups[2], locked[2], label);
    [3, 4].forEach(q => {
      const starters = planned.lineups[q].starters;
      assert.equal(starters.length, slots.length, `${label} Q${q}`);
      assert.equal(starters.every(slot => slot.player?.id), true, `${label} Q${q} has an empty slot`);
      const ids = starters.map(slot => slot.player.id);
      assert.equal(new Set(ids).size, ids.length, `${label} Q${q} repeats a player`);
    });
  };
  const planFrom = (seed, lock) => scheduleHalfRotation(players, slots, {
    minHalves: 4,
    fromQuarter: 3,
    lockedLineups: locked,
    totalQuarters: 4,
    rate,
    seed,
    lockGoalkeeperId: lock,
  });
  used.forEach(seed => {
    const planned = planFrom(seed, "p0");
    assertFilled(planned, `used ${seed}`);
    assert.equal(goalkeeperId(planned.lineups[3]), "p0");
    assert.equal(segmentAt(planned.segments, "p0", 3), null);
    assertFilled(planFrom(seed, null), `open ${seed}`);
  });
  for (let s = 1; s <= 200; s++) {
    const seed = Math.imul(s, 2654435761) >>> 0;
    const planned = planFrom(seed, "p0");
    assertFilled(planned, `seed ${seed}`);
    assert.equal(goalkeeperId(planned.lineups[3]), "p0");
    assert.equal(playCellKind({ onField: true, segment: segmentAt(planned.segments, "p0", 3) }), "full");
    assertFilled(planFrom(seed, null), `unlocked ${seed}`);
  }
});

test("a locked goalkeeper keeps every period full across seeds and shapes", () => {
  const configs = [
    { count: 8, slots: ["GK", "CD", "CM", "CF"], total: 4, from: 3, minHalves: 4 },
    { count: 10, slots: ["GK", "LD", "RD", "LM", "RM", "CF"], total: 2, from: 2, minHalves: 2 },
    { count: 9, slots: ["GK", "LD", "CD", "RD", "LM", "RM", "CF"], total: 3, from: 2, minHalves: 2 },
    { count: 7, slots: ["GK", "LD", "RD", "CF"], total: 4, from: 1, minHalves: 4 },
  ];
  configs.forEach(cfg => {
    const players = variedRoster(cfg.count);
    const base = scheduleHalfRotation(players, cfg.slots, {
      minHalves: cfg.minHalves,
      totalQuarters: cfg.total,
      seed: 1,
    });
    const gk = goalkeeperId(base.lineups[cfg.from]);
    assert.ok(gk, `config ${cfg.count}`);
    const locked = {};
    for (let q = 1; q < cfg.from; q++) locked[q] = base.lineups[q];
    for (let seed = 1; seed <= 30; seed++) {
      const planned = scheduleHalfRotation(players, cfg.slots, {
        minHalves: cfg.minHalves,
        totalQuarters: cfg.total,
        fromQuarter: cfg.from,
        lockedLineups: locked,
        lockedSegments: base.segments,
        seed,
        lockGoalkeeperId: gk,
      });
      for (let q = 1; q < cfg.from; q++) assert.equal(planned.lineups[q], locked[q]);
      for (let q = cfg.from; q <= cfg.total; q++) {
        const ids = planned.lineups[q].starters.map(slot => slot.player?.id);
        assert.equal(ids.every(Boolean), true, `${cfg.count} players, seed ${seed}, period ${q}`);
        assert.equal(new Set(ids).size, ids.length);
      }
      assert.equal(goalkeeperId(planned.lineups[cfg.from]), gk);
      assert.equal(segmentAt(planned.segments, gk, cfg.from), null);
    }
  });
});

test("a full-mode replan clears replanned half marks and keeps earlier ones", () => {
  const segments = {
    p1: { 1: "left", 2: "entered", 3: "left" },
    gk: { 1: "entered", 2: "left" },
  };
  const lineup = { starters: [{ pos: "GK", player: { id: "gk" } }], bench: [] };
  const next = segmentsAfterFullReplan(segments, 2, lineup, 2);
  assert.equal(segmentAt(next, "p1", 1), "left");
  assert.equal(segmentAt(next, "p1", 2), null);
  assert.equal(segmentAt(next, "p1", 3), null);
  assert.equal(segmentAt(next, "gk", 1), "entered");
  assert.equal(segmentAt(next, "gk", 2), null);
  assert.deepEqual(segmentsAfterFullReplan(segments, 1, lineup, 1), {});
});

test("five players on a five-a-side field still change sheets across ten presses", () => {
  const positions = [
    ["GK", "LD", "CD", "RD"],
    ["GK", "LM", "CM", "RM"],
    ["GK", "CF", "LF", "RF", "ST"],
    ["LD", "LM"],
    ["RD", "RM"],
  ];
  const players = positions.map((list, index) => ({
    id: `p${index}`,
    name: `P${index}`,
    positions: list,
    ratings: { a: 1 + ((index * 7) % 5), b: 1 + ((index * 3) % 5), c: 1 + (index % 4) },
    injured: false,
    out: false,
  }));
  const slots = ["GK", "LD", "RD", "CM", "CF"];
  const rate = (player) => {
    const vals = Object.values(player.ratings).filter(value => value > 0);
    return vals.reduce((sum, value) => sum + value, 0) / vals.length;
  };
  let lineups = {};
  let segments = {};
  let recent = [];
  const remember = (sheet) => {
    if (!sheet || !Object.keys(sheet).some(key => sheet[key]?.starters)) return;
    const key = planHistoryKey(sheet, 1);
    recent = [key, ...recent.filter(item => item !== key)].slice(0, 5);
  };
  let seedCtr = 1;
  const nextSeed = () => (seedCtr = (seedCtr * 1103515245 + 12345) >>> 0);
  for (let press = 1; press <= 10; press++) {
    remember(lineups);
    const chosen = firstDifferentPlan({
      currentLineups: lineups,
      currentPlan: { lineups, segments },
      fromQuarter: 1,
      recentKeys: recent,
      nextSeed,
      fairPlay: (result) => sheetMeetsMinimum(players, result.lineups, result.segments, {
        minHalves: 4,
        totalQuarters: 4,
      }),
      plan: (seed) => scheduleHalfRotation(players, slots, {
        minHalves: 4,
        totalQuarters: 4,
        rate,
        seed,
      }),
    });
    assert.equal(chosen.unchanged, false, `press ${press} reported only one lineup`);
    assert.equal(plansDiffer(lineups, chosen.lineups, 1), true, `press ${press} repeated the sheet`);
    [1, 2, 3, 4].forEach(q => {
      const starters = chosen.lineups[q].starters;
      assert.equal(starters.every(slot => slot.player?.id), true, `press ${press} Q${q}`);
      const gk = goalkeeperId(chosen.lineups[q]);
      assert.ok(gk);
      assert.equal(segmentAt(chosen.segments, gk, q), null);
    });
    assert.equal(sheetMeetsMinimum(players, chosen.lineups, chosen.segments, {
      minHalves: 4,
      totalQuarters: 4,
    }), true);
    lineups = chosen.lineups;
    segments = chosen.segments;
    remember(lineups);
  }
});

test("a pinned goalkeeper stays in goal when the sheet is rotated", () => {
  const players = [
    ["GK", "LD", "CD", "RD"],
    ["GK", "LM", "CM", "RM"],
    ["GK", "CF", "LF", "RF", "ST"],
    ["LD", "LM"],
    ["RD", "RM"],
  ].map((list, index) => ({
    id: `p${index}`,
    name: `P${index}`,
    positions: list,
    injured: false,
    out: false,
  }));
  const slots = ["GK", "LD", "RD", "CM", "CF"];
  const base = scheduleHalfRotation(players, slots, { minHalves: 4, totalQuarters: 4, seed: 1 });
  const gk = goalkeeperId(base.lineups[1]);
  const rotated = rotatePlanSheet(base, { step: 1, fromQuarter: 1, lockGoalkeeperId: gk });
  assert.equal(goalkeeperId(rotated.lineups[1]), gk);
  assert.equal(plansDiffer(base.lineups, rotated.lineups, 2), true);
  assert.equal(segmentAt(rotated.segments, gk, 1), null);
});

test("a live first period keeps the half sub, its credit, and the formation override", () => {
  const segments = { out: { 1: "left" }, inn: { 1: "entered" } };
  const credit = { out: [1] };
  const overrides = { 1: "3-1" };
  const kept = replanCarryForward({
    resetClock: false,
    fromQuarter: 1,
    livePeriod: true,
    segments,
    credit,
    overrides,
  });
  assert.equal(segmentAt(kept.segments, "out", 1), "left");
  assert.equal(segmentAt(kept.segments, "inn", 1), "entered");
  assert.deepEqual(kept.credit, credit);
  assert.deepEqual(kept.overrides, overrides);
  const later = { out: { 1: "left", 2: "entered" }, inn: { 1: "entered" } };
  const carriedLater = replanCarryForward({
    resetClock: false,
    fromQuarter: 1,
    livePeriod: true,
    segments: later,
    credit,
    overrides,
  });
  assert.equal(segmentAt(carriedLater.segments, "out", 1), "left");
  assert.equal(segmentAt(carriedLater.segments, "out", 2), null);
  const lineup = {
    starters: [{ pos: "CF", player: { id: "inn" } }, { pos: "CM", player: { id: "newbie" } }],
    bench: [{ id: "out" }],
  };
  const rebuilt = { newbie: { 1: "left", 2: "left" } };
  const restored = preservePeriodMarks(rebuilt, kept.segments, 1, lineup);
  assert.equal(segmentAt(restored, "out", 1), "left");
  assert.equal(segmentAt(restored, "inn", 1), "entered");
  assert.equal(segmentAt(restored, "newbie", 1), null);
  assert.equal(segmentAt(restored, "newbie", 2), "left");
  const contradicted = {
    starters: [{ pos: "CF", player: { id: "out" } }],
    bench: [{ id: "inn" }],
  };
  const dropped = preservePeriodMarks(rebuilt, kept.segments, 1, contradicted);
  assert.equal(segmentAt(dropped, "out", 1), null);
  assert.equal(segmentAt(dropped, "inn", 1), null);
  const wiped = replanCarryForward({
    resetClock: true,
    fromQuarter: 1,
    segments,
    credit,
    overrides,
  });
  assert.deepEqual(wiped, { segments: {}, credit: {}, overrides: {} });
});

function quarterMarksDisagree(segments, lineup, quarter) {
  const onField = new Set((lineup?.starters || []).map(slot => slot.player?.id).filter(Boolean));
  return Object.entries(segments || {}).some(([playerId, row]) => {
    const kind = row?.[quarter] ?? row?.[String(quarter)];
    if (kind === "entered") return !onField.has(playerId);
    if (kind === "left") return onField.has(playerId);
    return false;
  });
}

function quarterMarkMap(segments, quarter) {
  const marks = {};
  Object.entries(segments || {}).forEach(([playerId, row]) => {
    const kind = row?.[quarter] ?? row?.[String(quarter)];
    if (kind) marks[playerId] = kind;
  });
  return marks;
}

function halfMarkCounts(segments, quarter) {
  const counts = { entered: 0, left: 0 };
  Object.values(quarterMarkMap(segments, quarter)).forEach(kind => {
    if (kind === "entered" || kind === "left") counts[kind] += 1;
  });
  return counts;
}

test("a live first-period sub replan stores marks that match the new lineup", () => {
  const slots = ["GK", "CD", "CM", "CF"];
  const players = variedRoster(8);
  const base = scheduleHalfRotation(players, slots, { minHalves: 2, totalQuarters: 2, seed: 3 });
  const gk = goalkeeperId(base.lineups[1]);
  const entered = base.lineups[1].starters.map(slot => slot.player.id).find(id => id !== gk);
  const left = base.lineups[1].bench[0].id;
  const marks = { [entered]: { 1: "entered" }, [left]: { 1: "left" } };
  let sawDifferent = false;
  for (let seed = 1; seed <= 24; seed++) {
    let cursor = seed;
    const chosen = firstDifferentPlan({
      currentLineups: base.lineups,
      currentPlan: { lineups: base.lineups, segments: base.segments },
      fromQuarter: 1,
      attempts: 6,
      nextSeed: () => cursor++,
      lockGoalkeeperId: gk,
      fairPlay: (result) => {
        const stored = preservePeriodMarks(result.segments, marks, 1, result.lineups[1]);
        return sheetMeetsMinimum(players, result.lineups, stored, { minHalves: 2, totalQuarters: 2 });
      },
      plan: (planSeed) => scheduleHalfRotation(players, slots, {
        minHalves: 2,
        totalQuarters: 2,
        fromQuarter: 1,
        lockedSegments: marks,
        seed: planSeed,
        lockGoalkeeperId: gk,
      }),
    });
    if (chosen.unchanged) continue;
    sawDifferent = true;
    const stored = preservePeriodMarks(chosen.plan.segments, marks, 1, chosen.lineups[1]);
    assert.equal(chosen.lineups[1].starters.some(slot => slot.player?.id === entered), true, `seed ${seed}`);
    assert.equal(chosen.lineups[1].bench.some(player => player.id === left), true, `seed ${seed}`);
    assert.equal(goalkeeperId(chosen.lineups[1]), gk);
    assert.equal(segmentAt(stored, gk, 1), null);
    [1, 2].forEach(q => {
      assert.equal(chosen.lineups[q].starters.every(slot => slot.player?.id), true);
      assert.equal(quarterMarksDisagree(stored, chosen.lineups[q], q), false, `seed ${seed} Q${q}`);
    });
    assert.equal(
      chosen.meetsMinimum,
      sheetMeetsMinimum(players, chosen.lineups, stored, { minHalves: 2, totalQuarters: 2 }),
    );
  }
  assert.equal(sawDifferent, true);

  const configs = [
    { count: 8, slots: ["GK", "CD", "CM", "CF"], total: 2, minHalves: 2 },
    { count: 10, slots: ["GK", "LD", "RD", "LM", "RM", "CF"], total: 4, minHalves: 4 },
    { count: 7, slots: ["GK", "LD", "RD", "CF"], total: 3, minHalves: 2 },
  ];
  configs.forEach(cfg => {
    const roster = variedRoster(cfg.count);
    for (let seed = 1; seed <= 15; seed++) {
      const planned = scheduleHalfRotation(roster, cfg.slots, {
        minHalves: cfg.minHalves,
        totalQuarters: cfg.total,
        seed,
      });
      const q1 = {};
      Object.entries(planned.segments || {}).forEach(([playerId, row]) => {
        if (row[1]) q1[playerId] = { 1: row[1] };
      });
      const gkId = goalkeeperId(planned.lineups[1]);
      const again = scheduleHalfRotation(roster, cfg.slots, {
        minHalves: cfg.minHalves,
        totalQuarters: cfg.total,
        fromQuarter: 1,
        lockedSegments: q1,
        seed: seed + 100,
        lockGoalkeeperId: gkId,
      });
      const stored = segmentsSavedForSubReplan(again.segments, planned.segments, again.lineups, {
        fromQuarter: 1,
        resetClock: false,
        livePeriod: true,
      });
      for (let q = 2; q <= cfg.total; q++) {
        assert.deepEqual(quarterMarkMap(stored, q), quarterMarkMap(again.segments, q), `${cfg.count} ${seed} Q${q}`);
      }
      for (let q = 1; q <= cfg.total; q++) {
        assert.equal(again.lineups[q].starters.every(slot => slot.player?.id), true, `${cfg.count} ${seed} Q${q}`);
        assert.equal(quarterMarksDisagree(stored, again.lineups[q], q), false, `${cfg.count} ${seed} Q${q}`);
        const keeper = goalkeeperId(again.lineups[q]);
        assert.equal(segmentAt(stored, keeper, q), null, `${cfg.count} ${seed} Q${q} keeper`);
        const counts = halfMarkCounts(stored, q);
        assert.equal(counts.entered, counts.left, `${cfg.count} ${seed} Q${q} balance`);
      }
      assert.equal(goalkeeperId(again.lineups[1]), gkId);
    }
  });
});

test("a live first-period replan leaves later periods on the new plan's marks", () => {
  const slots = ["GK", "CD", "CM", "CF"];
  const players = variedRoster(7);
  let saw = false;
  for (let seed = 1; seed <= 24 && !saw; seed++) {
    const base = scheduleHalfRotation(players, slots, { minHalves: 2, totalQuarters: 2, seed });
    const oldQ2 = quarterMarkMap(base.segments, 2);
    if (!Object.keys(oldQ2).length) continue;
    const gk = goalkeeperId(base.lineups[1]);
    const entered = base.lineups[1].starters.map(slot => slot.player.id).find(id => id !== gk);
    const left = base.lineups[1].bench[0].id;
    const q1 = {};
    Object.entries(base.segments || {}).forEach(([playerId, row]) => {
      if (row[1]) q1[playerId] = { 1: row[1] };
    });
    let cursor = seed + 1;
    const chosen = firstDifferentPlan({
      currentLineups: base.lineups,
      currentPlan: { lineups: base.lineups, segments: base.segments },
      fromQuarter: 1,
      attempts: 8,
      nextSeed: () => cursor++,
      lockGoalkeeperId: gk,
      fairPlay: (result) => {
        const judged = segmentsSavedForSubReplan(result.segments, base.segments, result.lineups, {
          fromQuarter: 1,
          resetClock: false,
          livePeriod: true,
        });
        return sheetMeetsMinimum(players, result.lineups, judged, { minHalves: 2, totalQuarters: 2 });
      },
      plan: (planSeed) => scheduleHalfRotation(players, slots, {
        minHalves: 2,
        totalQuarters: 2,
        fromQuarter: 1,
        lockedSegments: q1,
        seed: planSeed,
        lockGoalkeeperId: gk,
      }),
    });
    if (chosen.unchanged) continue;
    const keeperMoved = goalkeeperId(base.lineups[2]) !== goalkeeperId(chosen.lineups[2]);
    const fullPeriodPlayer = chosen.lineups[2].starters.some(slot => {
      const id = slot.player?.id;
      return id && !segmentAt(chosen.plan.segments, id, 2) && (oldQ2[id] === "entered" || oldQ2[id] === "left");
    });
    if (!keeperMoved && !fullPeriodPlayer) continue;
    saw = true;
    const stored = segmentsSavedForSubReplan(chosen.plan.segments, base.segments, chosen.lineups, {
      fromQuarter: 1,
      resetClock: false,
      livePeriod: true,
    });
    assert.deepEqual(quarterMarkMap(stored, 2), quarterMarkMap(chosen.plan.segments, 2));
    const laterSave = segmentsSavedForSubReplan(chosen.plan.segments, base.segments, chosen.lineups, {
      fromQuarter: 2,
      resetClock: false,
    });
    assert.deepEqual(quarterMarkMap(laterSave, 1), quarterMarkMap(chosen.plan.segments, 1));
    [1, 2].forEach(q => {
      const keeper = goalkeeperId(chosen.lineups[q]);
      assert.equal(segmentAt(stored, keeper, q), null, `Q${q} keeper`);
      const counts = halfMarkCounts(stored, q);
      assert.equal(counts.entered, counts.left, `Q${q} balance`);
      assert.equal(chosen.lineups[q].starters.every(slot => slot.player?.id), true);
      assert.equal(quarterMarksDisagree(stored, chosen.lineups[q], q), false, `Q${q}`);
    });
    assert.equal(chosen.lineups[1].starters.some(slot => slot.player?.id === entered), true);
    assert.equal(chosen.lineups[1].bench.some(player => player.id === left), true);
    assert.equal(goalkeeperId(chosen.lineups[1]), gk);
    assert.equal(
      chosen.meetsMinimum,
      sheetMeetsMinimum(players, chosen.lineups, stored, { minHalves: 2, totalQuarters: 2 }),
    );
  }
  assert.equal(saw, true);
});

test("a live full-period replan keeps the swap that already happened", () => {
  const slots = ["GK", "LD", "RD", "LM", "RM", "CF"];
  const players = variedRoster(8);
  const base = scheduleWholeGame({
    players,
    format: "6v6",
    slotOverride: slots,
    totalPeriods: 4,
    minFraction: 0.5,
    seed: 1,
  });
  const gk = goalkeeperId(base[1]);
  const outgoing = base[1].starters.find(slot => slot.player?.id && slot.player.id !== gk).player;
  const incoming = base[1].bench[0];
  const segments = markQuarterSub({}, 1, outgoing.id, incoming.id);
  let credit = setAppearanceCreditFor({}, outgoing.id, 1, true);
  credit = setAppearanceCreditFor(credit, incoming.id, 1, false);
  const judge = (lineups, stored) => sheetMeetsMinimum(players, lineups, stored, {
    minHalves: 4,
    totalQuarters: 4,
    credit,
  });
  const planFull = (seed) => scheduleWholeGame({
    players,
    format: "6v6",
    slotOverride: slots,
    totalPeriods: 4,
    minFraction: 0.5,
    fromQuarter: 1,
    segments,
    credit,
    seed,
    lockGoalkeeperId: gk,
  });
  let cursor = 2;
  const chosen = firstDifferentPlan({
    currentLineups: base,
    currentPlan: base,
    fromQuarter: 1,
    lockGoalkeeperId: gk,
    nextSeed: () => cursor++,
    fairPlay: (result) => judge(result, segmentsSavedForFullReplan(segments, result, {
      fromQuarter: 1,
      resetClock: false,
      livePeriod: true,
    })),
    plan: planFull,
  });
  assert.equal(chosen.unchanged, false);
  const stored = segmentsSavedForFullReplan(segments, chosen.lineups, {
    fromQuarter: 1,
    resetClock: false,
    livePeriod: true,
  });
  assert.equal(chosen.lineups[1].starters.some(slot => slot.player?.id === incoming.id), true);
  assert.equal(chosen.lineups[1].bench.some(player => player.id === outgoing.id), true);
  assert.equal(goalkeeperId(chosen.lineups[1]), gk);
  assert.equal(segmentAt(stored, incoming.id, 1), "entered");
  assert.equal(segmentAt(stored, outgoing.id, 1), "left");
  assert.equal(quarterMarksDisagree(stored, chosen.lineups[1], 1), false);
  [2, 3, 4].forEach(q => assert.deepEqual(quarterMarkMap(stored, q), {}));
  [1, 2, 3, 4].forEach(q => {
    assert.equal(chosen.lineups[q].starters.every(slot => slot.player?.id), true, `Q${q}`);
    assert.equal(segmentAt(stored, goalkeeperId(chosen.lineups[q]), q), null, `Q${q} keeper`);
  });
  assert.equal(chosen.meetsMinimum, judge(chosen.lineups, stored));
  for (let seed = 1; seed <= 24; seed++) {
    const planned = planFull(seed);
    assert.equal(planned[1].starters.some(slot => slot.player?.id === incoming.id), true, `seed ${seed}`);
    assert.equal(planned[1].bench.some(player => player.id === outgoing.id), true, `seed ${seed}`);
    assert.equal(goalkeeperId(planned[1]), gk, `seed ${seed}`);
    const saved = segmentsSavedForFullReplan(segments, planned, {
      fromQuarter: 1,
      resetClock: false,
      livePeriod: true,
    });
    assert.equal(quarterMarksDisagree(saved, planned[1], 1), false, `seed ${seed}`);
    assert.equal(segmentAt(saved, gk, 1), null, `seed ${seed}`);
  }

  const half = scheduleHalfRotation(players, slots, { minHalves: 4, totalQuarters: 4, seed: 1 });
  const halfGk = goalkeeperId(half.lineups[1]);
  const halfOut = half.lineups[1].starters.find(slot => slot.player?.id && slot.player.id !== halfGk).player;
  const halfIn = half.lineups[1].bench[0];
  const halfMarks = markQuarterSub(half.segments, 1, halfOut.id, halfIn.id);
  const q1Only = {};
  Object.entries(halfMarks).forEach(([playerId, row]) => {
    if (row[1]) q1Only[playerId] = { 1: row[1] };
  });
  const halfAgain = scheduleHalfRotation(players, slots, {
    minHalves: 4,
    totalQuarters: 4,
    fromQuarter: 1,
    lockedSegments: q1Only,
    seed: 4,
    lockGoalkeeperId: halfGk,
  });
  const halfStored = segmentsSavedForSubReplan(halfAgain.segments, halfMarks, halfAgain.lineups, {
    fromQuarter: 1,
    resetClock: false,
    livePeriod: true,
  });
  assert.equal(halfAgain.lineups[1].starters.some(slot => slot.player?.id === halfIn.id), true);
  assert.equal(halfAgain.lineups[1].bench.some(player => player.id === halfOut.id), true);
  assert.equal(goalkeeperId(halfAgain.lineups[1]), halfGk);
  assert.equal(segmentAt(halfStored, halfGk, 1), null);
  assert.equal(quarterMarksDisagree(halfStored, halfAgain.lineups[1], 1), false);
  assert.deepEqual(quarterMarkMap(halfStored, 2), quarterMarkMap(halfAgain.segments, 2));
  let halfCursor = 9;
  const halfChosen = firstDifferentPlan({
    currentLineups: half.lineups,
    currentPlan: half,
    fromQuarter: 1,
    lockGoalkeeperId: halfGk,
    attempts: 8,
    nextSeed: () => halfCursor++,
    fairPlay: (result) => {
      const judged = segmentsSavedForSubReplan(result.segments, halfMarks, result.lineups, {
        fromQuarter: 1,
        resetClock: false,
        livePeriod: true,
      });
      return sheetMeetsMinimum(players, result.lineups, judged, { minHalves: 4, totalQuarters: 4 });
    },
    plan: (seed) => scheduleHalfRotation(players, slots, {
      minHalves: 4,
      totalQuarters: 4,
      fromQuarter: 1,
      lockedSegments: q1Only,
      seed,
      lockGoalkeeperId: halfGk,
    }),
  });
  const halfJudged = segmentsSavedForSubReplan(halfChosen.plan.segments, halfMarks, halfChosen.lineups, {
    fromQuarter: 1,
    resetClock: false,
    livePeriod: true,
  });
  assert.equal(
    halfChosen.meetsMinimum,
    sheetMeetsMinimum(players, halfChosen.lineups, halfJudged, { minHalves: 4, totalQuarters: 4 }),
  );

  const q2Out = half.lineups[2].starters.find(slot => slot.player?.id && slot.player.id !== goalkeeperId(half.lineups[2])).player;
  const q2In = half.lineups[2].bench[0];
  const q2Marks = markQuarterSub(half.segments, 2, q2Out.id, q2In.id);
  const carried = replanCarryForward({
    resetClock: false,
    fromQuarter: 2,
    livePeriod: true,
    segments: q2Marks,
    credit: {},
    overrides: {},
  });
  assert.equal(segmentAt(carried.segments, q2Out.id, 2), "left");
  assert.equal(segmentAt(carried.segments, q2In.id, 2), "entered");
  Object.keys(q2Marks).forEach(playerId => {
    assert.equal(segmentAt(carried.segments, playerId, 3), null);
    assert.equal(segmentAt(carried.segments, playerId, 4), null);
  });
  const q2Gk = goalkeeperId(half.lineups[2]);
  const q2Half = scheduleHalfRotation(players, slots, {
    minHalves: 4,
    totalQuarters: 4,
    fromQuarter: 2,
    lockedLineups: { 1: half.lineups[1] },
    lockedSegments: carried.segments,
    seed: 5,
    lockGoalkeeperId: q2Gk,
  });
  const q2Stored = segmentsSavedForSubReplan(q2Half.segments, q2Marks, q2Half.lineups, {
    fromQuarter: 2,
    resetClock: false,
    livePeriod: true,
  });
  assert.equal(q2Half.lineups[1], half.lineups[1]);
  assert.equal(q2Half.lineups[2].starters.some(slot => slot.player?.id === q2In.id), true);
  assert.equal(q2Half.lineups[2].bench.some(player => player.id === q2Out.id), true);
  assert.equal(goalkeeperId(q2Half.lineups[2]), q2Gk);
  assert.equal(segmentAt(q2Stored, q2Gk, 2), null);
  assert.equal(quarterMarksDisagree(q2Stored, q2Half.lineups[2], 2), false);
  assert.deepEqual(quarterMarkMap(q2Stored, 3), quarterMarkMap(q2Half.segments, 3));

  const fullQ2Gk = goalkeeperId(base[2]);
  const fullOut = base[2].starters.find(slot => slot.player?.id && slot.player.id !== fullQ2Gk).player;
  const fullIn = base[2].bench[0];
  const q2FullMarks = markQuarterSub({}, 2, fullOut.id, fullIn.id);
  const q2Full = scheduleWholeGame({
    players,
    format: "6v6",
    slotOverride: slots,
    totalPeriods: 4,
    minFraction: 0.5,
    fromQuarter: 2,
    lockedLineups: { 1: base[1] },
    segments: q2FullMarks,
    seed: 6,
    lockGoalkeeperId: fullQ2Gk,
  });
  const q2FullStored = segmentsSavedForFullReplan(q2FullMarks, q2Full, {
    fromQuarter: 2,
    resetClock: false,
    livePeriod: true,
  });
  assert.equal(q2Full[1], base[1]);
  assert.equal(q2Full[2].starters.some(slot => slot.player?.id === fullIn.id), true);
  assert.equal(q2Full[2].bench.some(player => player.id === fullOut.id), true);
  assert.equal(goalkeeperId(q2Full[2]), fullQ2Gk);
  assert.equal(segmentAt(q2FullStored, fullIn.id, 2), "entered");
  assert.equal(segmentAt(q2FullStored, fullOut.id, 2), "left");
  assert.equal(quarterMarksDisagree(q2FullStored, q2Full[2], 2), false);
  assert.equal(segmentAt(q2FullStored, fullQ2Gk, 2), null);
  [3, 4].forEach(q => assert.deepEqual(quarterMarkMap(q2FullStored, q), {}));
});

test("a replan before the period starts does not lock its planned half marks", () => {
  const slots = ["GK", "LD", "RD", "LM", "RM", "CF"];
  const players = variedRoster(8);
  [2, 3].forEach(from => {
    const base = scheduleHalfRotation(players, slots, { minHalves: 4, totalQuarters: 4, seed: 1 });
    assert.ok(Object.keys(quarterMarkMap(base.segments, from)).length > 0, `Q${from} had no planned marks`);
    const carried = replanCarryForward({
      resetClock: false,
      fromQuarter: from,
      livePeriod: false,
      segments: base.segments,
      credit: {},
      overrides: {},
    });
    assert.deepEqual(quarterMarkMap(carried.segments, from), {}, `Q${from} mark was locked`);
    for (let q = from + 1; q <= 4; q++) {
      assert.deepEqual(quarterMarkMap(carried.segments, q), {}, `Q${q} mark was locked`);
    }
    for (let q = 1; q < from; q++) {
      assert.deepEqual(quarterMarkMap(carried.segments, q), quarterMarkMap(base.segments, q));
    }
    const locked = {};
    for (let q = 1; q < from; q++) locked[q] = base.lineups[q];
    let sawLineup = false;
    let sawMarks = false;
    for (let seed = 1; seed <= 24; seed++) {
      const planned = scheduleHalfRotation(players, slots, {
        minHalves: 4,
        totalQuarters: 4,
        fromQuarter: from,
        lockedLineups: locked,
        lockedSegments: carried.segments,
        seed,
      });
      const stored = segmentsSavedForSubReplan(planned.segments, base.segments, planned.lineups, {
        fromQuarter: from,
        resetClock: false,
        livePeriod: false,
      });
      assert.deepEqual(quarterMarkMap(stored, from), quarterMarkMap(planned.segments, from), `Q${from} seed ${seed}`);
      for (let q = 1; q < from; q++) assert.equal(planned.lineups[q], locked[q]);
      if (plansDiffer(base.lineups, planned.lineups, from)) sawLineup = true;
      if (JSON.stringify(quarterMarkMap(base.segments, from)) !== JSON.stringify(quarterMarkMap(stored, from))) {
        sawMarks = true;
      }
    }
    assert.equal(sawLineup, true, `Q${from} lineup never changed`);
    assert.equal(sawMarks, true, `Q${from} marks never changed`);
  });
});

test("rotation fills a scarce position with the player who lists it", () => {
  const sheet = {
    lineups: {
      1: {
        starters: [
          { pos: "GK", player: { id: "gk", positions: ["GK"] } },
          { pos: "LD", player: { id: "vers", positions: ["LD", "CF"] } },
          { pos: "CF", player: { id: "only", positions: ["LD"] } },
        ],
        bench: [],
      },
    },
    segments: {},
  };
  const rotated = rotatePlanSheet(sheet, { step: 1, fromQuarter: 1, lockGoalkeeperId: "gk" });
  const at = (pos) => rotated.lineups[1].starters.find(slot => slot.pos === pos)?.player;
  assert.equal(at("GK").id, "gk");
  assert.equal(at("CF").id, "vers");
  assert.equal(at("LD").id, "only");
  rotated.lineups[1].starters.forEach(slot => {
    assert.equal(slot.player.positions.includes(slot.pos), true);
  });
});

test("replan of a live first period pins the goalkeeper and keeps the clock", () => {
  assert.deepEqual(
    liveReplanClockDecision({ liveReplan: true, fromQuarter: 1, quarter: 1, clockStarted: true }),
    { resetClock: false, pinGoalkeeper: true },
  );
  assert.deepEqual(
    liveReplanClockDecision({ liveReplan: true, fromQuarter: 1, quarter: 1, clockStarted: false }),
    { resetClock: true, pinGoalkeeper: false },
  );
  assert.deepEqual(
    liveReplanClockDecision({ liveReplan: false, fromQuarter: 1, quarter: 3, clockStarted: true }),
    { resetClock: true, pinGoalkeeper: false },
  );
  assert.deepEqual(
    liveReplanClockDecision({ liveReplan: true, fromQuarter: 2, quarter: 2, clockStarted: true }),
    { resetClock: false, pinGoalkeeper: true },
  );
  assert.deepEqual(
    liveReplanClockDecision({ liveReplan: true, fromQuarter: 2, quarter: 2, clockStarted: false, realEvent: true }),
    { resetClock: false, pinGoalkeeper: true },
  );
  assert.deepEqual(
    liveReplanClockDecision({ liveReplan: true, fromQuarter: 1, quarter: 1, clockStarted: false, realEvent: true }),
    { resetClock: false, pinGoalkeeper: true },
  );
});

function copyJson(value) {
  return JSON.parse(JSON.stringify(value));
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

test("switching period tabs restores that period's clock and does not change the lineup or credit", () => {
  const lineups = {
    2: { starters: [{ pos: "CF", player: { id: "a" } }], bench: [{ id: "b" }] },
  };
  const credit = { a: [2] };
  const lineupCopy = copyJson(lineups);
  const creditCopy = copyJson(credit);
  const away = clockAfterPeriodSwitch({}, 2, 3, 90, { a: 90 });
  assert.equal(away.clockSec, 0);
  assert.deepEqual(away.stints, {});
  const back = clockAfterPeriodSwitch(away.clocks, 3, 2, 15, { c: 15 });
  assert.equal(back.clockSec, 90);
  assert.deepEqual(back.stints, { a: 90 });
  const again = clockAfterPeriodSwitch(back.clocks, 2, 3, back.clockSec, back.stints);
  assert.equal(again.clockSec, 15);
  assert.deepEqual(again.stints, { c: 15 });
  const stored = JSON.parse(JSON.stringify(again.clocks));
  assert.equal(stored["2"].sec, 90);
  assert.deepEqual(lineups, lineupCopy);
  assert.deepEqual(credit, creditCopy);
  const decision = liveReplanClockDecision({
    liveReplan: true,
    fromQuarter: 2,
    quarter: 2,
    clockStarted: back.clockSec > 0,
    realEvent: false,
  });
  assert.deepEqual(decision, { resetClock: false, pinGoalkeeper: true });
});

test("a manual Q2 swap survives a tab change and the next replan in half mode and full mode", () => {
  const slots = ["GK", "LD", "RD", "LM", "RM", "CF"];
  const players = variedRoster(8);

  const half = scheduleHalfRotation(players, slots, { minHalves: 4, totalQuarters: 4, seed: 1 });
  const halfGk = goalkeeperId(half.lineups[2]);
  const halfOut = half.lineups[2].starters.find(slot => slot.player?.id && slot.player.id !== halfGk).player;
  const halfIn = half.lineups[2].bench[0];
  const halfLineups = { ...half.lineups, 2: swapFieldBench(half.lineups[2], halfOut.id, halfIn.id) };
  let halfCredit = setAppearanceCreditFor({}, halfOut.id, 2, true);
  halfCredit = setAppearanceCreditFor(halfCredit, halfIn.id, 2, false);
  const halfSegments = markQuarterSub(half.segments, 2, halfOut.id, halfIn.id);
  const halfEvents = noteRealPeriodEvent({}, 2, [halfOut.id, halfIn.id]);
  const halfLineupCopy = copyJson(halfLineups);
  const halfCreditCopy = copyJson(halfCredit);
  const halfBack = clockAfterPeriodSwitch(clockAfterPeriodSwitch({}, 2, 3, 0, {}).clocks, 3, 2, 0, {});
  assert.deepEqual(halfLineups, halfLineupCopy);
  assert.deepEqual(halfCredit, halfCreditCopy);
  assert.equal(halfBack.clockSec, 0);
  const halfDecision = liveReplanClockDecision({
    liveReplan: true,
    fromQuarter: 2,
    quarter: 2,
    clockStarted: halfBack.clockSec > 0,
    realEvent: periodHasRealEvent(halfEvents, 2),
  });
  assert.deepEqual(halfDecision, { resetClock: false, pinGoalkeeper: true });
  const halfCarried = replanCarryForward({
    resetClock: halfDecision.resetClock,
    fromQuarter: 2,
    livePeriod: halfDecision.pinGoalkeeper,
    segments: halfSegments,
    credit: halfCredit,
    overrides: {},
  });
  assert.deepEqual(halfCarried.credit, halfCredit);
  assert.equal(segmentAt(halfCarried.segments, halfOut.id, 2), "left");
  assert.equal(segmentAt(halfCarried.segments, halfIn.id, 2), "entered");
  const halfAgain = scheduleHalfRotation(players, slots, {
    minHalves: 4,
    totalQuarters: 4,
    fromQuarter: 2,
    lockedLineups: { 1: halfLineups[1] },
    lockedSegments: halfCarried.segments,
    seed: 5,
    lockGoalkeeperId: halfGk,
  });
  const halfStored = segmentsSavedForSubReplan(halfAgain.segments, halfSegments, halfAgain.lineups, {
    fromQuarter: 2,
    resetClock: halfDecision.resetClock,
    livePeriod: halfDecision.pinGoalkeeper,
  });
  assert.equal(halfAgain.lineups[1], halfLineups[1]);
  assert.equal(halfAgain.lineups[2].starters.some(slot => slot.player?.id === halfIn.id), true);
  assert.equal(halfAgain.lineups[2].bench.some(player => player.id === halfOut.id), true);
  assert.equal(goalkeeperId(halfAgain.lineups[2]), halfGk);
  assert.equal(segmentAt(halfStored, halfIn.id, 2), "entered");
  assert.equal(segmentAt(halfStored, halfOut.id, 2), "left");
  assert.equal(segmentAt(halfStored, halfGk, 2), null);
  assert.equal(quarterMarksDisagree(halfStored, halfAgain.lineups[2], 2), false);
  assert.deepEqual(realEventsThrough(halfEvents, 2)["2"], [halfOut.id, halfIn.id]);
  assert.deepEqual(realEventsThrough(halfEvents, 1), {});

  const full = scheduleWholeGame({
    players,
    format: "6v6",
    slotOverride: slots,
    totalPeriods: 4,
    minFraction: 0.5,
    seed: 1,
  });
  const fullGk = goalkeeperId(full[2]);
  const fullOut = full[2].starters.find(slot => slot.player?.id && slot.player.id !== fullGk).player;
  const fullIn = full[2].bench[0];
  const fullLineups = { ...full, 2: swapFieldBench(full[2], fullOut.id, fullIn.id) };
  let fullCredit = setAppearanceCreditFor({}, fullOut.id, 2, true);
  fullCredit = setAppearanceCreditFor(fullCredit, fullIn.id, 2, false);
  const fullSegments = markQuarterSub({}, 2, fullOut.id, fullIn.id);
  const fullEvents = noteRealPeriodEvent({}, 2, [fullOut.id, fullIn.id]);
  const fullLineupCopy = copyJson(fullLineups);
  const fullCreditCopy = copyJson(fullCredit);
  const fullBack = clockAfterPeriodSwitch(clockAfterPeriodSwitch({}, 2, 3, 0, {}).clocks, 3, 2, 0, {});
  assert.deepEqual(fullLineups, fullLineupCopy);
  assert.deepEqual(fullCredit, fullCreditCopy);
  const fullDecision = liveReplanClockDecision({
    liveReplan: true,
    fromQuarter: 2,
    quarter: 2,
    clockStarted: fullBack.clockSec > 0,
    realEvent: periodHasRealEvent(fullEvents, 2),
  });
  assert.deepEqual(fullDecision, { resetClock: false, pinGoalkeeper: true });
  const fullAgain = scheduleWholeGame({
    players,
    format: "6v6",
    slotOverride: slots,
    totalPeriods: 4,
    minFraction: 0.5,
    fromQuarter: 2,
    lockedLineups: { 1: fullLineups[1] },
    segments: fullSegments,
    credit: fullCredit,
    seed: 6,
    lockGoalkeeperId: fullGk,
  });
  const fullStored = segmentsSavedForFullReplan(fullSegments, fullAgain, {
    fromQuarter: 2,
    resetClock: fullDecision.resetClock,
    livePeriod: fullDecision.pinGoalkeeper,
  });
  assert.equal(fullAgain[1], fullLineups[1]);
  assert.equal(fullAgain[2].starters.some(slot => slot.player?.id === fullIn.id), true);
  assert.equal(fullAgain[2].bench.some(player => player.id === fullOut.id), true);
  assert.equal(goalkeeperId(fullAgain[2]), fullGk);
  assert.equal(segmentAt(fullStored, fullIn.id, 2), "entered");
  assert.equal(segmentAt(fullStored, fullOut.id, 2), "left");
  assert.equal(quarterMarksDisagree(fullStored, fullAgain[2], 2), false);
  assert.equal(segmentAt(fullStored, fullGk, 2), null);
  const keptCredit = replanCarryForward({
    resetClock: fullDecision.resetClock,
    fromQuarter: 2,
    livePeriod: fullDecision.pinGoalkeeper,
    segments: fullSegments,
    credit: fullCredit,
    overrides: {},
  });
  assert.deepEqual(keptCredit.credit, fullCredit);
});

test("opening a later period with no real event still replans that period", () => {
  const slots = ["GK", "LD", "RD", "LM", "RM", "CF"];
  const players = variedRoster(8);
  const base = scheduleHalfRotation(players, slots, { minHalves: 4, totalQuarters: 4, seed: 1 });
  assert.ok(Object.keys(quarterMarkMap(base.segments, 2)).length > 0);
  const credit = {};
  const lineupCopy = copyJson(base.lineups);
  const creditCopy = copyJson(credit);
  const opened = clockAfterPeriodSwitch({}, 1, 2, 0, {});
  assert.deepEqual(base.lineups, lineupCopy);
  assert.deepEqual(credit, creditCopy);
  assert.equal(periodHasRealEvent({}, 2), false);
  const decision = liveReplanClockDecision({
    liveReplan: true,
    fromQuarter: 2,
    quarter: 2,
    clockStarted: opened.clockSec > 0,
    realEvent: false,
  });
  assert.deepEqual(decision, { resetClock: false, pinGoalkeeper: false });
  const carried = replanCarryForward({
    resetClock: decision.resetClock,
    fromQuarter: 2,
    livePeriod: decision.pinGoalkeeper,
    segments: base.segments,
    credit,
    overrides: {},
  });
  assert.deepEqual(quarterMarkMap(carried.segments, 2), {});
  let sawLineup = false;
  let sawMarks = false;
  for (let seed = 1; seed <= 24; seed++) {
    const planned = scheduleHalfRotation(players, slots, {
      minHalves: 4,
      totalQuarters: 4,
      fromQuarter: 2,
      lockedLineups: { 1: base.lineups[1] },
      lockedSegments: carried.segments,
      seed,
    });
    const stored = segmentsSavedForSubReplan(planned.segments, base.segments, planned.lineups, {
      fromQuarter: 2,
      resetClock: false,
      livePeriod: decision.pinGoalkeeper,
    });
    assert.deepEqual(quarterMarkMap(stored, 2), quarterMarkMap(planned.segments, 2), `seed ${seed}`);
    assert.equal(planned.lineups[1], base.lineups[1]);
    if (plansDiffer(base.lineups, planned.lineups, 2)) sawLineup = true;
    if (JSON.stringify(quarterMarkMap(base.segments, 2)) !== JSON.stringify(quarterMarkMap(stored, 2))) sawMarks = true;
  }
  assert.equal(sawLineup, true);
  assert.equal(sawMarks, true);
});

test("a live return in the last period gives the returner the halves they can still reach", () => {
  const slots = ["GK", "LD", "RD", "LM", "CM", "RM", "CF"];
  const rate = (player) => 10 - Number(String(player.id).slice(1));
  const players = Array.from({ length: 10 }, (_, i) => ({
    id: `p${i + 1}`,
    name: `P${i + 1}`,
    positions: slots,
    injured: false,
    out: false,
  }));
  const halves = (id, lineups, segments) => equityHalves(id, {
    lineups,
    segments,
    credit: {},
    quarters: [1, 2, 3],
  });
  for (const seed of [16, 86, 92]) {
    const base = scheduleHalfRotation(players, slots, { minHalves: 4, totalQuarters: 3, seed, rate });
    const gk = goalkeeperId(base.lineups[2]);
    const id = base.lineups[2].starters.map(slot => slot.player?.id).find(playerId => playerId && playerId !== gk);
    const injured = planAvailability({
      autoRegen: true,
      kind: "absent",
      players: players.map(player => player.id === id ? { ...player, injured: true, midGameInjury: true } : player),
      slots,
      lineups: base.lineups,
      segments: base.segments,
      absentId: id,
      quarter: 2,
      minHalves: 4,
      subMode: true,
      totalQuarters: 3,
      livePeriod: true,
      rate,
    });
    const segments = noteSubSegment(injured.segments, id, 2, "left");
    const prior = halves(id, injured.lineups, segments);
    assert.ok(prior + 2 >= 4, `seed ${seed} was not reachable`);
    const keeper = goalkeeperId(injured.lineups[3]);
    const back = returnToGame({
      source: "top",
      autoRegen: true,
      players,
      playerId: id,
      quarter: 3,
      totalQuarters: 3,
      lineups: injured.lineups,
      segments,
      slots,
      subMode: true,
      minHalves: 4,
      livePeriod: true,
      rate,
    });
    assert.ok(halves(id, back.lineups, back.segments) >= 4, `seed ${seed}`);
    assert.equal(goalkeeperId(back.lineups[3]), keeper, `seed ${seed}`);
    assert.equal(back.lineups[1], injured.lineups[1], `seed ${seed}`);
    assert.equal(back.lineups[3].starters.every(slot => slot.player?.id), true, `seed ${seed}`);
    assert.equal(quarterMarksDisagree(back.segments, back.lineups[3], 3), false, `seed ${seed}`);
    assert.equal(segmentAt(back.segments, keeper, 3), null, `seed ${seed}`);
  }

  const byId = Object.fromEntries(["gk", "ret", "donor", "prot", "other"].map(id => [id, {
    id,
    name: id,
    positions: ["GK", "CM", "CF"],
    injured: false,
    out: false,
  }]));
  const q3 = {
    starters: [
      { pos: "GK", player: byId.gk },
      { pos: "CM", player: byId.donor },
      { pos: "CF", player: byId.prot },
    ],
    bench: [byId.ret, byId.other],
  };
  const lineups = {
    1: {
      starters: [
        { pos: "GK", player: byId.gk },
        { pos: "CM", player: byId.ret },
        { pos: "CF", player: byId.donor },
      ],
      bench: [byId.prot, byId.other],
    },
    2: {
      starters: [
        { pos: "GK", player: byId.gk },
        { pos: "CM", player: byId.donor },
        { pos: "CF", player: byId.prot },
      ],
      bench: [byId.ret, byId.other],
    },
    3: q3,
  };
  const segments = { prot: { 3: "entered" } };
  const protBefore = playerHalfMask("prot", q3, "entered");
  const topped = giveReturnerHalfSlots(lineups, segments, byId.ret, 3, 3, 4, { protectedIds: ["prot"] });
  assert.ok(equityHalves("ret", { lineups: topped.lineups, segments: topped.segments, quarters: [1, 2, 3] }) >= 4);
  assert.equal(goalkeeperId(topped.lineups[3]), "gk");
  assert.deepEqual(playerHalfMask("prot", topped.lineups[3], segmentAt(topped.segments, "prot", 3)), protBefore);
  assert.equal(topped.lineups[3].starters.every(slot => slot.player?.id), true);
  assert.equal(quarterMarksDisagree(topped.segments, topped.lineups[3], 3), false);
});
