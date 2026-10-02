import test from "node:test";
import assert from "node:assert/strict";
import { applyBenchRotation, noteRealPeriodEvent, equityHalves } from "./gameDay.js";
import { normalizeGameDay } from "./teamSnapshot.js";
import {
  afterSubsBasis,
  afterSubsDrag,
  applyPhaseDrag,
  clearOverride,
  clearSnapshotsFrom,
  decorateShareSheet,
  formationKey,
  lineupFromSnapshot,
  normalizeAfterSubs,
  onFieldIds,
  phaseControlVisible,
  reconcileStored,
  replanPhaseState,
  runAfterSubs,
  viewAfterSubs,
} from "./afterSubs.js";

function player(id, name = id) {
  return { id, name, number: id.slice(-1) };
}

function lineup() {
  return {
    starters: [
      { pos: "GK", player: player("sam", "Sam") },
      { pos: "CF", player: player("dee", "Dee") },
      { pos: "CM", player: player("cal", "Cal") },
      { pos: "LM", player: player("ann", "Ann") },
    ],
    bench: [player("bea", "Bea"), player("eve", "Eve"), player("fay", "Fay")],
  };
}

const pairs = [
  { inId: "bea", outId: "dee", fromPlan: false },
  { inId: "eve", outId: "cal", fromPlan: false },
];

function ids(value) {
  return onFieldIds(value);
}

test("with no drag yet, After subs is the derived rotation", () => {
  const start = lineup();
  const derived = applyBenchRotation(start, pairs);
  const view = viewAfterSubs(start, pairs, null);
  assert.equal(view.overridden, false);
  assert.deepEqual(ids(view.lineup), ids(derived));
  assert.deepEqual(view.lineup.starters.map(slot => slot.pos), ["GK", "CF", "CM", "LM"]);
  assert.deepEqual(ids(view.lineup), ["sam", "bea", "eve", "ann"]);
  assert.deepEqual(view.lineup.bench.map(item => item.id).sort(), ["cal", "dee", "fay"]);
  assert.equal(start.starters[1].player.id, "dee");
});

test("an odd bench leaves the unpaired player off in After subs", () => {
  const view = viewAfterSubs(lineup(), pairs, null);
  assert.equal(view.lineup.bench.find(item => item.id === "fay").id, "fay");
  assert.ok(!ids(view.lineup).includes("fay"));
});

test("the first After subs drag stores a full slot map and leaves Start untouched", () => {
  const start = lineup();
  const dragged = afterSubsDrag(start, pairs, null, 1, 2);
  assert.equal(dragged.ok, true);
  assert.equal(dragged.realEvent, false);
  assert.deepEqual(ids(dragged.lineup), ["sam", "eve", "bea", "ann"]);
  assert.equal(dragged.override.basis, afterSubsBasis(start, pairs));
  assert.equal(dragged.override.formation, formationKey(start));
  assert.equal(dragged.override.slots["0"], "sam");
  assert.equal(dragged.override.slots["1"], "eve");
  assert.equal(dragged.override.slots["2"], "bea");
  assert.deepEqual(ids(start), ["sam", "dee", "cal", "ann"]);
  const again = viewAfterSubs(start, pairs, dragged.override);
  assert.deepEqual(ids(again.lineup), ["sam", "eve", "bea", "ann"]);
});

test("a drag in one view does not change the other", () => {
  const start = lineup();
  const dragged = afterSubsDrag(start, pairs, null, 1, 3);
  const startSwap = {
    starters: start.starters.map((slot, idx) => {
      if (idx === 1) return { ...slot, player: start.starters[2].player };
      if (idx === 2) return { ...slot, player: start.starters[1].player };
      return { ...slot };
    }),
    bench: start.bench,
  };
  const kept = reconcileStored(dragged.override, startSwap, pairs);
  const after = viewAfterSubs(startSwap, pairs, kept);
  assert.deepEqual(ids(after.lineup), ids(dragged.lineup));
  assert.deepEqual(ids(startSwap), ["sam", "cal", "dee", "ann"]);
  const phase = applyPhaseDrag({ phase: "after", start, pairs, override: dragged.override, a: 2, b: 3 });
  assert.equal(phase.realEvent, false);
  assert.equal(phase.type, "override");
  assert.deepEqual(ids(start), ["sam", "dee", "cal", "ann"]);
  const back = applyPhaseDrag({ phase: "start", start, pairs, override: dragged.override, a: 1, b: 2 });
  assert.equal(back.type, "start-positions");
  assert.equal(back.realEvent, false);
  assert.equal(back.override, dragged.override);
});

