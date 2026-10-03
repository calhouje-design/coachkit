import test from "node:test";
import assert from "node:assert/strict";
import { scheduleHalfRotation, shareFieldSheet } from "./gameDay.js";
import { decorateShareSheet } from "./afterSubs.js";
import { fieldImageTiles, shareHelperText } from "./fieldGrid.js";

const slots = ["GK", "LD", "RD", "LM", "RM", "CF"];
const players = ["Ann", "Bea", "Cal", "Dee", "Eve", "Fay", "Gia", "Hal"].map((name, index) => ({
  id: `p${index + 1}`,
  name: `${name} Stone`,
  number: String(index + 1),
  positions: ["GK", "CM", "CF"],
  injured: false,
  out: false,
  ratings: {},
}));
const planned = scheduleHalfRotation(players, slots, {
  minHalves: 4,
  totalQuarters: 4,
  rate: () => 1,
});

function sheet({ subMode, afterSubs = {}, snapshots = {} }) {
  return decorateShareSheet(
    shareFieldSheet({
      lineups: planned.lineups,
      pairPlan: {},
      subMode,
      quarters: [1, 2, 3, 4],
      periodAbbrev: "Q",
    }),
    {
      lineups: planned.lineups,
      afterSubs,
      snapshots,
      subMode,
      periodAbbrev: "Q",
      roster: players,
    },
  );
}

test("full mode is one tile per quarter, two files per row of names", () => {
  const tiles = fieldImageTiles(sheet({ subMode: false }));
  assert.deepEqual(tiles.map(tile => tile.caption), ["Q1", "Q2", "Q3", "Q4"]);
  assert.deepEqual(tiles.map(tile => tile.filename), [
    "CoachKit_Field_Q1.png",
    "CoachKit_Field_Q2.png",
    "CoachKit_Field_Q3.png",
    "CoachKit_Field_Q4.png",
  ]);
  assert.equal(tiles.length % 2, 0);
  assert.deepEqual(tiles.map(tile => tile.half), [null, null, null, null]);
});

test("sub mode with a 2nd-half lineup pairs halves and keeps quarter order", () => {
  const tiles = fieldImageTiles(sheet({ subMode: true }));
  assert.deepEqual(tiles.map(tile => tile.caption), [
    "Q1 · 1st half",
    "Q1 · 2nd half",
    "Q2 · 1st half",
    "Q2 · 2nd half",
    "Q3 · 1st half",
    "Q3 · 2nd half",
    "Q4 · 1st half",
    "Q4 · 2nd half",
  ]);
  assert.deepEqual(tiles.map(tile => tile.filename), [
    "CoachKit_Field_Q1_H1.png",
    "CoachKit_Field_Q1_H2.png",
    "CoachKit_Field_Q2_H1.png",
    "CoachKit_Field_Q2_H2.png",
    "CoachKit_Field_Q3_H1.png",
    "CoachKit_Field_Q3_H2.png",
    "CoachKit_Field_Q4_H1.png",
    "CoachKit_Field_Q4_H2.png",
  ]);
  const firstHalf = tiles[0].panel.starters.map(slot => slot.id);
  const secondHalf = tiles[1].panel.starters.map(slot => slot.id);
  assert.notDeepEqual(secondHalf, firstHalf);
  assert.equal(tiles[0].panel.label, "Q1");
  assert.equal(tiles[1].panel.quarter, 1);
  assert.deepEqual(tiles.map(tile => tile.half), [
    "start", "after", "start", "after", "start", "after", "start", "after",
  ]);
});

test("a halves game names start and after subs instead of H1_H1", () => {
  const halves = scheduleHalfRotation(players, slots, {
    minHalves: 2,
    totalQuarters: 2,
    rate: () => 1,
  });
  const tiles = fieldImageTiles(decorateShareSheet(
    shareFieldSheet({
      lineups: halves.lineups,
      pairPlan: {},
      subMode: true,
      quarters: [1, 2],
      periodAbbrev: "H",
    }),
    {
      lineups: halves.lineups,
      afterSubs: {},
      snapshots: {},
      subMode: true,
      periodAbbrev: "H",
      roster: players,
    },
  ));
  assert.deepEqual(tiles.map(tile => tile.caption), [
    "1st half · start",
    "1st half · after subs",
    "2nd half · start",
    "2nd half · after subs",
  ]);
  assert.deepEqual(tiles.map(tile => tile.filename), [
    "CoachKit_Field_H1_Start.png",
    "CoachKit_Field_H1_After.png",
    "CoachKit_Field_H2_Start.png",
    "CoachKit_Field_H2_After.png",
  ]);
  assert.deepEqual(tiles.map(tile => tile.half), ["start", "after", "start", "after"]);
});

test("a full-mode H2 file is one lineup, not a 2nd-half split", () => {
  const tiles = fieldImageTiles({
    quarters: [
      { quarter: 1, label: "H1", starters: [{ id: "a" }], bench: [], pairs: [] },
      { quarter: 2, label: "H2", starters: [{ id: "b" }], bench: [], pairs: [] },
    ],
  });
  assert.deepEqual(tiles.map(tile => tile.filename), ["CoachKit_Field_H1.png", "CoachKit_Field_H2.png"]);
  assert.equal(tiles[1].filename.endsWith("_H2.png"), true);
  assert.equal(tiles.some(tile => tile.half), false);
});

test("share helper text follows quarters, halves, and full games", () => {
  assert.equal(
    shareHelperText({ split: true, periodAbbrev: "Q" }),
    "Each quarter has a 1st-half and a 2nd-half lineup. Tap Save under any image to send it or add it to Photos.",
  );
  assert.equal(
    shareHelperText({ split: true, periodAbbrev: "H" }),
    "Each half has a start lineup and an after-subs lineup. Tap Save under any image to send it or add it to Photos.",
  );
  assert.equal(
    shareHelperText({ split: false, periodAbbrev: "Q" }),
    "Tap Save under any image to send it or add it to Photos.",
  );
});
