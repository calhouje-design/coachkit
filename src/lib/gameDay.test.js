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