test("the goalkeeper stays fixed in After subs", () => {
  const start = lineup();
  const ontoGk = afterSubsDrag(start, pairs, null, 1, 0);
  assert.equal(ontoGk.ok, false);
  assert.equal(ontoGk.override, null);
  assert.equal(ontoGk.realEvent, false);
  assert.deepEqual(ids(ontoGk.lineup), ["sam", "bea", "eve", "ann"]);
  const fromGk = afterSubsDrag(start, pairs, null, 0, 2);
  assert.equal(fromGk.ok, false);
});

test("players who stay keep their slot and a new arrival takes the replaced slot", () => {
  const start = lineup();
  const dragged = afterSubsDrag(start, pairs, null, 1, 3);
  assert.deepEqual(ids(dragged.lineup), ["sam", "ann", "eve", "bea"]);
  const nextPairs = [
    { inId: "bea", outId: "dee" },
    { inId: "fay", outId: "cal" },
  ];
  const reconciled = reconcileStored(dragged.override, start, nextPairs);
  const view = viewAfterSubs(start, nextPairs, reconciled);
  assert.equal(view.lineup.starters[1].player.id, "ann");
  assert.equal(view.lineup.starters[3].player.id, "bea");
  assert.equal(view.lineup.starters[2].player.id, "fay");
  assert.ok(!ids(view.lineup).includes("eve"));
  assert.equal(reconciled.basis, afterSubsBasis(start, nextPairs));
});

test("a formation change discards the override", () => {
  const start = lineup();
  const dragged = afterSubsDrag(start, pairs, null, 1, 2);
  const reshaped = {
    starters: [
      { pos: "GK", player: player("sam", "Sam") },
      { pos: "CB", player: player("dee", "Dee") },
      { pos: "CM", player: player("cal", "Cal") },
    ],
    bench: start.bench,
  };
  assert.equal(reconcileStored(dragged.override, reshaped, pairs), null);
  const view = viewAfterSubs(reshaped, [{ inId: "bea", outId: "dee" }], dragged.override);
  assert.equal(view.reset, true);
  assert.equal(view.overridden, false);
});

test("reset to auto clears the override and returns to the derived field", () => {
  const start = lineup();
  const dragged = afterSubsDrag(start, pairs, null, 1, 2);
  const cleared = clearOverride({ 1: dragged.override, 2: dragged.override }, 1);
  assert.equal(cleared[1], undefined);
  assert.ok(cleared[2]);
  const view = viewAfterSubs(start, pairs, null);
  assert.deepEqual(ids(view.lineup), ["sam", "bea", "eve", "ann"]);
});

test("RUN applies the After subs slots and keeps a read-only start snapshot", () => {
  const start = lineup();
  const dragged = afterSubsDrag(start, pairs, null, 1, 2);
  const ran = runAfterSubs({ start, pairs, override: dragged.override });
  assert.equal(ran.clearOverride, true);
  assert.equal(ran.realEventFromDrag, false);
  assert.deepEqual(ids(ran.lineup), ["sam", "eve", "bea", "ann"]);
  assert.deepEqual(new Set(ids(ran.lineup)), new Set(ids(applyBenchRotation(start, pairs))));
  const restored = lineupFromSnapshot(ran.snapshot, [player("sam", "Sam"), player("dee", "Dee"), player("cal", "Cal"), player("ann", "Ann"), ...start.bench]);
  assert.deepEqual(ids(restored), ["sam", "dee", "cal", "ann"]);
  assert.deepEqual(ran.snapshot.pairs.map(pair => pair.inId), ["bea", "eve"]);
  const readonly = applyPhaseDrag({ phase: "start", ran: true, start, pairs, override: null, a: 1, b: 2 });
  assert.equal(readonly.type, "readonly");
  assert.equal(readonly.realEvent, false);
});

test("a position drag does not flag a real event and does not change who is on", () => {
  const start = lineup();
  const before = noteRealPeriodEvent({}, 1, ["sam"]);
  const dragged = afterSubsDrag(start, pairs, null, 2, 3);
  assert.equal(dragged.realEvent, false);
  assert.deepEqual(new Set(ids(dragged.lineup).filter(Boolean)), new Set(ids(applyBenchRotation(start, pairs)).filter(Boolean)));
  const flags = before;
  assert.deepEqual(flags, { 1: ["sam"] });
  const lineups = { 1: dragged.lineup };
  const derived = { 1: applyBenchRotation(start, pairs) };
  ["sam", "bea", "eve", "ann", "dee", "cal", "fay"].forEach(id => {
    const moved = equityHalves(id, { lineups, segments: {}, credit: {}, quarters: [1] });
    const auto = equityHalves(id, { lineups: derived, segments: {}, credit: {}, quarters: [1] });
    assert.equal(moved, auto, id);
  });
});

