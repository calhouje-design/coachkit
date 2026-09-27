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
