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
  goalkeeperId,
  planAvailability,
  returnToGame,
  scheduleHalfRotation,
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