test("non-live Replan clears the override and live Replan reconciles it", () => {
  const start = lineup();
  const dragged = afterSubsDrag(start, pairs, null, 1, 3);
  const stored = { 1: dragged.override, 2: dragged.override };
  const cleared = replanPhaseState(stored, {
    fromQuarter: 1,
    live: false,
    total: 2,
    lineups: { 1: start },
    pairsByQuarter: { 1: pairs },
  });
  assert.deepEqual(cleared.afterSubs, {});
  assert.equal(cleared.reset, false);
  const nextPairs = [{ inId: "bea", outId: "ann" }, { inId: "eve", outId: "cal" }];
  const live = replanPhaseState(stored, {
    fromQuarter: 1,
    live: true,
    total: 2,
    lineups: { 1: start, 2: start },
    pairsByQuarter: { 1: nextPairs, 2: pairs },
  });
  assert.equal(live.afterSubs[2], undefined);
  assert.equal(live.afterSubs[1].slots["1"], "dee");
  assert.equal(live.afterSubs[1].slots["2"], "eve");
  assert.equal(live.afterSubs[1].slots["3"], "bea");
  const snapshots = clearSnapshotsFrom({ 1: { starters: [{}] }, 2: { starters: [{}] } }, 1, 2);
  assert.deepEqual(snapshots, {});
});

test("the phase control is hidden in full mode and when a period has no pairs", () => {
  assert.equal(phaseControlVisible({ subMode: false, pairs, bench: lineup().bench }), false);
  assert.equal(phaseControlVisible({ subMode: true, pairs: [], bench: [] }), false);
  assert.equal(phaseControlVisible({ subMode: true, pairs: [], bench: lineup().bench }), false);
  assert.equal(phaseControlVisible({ subMode: true, pairs, bench: lineup().bench }), true);
  assert.equal(phaseControlVisible({ subMode: true, pairs: [], bench: [], snapshot: { starters: [] } }), true);
});

test("the share sheet carries Start and After subs, and full mode stays one field", () => {
  const start = lineup();
  const sheet = {
    subMode: true,
    quarters: [
      {
        quarter: 1,
        label: "Q1",
        starters: start.starters.map((slot, idx) => ({ idx, pos: slot.pos, id: slot.player.id, name: slot.player.name, number: "1", x: 10, y: 10 })),
        bench: start.bench.map(item => ({ id: item.id, name: item.name, number: "1" })),
        pairs: pairs.map(pair => ({ inId: pair.inId, outId: pair.outId })),
      },
    ],
  };
  const dragged = afterSubsDrag(start, pairs, null, 1, 2);
  const decorated = decorateShareSheet(sheet, { lineups: { 1: start }, afterSubs: { 1: dragged.override }, subMode: true });
  assert.equal(decorated.quarters[0].starters[1].id, "dee");
  assert.equal(decorated.quarters[0].after.starters[1].id, "eve");
  assert.equal(decorated.quarters[0].after.starters[2].id, "bea");
  assert.equal(decorated.quarters[0].after.pairs.length, 0);
  const full = decorateShareSheet(sheet, { lineups: { 1: start }, subMode: false });
  assert.equal(full.quarters[0].after, null);
  const quiet = decorateShareSheet({
    quarters: [{ quarter: 2, label: "Q2", starters: [], bench: [], pairs: [] }],
  }, { lineups: { 2: start }, subMode: true });
  assert.equal(quiet.quarters[0].after, null);
});

test("after subs and the start snapshot persist with the in-progress game", () => {
  const gameDay = normalizeGameDay({
    afterSubs: { 2: { slots: { 1: "bea", 0: "sam" }, basis: "b", formation: "GK|CF" }, 0: { slots: { 1: "nope" } } },
    startSnapshots: { 2: { starters: [{ pos: "GK", playerId: "sam", name: "Sam", number: "1" }], bench: [], pairs: [] } },
  });
  assert.equal(gameDay.afterSubs[2].slots[1], "bea");
  assert.equal(gameDay.afterSubs[0], undefined);
  assert.equal(gameDay.startSnapshots[2].starters[0].playerId, "sam");
  assert.deepEqual(normalizeAfterSubs(null), {});
  assert.deepEqual(normalizeGameDay({}).afterSubs, {});
  assert.deepEqual(normalizeGameDay({}).startSnapshots, {});
});
