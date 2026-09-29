import test from "node:test";
import assert from "node:assert/strict";
import {
  clampPeriod,
  formationNameForPeriod,
  reapplyBase,
  reshapeLineup,
  withPeriodOverride,
} from "./formations.js";
import { sayDivision, sayDivisionKey } from "./sayEastGuide.js";

function lineup(slots, ids) {
  return {
    starters: slots.map((pos, index) => ({ pos, player: { id: ids[index], name: ids[index], positions: ["GK", "CM", "CF"] } })),
    bench: [{ id: "bench", name: "Bench", positions: ["CM"] }],
  };
}

test("a period uses the base shape unless that period has an override", () => {
  const overrides = withPeriodOverride({}, 2, "2-0-4", "2-3-2");
  assert.equal(formationNameForPeriod("2-3-2", overrides, 1), "2-3-2");
  assert.equal(formationNameForPeriod("2-3-2", overrides, 2), "2-0-4");
  assert.equal(formationNameForPeriod("2-3-2", overrides, 3), "2-3-2");
  const cleared = withPeriodOverride(overrides, 2, "2-3-2", "2-3-2");
  assert.equal(formationNameForPeriod("2-3-2", cleared, 2), "2-3-2");
});

test("changing the base reshapes only periods that are not overridden", () => {
  const slots = ["GK", "LD", "RD", "CF"];
  const other = ["GK", "CD", "LM", "RM"];
  const lineups = {
    1: lineup(slots, ["gk", "a", "b", "c"]),
    2: lineup(other, ["gk", "a", "b", "c"]),
  };
  const next = reapplyBase(lineups, {
    periods: 2,
    baseSlots: ["GK", "LB", "RB", "ST"],
    overrides: { 2: "2-0-4" },
  });
  assert.deepEqual(next[1].starters.map(slot => slot.pos), ["GK", "LB", "RB", "ST"]);
  assert.equal(next[1].starters[0].player.id, "gk");
  assert.deepEqual(next[2].starters.map(slot => slot.pos), other);
  assert.equal(next[2], lineups[2]);
});

test("reshape keeps the goalkeeper in the GK slot", () => {
  const next = reshapeLineup(lineup(["GK", "CM", "CF"], ["keep", "mid", "fwd"]), ["CF", "GK", "CM"]);
  assert.equal(next.starters.find(slot => slot.pos === "GK").player.id, "keep");
});

test("the period arrow stays put past the last period", () => {
  assert.equal(clampPeriod(2, 3, 2), 2);
  assert.equal(clampPeriod(3, 4, 3), 3);
  assert.equal(clampPeriod(4, 5, 4), 4);
  assert.equal(clampPeriod(1, 0, 4), 1);
  assert.equal(clampPeriod(2, 3, 4), 3);
});

test("SAY East rules content is still attached to each division", () => {
  for (const age of ["U6", "U8", "U10", "U12", "U14", "U16", "U19"]) {
    const division = sayDivision(age);
    assert.ok(division.quickRules.length > 0, age);
    assert.ok(division.unknownRules.length > 0, age);
    assert.ok(division.officialLinks.length > 0, age);
    assert.equal(typeof division.heading, "boolean");
    assert.equal(typeof division.offside, "boolean");
    assert.equal(typeof division.buildOut, "boolean");
  }
  assert.equal(sayDivisionKey("U7"), "U8 / Passers");
  assert.equal(sayDivisionKey("U18"), "U19 / Seniors");
});
