import test from "node:test";
import assert from "node:assert/strict";
import { FORMATION_TEMPLATES } from "./formations.js";
import {
  noteSubSegment,
  planAvailability,
  playerHalfMask,
  revalidateBackHalfMarks,
  scheduleHalfRotation,
  segmentAt,
  shareFieldSheet,
  sharePlayTimeSheet,
  vacatedSpotHolder,
} from "./gameDay.js";
import { decorateShareSheet, withBackHalfShare } from "./afterSubs.js";
import { markInjured } from "./playerStatus.js";
import { commitReturn } from "./returnDialog.js";

const FIRST = ["Ann", "Bea", "Cal", "Dee", "Eve", "Fay", "Gia", "Hal", "Ivy", "Jon", "Kai", "Lou"];
const LAST = ["Adams", "Baker", "Clark", "Davis", "Evans", "Foster", "Green", "Hayes", "Ingram", "Jones", "Kelly", "Lewis"];

function roster(count) {
  const positions = ["GK", "LD", "CD", "RD", "LM", "CM", "RM", "CF", "LW", "RW"];
  return Array.from({ length: count }, (_, index) => ({
    id: `p${index + 1}`,
    name: `${FIRST[index]} ${LAST[index]}`,
    number: String(index + 1),
    positions,
    injured: false,
    out: false,
  }));
}

function nameOf(players, id) {
  return players.find(player => player.id === id)?.name?.split(" ")[0] || id || "-";
}

function chart(state, { total, minQ, abbrev }) {
  const quarters = Array.from({ length: total }, (_, index) => index + 1);
  const minutes = {};
  state.players.forEach(player => { minutes[player.id] = 0; });
  const field = withBackHalfShare(decorateShareSheet(shareFieldSheet({
    lineups: state.lineups,
    segments: state.segments,
    subMode: true,
    quarters,
    periodAbbrev: abbrev,
    minutesById: minutes,
  }), {
    lineups: state.lineups,
    subMode: true,
    periodAbbrev: abbrev,
    roster: state.players,
  }), {
    players: state.players,
    lineups: state.lineups,
    segments: state.segments,
    periodAbbrev: abbrev,
    minutesById: minutes,
    subMode: true,
  });
  const play = sharePlayTimeSheet({
    players: state.players,
    lineups: state.lineups,
    segments: state.segments,
    credit: state.credit || {},
    minQ,
    quarters,
    periodAbbrev: abbrev,
  });
  return {
    pairs: field.quarters.map(panel => (
      `${abbrev}${panel.quarter}: ${(panel.pairs || []).map(pair => `${nameOf(state.players, pair.inId)}>${nameOf(state.players, pair.outId)}`).join(",")}`
    )),
    rows: play.rows.map(row => (
      `${row.name.split(" ")[0]} ${row.label} ${row.cells.map(cell => cell.kind).join("/")}`
    )),
  };
}

function injure(state, id, quarter) {
  const current = state.lineups[quarter];
  const onFieldNow = !!current?.starters?.some(slot => slot.player?.id === id);
  const wasOn = playerHalfMask(id, current, segmentAt(state.segments, id, quarter))[0];
  const players = state.players.map(player => (
    player.id === id
      ? markInjured(player, { injuredInQuarter: quarter, returnQuarter: null, midGameInjury: true })
      : player
  ));
  const planned = planAvailability({
    autoRegen: true,
    kind: "absent",
    players,
    absentId: id,
    quarter,
    lineups: state.lineups,
    segments: state.segments,
    slots: state.slots,
    subMode: true,
    minHalves: state.minHalves,
    totalQuarters: state.total,
    livePeriod: true,
  });
  let roster = planned.players || players;
  if (onFieldNow) {
    const holder = vacatedSpotHolder(current, planned.lineups?.[quarter], id);
    if (holder) roster = roster.map(player => (player.id === id ? { ...player, replacedBy: holder } : player));
  }
  let segments = planned.segments;
  let credit = { ...(state.credit || {}) };
  if (wasOn) {
    segments = noteSubSegment(segments, id, quarter, "left");
    credit = { ...credit, [id]: [...new Set([...(credit[id] || []), quarter])] };
  }
  const checked = revalidateBackHalfMarks({
    players: roster,
    lineups: planned.lineups,
    segments,
    fromQuarter: quarter,
    totalQuarters: state.total,
  });
  return { ...state, players: checked.players, lineups: checked.lineups, segments: checked.segments, credit };
}

