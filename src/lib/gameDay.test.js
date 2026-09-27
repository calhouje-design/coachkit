import test from "node:test";
import assert from "node:assert/strict";
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
  scheduleHalfRotation,
  gameLogFromStrategy,
  upsertGameLog,
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
  assert.equal(pairs.length, 2);
  assert.ok(pairs.every(pair => pair.fromPlan));
  assert.deepEqual(pairs.map(pair => pair.inId).sort(), ["bea", "cal"]);
  assert.deepEqual(pairs.map(pair => pair.outId).sort(), ["dee", "sam"]);
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
    { inId: "d", outId: "a", fromPlan: false },
  ]);
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
  const manual = retargetPair([], "bea", "dee");
  const shown = pairsForDisplay(auto, manual, lineup);
  assert.deepEqual(shown.find(pair => pair.inId === "bea"), { inId: "bea", outId: "dee", fromPlan: false });
  assert.equal(shown.find(pair => pair.inId === "cal").outId, "sam");
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
