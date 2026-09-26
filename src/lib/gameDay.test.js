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