function answer(state, id, quarter, available, half) {
  const quarters = Array.from({ length: state.total }, (_, index) => index + 1);
  const result = commitReturn({
    players: state.players,
    lineups: state.lineups,
    segments: state.segments,
    realEvents: { [quarter]: { [id]: true } },
    credit: {},
    playerId: id,
    source: "roster",
    totalQuarters: state.total,
    subMode: true,
    autoRegen: true,
    hasSheet: true,
    slots: state.slots,
    minHalves: state.minHalves,
    minQ: state.total === 2 ? 1 : 2,
    quarters,
    periodAbbrev: state.abbrev,
    clocks: {},
    viewingQuarter: quarter,
    viewingClock: 0,
    running: true,
  }, { quarter, available, half: available ? half : "whole" });
  if (!result.changed) return state;
  let next = {
    ...state,
    players: result.players,
    lineups: result.lineups,
    segments: result.segments,
  };
  if (result.regenerated) {
    const backHalfYes = available && half === "back";
    const from = backHalfYes || !available ? quarter + 1 : quarter;
    const checked = revalidateBackHalfMarks({
      players: next.players,
      lineups: next.lineups,
      segments: next.segments,
      fromQuarter: from,
      totalQuarters: state.total,
    });
    next = { ...next, players: checked.players, lineups: checked.lineups, segments: checked.segments };
  }
  return next;
}

function fieldIds(state, quarter) {
  return (state.lineups[quarter]?.starters || [])
    .filter(slot => slot.player && slot.pos !== "GK")
    .map(slot => slot.player.id);
}

function play(spec) {
  const slots = FORMATION_TEMPLATES[spec.format][0].slots;
  const minHalves = spec.total === 2 ? 2 : 4;
  const players = roster(spec.count);
  const opened = scheduleHalfRotation(players, slots, {
    minHalves,
    totalQuarters: spec.total,
    seed: spec.seed,
  });
  let state = {
    players,
    lineups: opened.lineups,
    segments: opened.segments,
    slots,
    total: spec.total,
    minHalves,
    abbrev: spec.abbrev,
    credit: {},
  };
  const first = fieldIds(state, spec.quarter)[spec.victimIndex];
  state = injure(state, first, spec.quarter);
  if (spec.answer != null) state = answer(state, first, spec.quarter, spec.answer, spec.half || "whole");
  if (spec.second) {
    const owners = fieldIds(state, spec.quarter).filter(id => (
      id !== first && playerHalfMask(id, state.lineups[spec.quarter], segmentAt(state.segments, id, spec.quarter))[0]
    ));
    const again = owners[0] || fieldIds(state, spec.quarter).find(id => id !== first);
    state = injure(state, again, spec.quarter);
  }
  return chart(state, spec);
}

function assertMainChart(spec, pairs, rows) {
  assert.deepEqual(play(spec), { pairs, rows });
}

test("an 8v8 Q2 injury with Return No keeps main's Q3 and Q4 pairs", () => {
  assertMainChart({
    format: "8v8", count: 12, total: 4, seed: 2, quarter: 2, abbrev: "Q", minQ: 2, victimIndex: 3, answer: false,
  }, [
    "Q1: Dee>Jon,Eve>Lou,Bea>Ann,Gia>Cal",
    "Q2: Bea>Cal,Jon>Dee,Lou>Ann",
    "Q3: Hal>Ann,Lou>Jon,Cal>Eve,Dee>Fay",
    "Q4: Ann>Bea,Cal>Eve,Dee>Fay,Jon>Gia",
  ], [
    "Ann 3/2Q partial-on/full/full/partial-off",
    "Bea 2½/2Q partial-off/bench/full/full",
    "Cal 2½/2Q partial-on/full/partial-off/partial-off",
    "Dee 2½/2Q partial-off/full/partial-off/partial-off",
    "Eve 2½/2Q partial-off/full/partial-on/partial-on",
    "Fay 2½/2Q full/partial-on/partial-on/partial-on",
    "Gia 2½/2Q partial-off/full/partial-on/partial-on",
    "Hal 2½/2Q partial-on/partial-on/partial-off/full",
    "Ivy 2½/2Q partial-on/partial-on/partial-on/full",
    "Jon 3/2Q full/partial-off/full/partial-off",
    "Kai 3/2Q full/partial-off/full/partial-on",
    "Lou 3/2Q full/partial-off/partial-off/full",
  ]);
});

