import test from "node:test";
import assert from "node:assert/strict";
import { FORMATION_TEMPLATES } from "./formations.js";
import { scheduleHalfRotation, shareFieldSheet } from "./gameDay.js";
import { sharePanelSubLines } from "./sharePaint.js";

function roster(count) {
  const positions = ["GK", "LB", "CB", "RB", "LM", "CM", "RM", "LF", "RF", "CF"];
  return Array.from({ length: count }, (_, index) => ({
    id: `p${index + 1}`,
    name: `Player ${index + 1} Longname`,
    number: String(index + 1),
    positions,
    injured: false,
    out: false,
  }));
}

function shareLines(format, shape, periods) {
  const slots = FORMATION_TEMPLATES[format].find(item => item.name === shape).slots;
  const players = roster(slots.length + 4);
  const planned = scheduleHalfRotation(players, slots, {
    minHalves: periods,
    totalQuarters: periods,
    rate: () => 1,
  });
  const sheet = shareFieldSheet({
    lineups: planned.lineups,
    pairPlan: {},
    subMode: true,
    quarters: Array.from({ length: periods }, (_, index) => index + 1),
    periodAbbrev: periods === 2 ? "H" : "Q",
  });
  return sheet.quarters.flatMap(panel => (
    sharePanelSubLines(panel, 10, 96, 360, 430).map(line => ({ label: panel.label, ...line }))
  ));
}

function assertStraight(lines) {
  assert.ok(lines.length > 0, "expected sub lines");
  lines.forEach(line => {
    assert.equal(line.points.length, 2, `${line.label} ${line.outId} bends`);
    const [start, end] = line.points;
    const span = Math.hypot(end.x - start.x, end.y - start.y);
    const direct = Math.hypot(line.target.x - start.x, line.target.y - start.y) - line.rim;
    assert.ok(Math.abs(span - direct) < 0.2, `${line.label} ${line.outId} is ${span.toFixed(1)}px, straight is ${direct.toFixed(1)}`);
    const cross = (end.x - start.x) * (line.target.y - start.y) - (end.y - start.y) * (line.target.x - start.x);
    assert.ok(Math.abs(cross) < 0.2, `${line.label} ${line.outId} leaves the straight line`);
  });
}

test("share-image sub lines are straight on a crowded 11v11 sheet", () => {
  assertStraight(shareLines("11v11", "4-5-1", 4));
});

test("share-image sub lines are straight for a halves game", () => {
  assertStraight(shareLines("6v6", "2-2-1", 2));
});
