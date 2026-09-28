import test from "node:test";
import assert from "node:assert/strict";
import {
  minQuarters,
  feasibility,
  computePlayTime,
  playersUnderMin,
  playersWhoCannotReachMin,
  scrambleQuarterPositions,
  redrawQuarterMembership,
} from "./fairPlay.js";

const slots6 = ["GK", "LD", "RD", "LM", "RM", "CF"];

function player(id) {
  return { id, name: id, positions: ["GK", "CM", "CF"], injured: false, out: false };
}

test("SAY East 50% is 2 of 4 quarters", () => {
  assert.equal(minQuarters(0.5, 4), 2);
  assert.equal(minQuarters(1, 4), 4);
});

test("feasibility blocks an impossible roster and allows a normal 6v6", () => {
  const blocked = feasibility({ activeCount: 13, slotsPerPeriod: 6, minQ: 2, periods: 4 });
  assert.equal(blocked.ok, false);
  assert.equal(blocked.demand, 26);
  assert.equal(blocked.supply, 24);
  assert.match(blocked.reason, /26 required appearances/);

  const ok = feasibility({ activeCount: 9, slotsPerPeriod: 6, minQ: 2, periods: 4 });
  assert.equal(ok.ok, true);
  assert.equal(ok.reason, "");
});

test("feasibility blocks U6 when not everyone can play every quarter", () => {
  const blocked = feasibility({ activeCount: 5, slotsPerPeriod: 4, minQ: 4, periods: 4 });
  assert.equal(blocked.ok, false);
  assert.equal(blocked.demand, 20);
  assert.equal(blocked.supply, 16);
});

test("sub mode gate uses the same roster limit and talks in halves", () => {
  const full = feasibility({ activeCount: 13, slotsPerPeriod: 6, minQ: 2, periods: 4, subMode: false });
  const sub = feasibility({ activeCount: 13, slotsPerPeriod: 6, minQ: 2, periods: 4, subMode: true });
  assert.equal(full.ok, false);
  assert.equal(sub.ok, false);
  assert.equal(sub.halfDemand, 52);
  assert.equal(sub.halfSupply, 48);
  assert.match(sub.reason, /52/);
  assert.match(sub.reason, /halves/);
  const ok = feasibility({ activeCount: 9, slotsPerPeriod: 6, minQ: 2, periods: 4, subMode: true });
  assert.equal(ok.ok, true);
});

test("feasibility blocks an empty active roster", () => {
  const blocked = feasibility({ activeCount: 0, slotsPerPeriod: 6, minQ: 2, periods: 4 });
  assert.equal(blocked.ok, false);
  assert.match(blocked.reason, /at least one active player/);
});

function rotationFixture() {
  const players = Array.from({ length: 8 }, (_, i) => player(`p${i + 1}`));
  const lineups = {};
  for (let q = 1; q <= 4; q++) {
    const start = (q - 1) * 2;
    const on = Array.from({ length: 6 }, (_, k) => players[(start + k) % 8]);
    const onIds = new Set(on.map(p => p.id));
    lineups[q] = {
      starters: on.map((p, i) => ({ pos: slots6[i], player: p })),
      bench: players.filter(p => !onIds.has(p.id)),
    };
  }
  return { players, lineups };
}

test("a legal rotation has nobody under 2 quarters", () => {
  const { players, lineups } = rotationFixture();
  const counts = computePlayTime(players, lineups, 4);
  for (const p of players) assert.ok(counts[p.id] >= 2, p.id);
  assert.deepEqual(playersUnderMin(players, lineups, 2, 4), []);
});

test("scramble positions keeps the same players on that quarter only", () => {
  const { lineups } = rotationFixture();
  const before = lineups[2].starters.map(s => s.player.id).sort();
  const next = scrambleQuarterPositions(lineups[2]);
  const after = next.starters.map(s => s.player.id).sort();
  assert.deepEqual(after, before);
  assert.deepEqual(next.bench.map(p => p.id).sort(), lineups[2].bench.map(p => p.id).sort());
  assert.deepEqual(next.starters.map(s => s.pos), lineups[2].starters.map(s => s.pos));
  const gkBefore = lineups[2].starters.find(s => s.pos === "GK").player.id;
  const gkAfter = next.starters.find(s => s.pos === "GK").player.id;
  assert.equal(gkAfter, gkBefore);
});

