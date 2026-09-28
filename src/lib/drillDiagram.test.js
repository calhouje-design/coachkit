import test from "node:test";
import assert from "node:assert/strict";
import { coachkitDrillSeed } from "../data/coachkitDrillSeed.js";
import {
  SHEET_CHROME,
  buildDiagramModel,
  drillHasLockedSchema,
  progressionGroups,
  strokeStyle,
} from "./drillDiagram.js";

const triangle = coachkitDrillSeed.find(drill => drill.name === "Triangle Passing");
const gates = coachkitDrillSeed.find(drill => drill.name === "Pass Through the Gates");
const lights = coachkitDrillSeed.find(drill => drill.name.startsWith("Traffic Lights"));

test("seed keeps the locked schema and the three named drills", () => {
  assert.equal(coachkitDrillSeed.length, 3);
  coachkitDrillSeed.forEach(drill => {
    assert.equal(drillHasLockedSchema(drill), true);
    assert.equal(Array.isArray(drill.setup), true);
    assert.equal(Array.isArray(drill.how_to_run), true);
    assert.equal(Array.isArray(drill.legend), true);
    assert.ok(drill.diagram && drill.diagram.kind === "svg");
  });
  assert.equal(triangle.number, 3);
  assert.equal(triangle.block, "Passing");
  assert.equal(gates.players_label, "10");
  assert.equal(lights.focus, "WARM-UP");
});

test("triangle passing draws three dashed passes, yard labels, and the ball at A", () => {
  const model = buildDiagramModel(triangle.diagram);
  assert.equal(model.players.map(player => player.label).join(""), "ABC");
  assert.equal(model.cones.length, 3);
  assert.equal(model.strokes.length, 3);
  model.strokes.forEach(stroke => {
    assert.equal(stroke.type, "pass");
    assert.equal(stroke.style.dash, strokeStyle("pass").dash);
    assert.equal(stroke.style.arrow, true);
    assert.ok(stroke.d.startsWith("M "));
  });
  assert.deepEqual(model.distances.map(item => item.label), ["8 YDS", "8 YDS", "8 YDS"]);
  const playerA = model.players.find(player => player.id === "A");
  assert.ok(model.ball.x > playerA.x);
  assert.ok(model.ball.y > playerA.y);
  const pass = model.strokes[0];
  const start = pass.points[0];
  const end = pass.points[pass.points.length - 1];
  assert.ok(Math.hypot(start.x - model.players[0].x, start.y - model.players[0].y) > 8);
  assert.ok(Math.hypot(end.x - model.players[1].x, end.y - model.players[1].y) > 8);
});

test("a dribble uses the given path and a run stays solid", () => {
  const lightsModel = buildDiagramModel(lights.diagram);
  assert.equal(lightsModel.strokes.length, 1);
  assert.equal(lightsModel.strokes[0].type, "dribble");
  assert.equal(lightsModel.strokes[0].style.wavy, true);
  assert.equal(lightsModel.strokes[0].style.dash, null);
  assert.equal(lightsModel.strokes[0].points.length, 3);
  assert.equal(strokeStyle("run").dash, null);
  assert.equal(strokeStyle("run").arrow, true);
  const gatesModel = buildDiagramModel(gates.diagram, { mini: true });
  assert.equal(gatesModel.strokes[0].type, "pass");
  assert.equal(gatesModel.distances.length, 0);
  assert.equal(gatesModel.cones.length, 4);
});

test("progressions keep a string fewer_players note and the coaching line names Lazear", () => {
  const groups = progressionGroups(triangle.progressions);
  assert.equal(groups.find(group => group.key === "fewer_players").items.length, 1);
  assert.match(groups.find(group => group.key === "fewer_players").items[0], /extras rest/);
  assert.equal(progressionGroups(gates.progressions).find(group => group.key === "harder").items.length, 3);
  assert.match(SHEET_CHROME, /Head Coach Lazear/);
  assert.match(SHEET_CHROME, /Assistant Coach Jared Calhoun/);
  assert.doesNotMatch(SHEET_CHROME, /Head Coach Jared/);
});