test("an 8v8 Q2 injury, 2nd-half Return, and a second injury keep main's Q3 pairs", () => {
  assertMainChart({
    format: "8v8", count: 12, total: 4, seed: 17, quarter: 2, abbrev: "Q", minQ: 2, victimIndex: 1, answer: true, half: "back", second: true,
  }, [
    "Q1: Dee>Ann,Eve>Kai,Fay>Bea,Ivy>Gia",
    "Q2: Bea>Kai,Ann>Dee,Ivy>Cal",
    "Q3: Dee>Kai,Eve>Lou,Ivy>Bea",
    "Q4: Ann>Bea,Kai>Cal,Lou>Eve",
  ], [
    "Ann 3/2Q full/partial-off/full/partial-off",
    "Bea 3½/2Q full/full/full/partial-on",
    "Cal 3/2Q full/partial-on/full/partial-on",
    "Dee 3/2Q partial-off/full/partial-off/full",
    "Eve 3/2Q partial-off/full/partial-off/full",
    "Fay 3/2Q partial-off/full/partial-on/full",
    "Gia 2½/2Q full/partial-on/partial-on/partial-on",
    "Hal 2½/2Q partial-on/partial-on/partial-on/full",
    "Ivy 2½/2Q partial-off/partial-off/partial-off/full",
    "Kai 2½/2Q partial-on/partial-off/full/partial-off",
    "Lou 3/2Q partial-on/full/full/partial-off",
  ]);
});

test("a 7v7 halves H1 injury with Return No keeps main's pairs and play time", () => {
  assertMainChart({
    format: "7v7", count: 10, total: 2, seed: 13, quarter: 1, abbrev: "H", minQ: 1, victimIndex: 2, answer: false,
  }, [
    "H1: Ann>Bea,Fay>Cal",
    "H2: Bea>Dee,Cal>Eve,Jon>Fay",
  ], [
    "Ann 1/1Q bench/full",
    "Bea 1½/1Q full/partial-off",
    "Cal 1½/1Q full/partial-off",
    "Dee 1½/1Q full/partial-on",
    "Eve 1½/1Q partial-off/full",
    "Fay 1½/1Q partial-off/full",
    "Gia 1½/1Q full/partial-on",
    "Hal 1½/1Q partial-on/full",
    "Ivy 1/1Q partial-on/partial-on",
    "Jon 1½/1Q full/partial-off",
  ]);
});

test("a 7v7 halves H1 injury, Return Yes, and a second injury keep main's play time", () => {
  assertMainChart({
    format: "7v7", count: 10, total: 2, seed: 13, quarter: 1, abbrev: "H", minQ: 1, victimIndex: 0, answer: true, half: "whole", second: true,
  }, [
    "H1: Ann>Cal,Fay>Jon",
    "H2: Cal>Ann,Jon>Dee",
  ], [
    "Ann 1/1Q bench/full",
    "Cal 1½/1Q full/partial-off",
    "Dee 1½/1Q full/partial-on",
    "Eve 1½/1Q full/partial-on",
    "Fay 1½/1Q partial-off/full",
    "Gia 2/1Q full/full",
    "Hal 1½/1Q partial-on/full",
    "Ivy 1½/1Q partial-on/full",
    "Jon 1½/1Q full/partial-off",
  ]);
});