test("redraw one quarter keeps other quarters and the minimum", () => {
  const { players, lineups } = rotationFixture();
  const result = redrawQuarterMembership(players, lineups, 2, 2, 4);
  assert.equal(result.ok, true);
  const merged = { ...lineups, 2: result.lineup };
  assert.deepEqual(merged[1], lineups[1]);
  assert.deepEqual(merged[3], lineups[3]);
  assert.deepEqual(merged[4], lineups[4]);
  assert.equal(playersUnderMin(players, merged, 2, 4).length, 0);
  assert.equal(result.lineup.starters.filter(s => s.player).length, 6);
});

test("redraw during a quarter keeps the goalkeeper in goal", () => {
  const { players, lineups } = rotationFixture();
  const gkBefore = lineups[2].starters.find(s => s.pos === "GK").player.id;
  for (let i = 0; i < 6; i++) {
    const result = redrawQuarterMembership(players, lineups, 2, 2, 4, { lockGoalkeeper: true });
    assert.equal(result.ok, true);
    assert.equal(result.lineup.starters.find(s => s.pos === "GK").player.id, gkBefore);
  }
});

test("redraw keeps a half-short player on the field", () => {
  const players = [player("ann"), player("bea"), player("cal")];
  const pair = (a, b) => ({
    starters: [
      { pos: "GK", player: players.find(p => p.id === a) },
      { pos: "CF", player: players.find(p => p.id === b) },
    ],
    bench: players.filter(p => p.id !== a && p.id !== b),
  });
  const lineups = {
    1: pair("ann", "bea"),
    2: pair("ann", "bea"),
    3: pair("bea", "cal"),
    4: pair("bea", "cal"),
  };
  const segments = { ann: { 1: "entered" } };
  for (let i = 0; i < 8; i++) {
    const result = redrawQuarterMembership(players, lineups, 4, 2, 4, { segments });
    assert.equal(result.ok, true);
    assert.deepEqual(result.lineup.starters.map(s => s.player.id).sort(), ["ann", "cal"]);
  }
});

test("redraw refuses when this quarter cannot cover everyone who still needs it", () => {
  const players = Array.from({ length: 7 }, (_, i) => player(`p${i + 1}`));
  const empty = {
    starters: slots6.map(pos => ({ pos, player: null })),
    bench: players,
  };
  const q2 = {
    starters: players.slice(0, 6).map((p, i) => ({ pos: slots6[i], player: p })),
    bench: [players[6]],
  };
  const lineups = { 1: empty, 2: q2, 3: empty, 4: empty };
  const result = redrawQuarterMembership(players, lineups, 2, 2, 4);
  assert.equal(result.ok, false);
  assert.match(result.reason, /must play this quarter/);
});

test("a bench swap that strands a player is visible to the warn helper", () => {
  const players = [player("a"), player("b"), player("c")];
  const slot = ["GK", "CF"];
  const on = (ids) => ({
    starters: ids.map((id, i) => ({ pos: slot[i], player: players.find(p => p.id === id) })),
    bench: players.filter(p => !ids.includes(p.id)),
  });
  const lineups = { 1: on(["a", "b"]), 2: on(["a", "b"]), 3: on(["a", "c"]), 4: on(["a", "c"]) };
  assert.equal(playersUnderMin(players, lineups, 2, 4).length, 0);
  const swapped = { ...lineups, 4: on(["a", "b"]) };
  const under = playersUnderMin(players, swapped, 2, 4);
  assert.deepEqual(under.map(p => p.id), ["c"]);
  assert.deepEqual(playersWhoCannotReachMin(players, swapped, 2, 4).map(p => p.id), ["c"]);
});
