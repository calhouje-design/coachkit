import test from "node:test";
import assert from "node:assert/strict";
import { coachkitDrillSeed, drillSeedFile, drillTeamDefaults } from "../data/coachkitDrillSeed.js";
import {
  DETAILS_ONLY_FIELDS,
  LETTER_SHEET_FIELDS,
  buildDiagramModel,
  coachingLine,
  detailsSheet,
  drillHasLockedSchema,
  letterSheet,
  strokeStyle,
} from "./drillDiagram.js";

const triangle = coachkitDrillSeed.find(drill => drill.title === "Triangle Passing");
const gates = coachkitDrillSeed.find(drill => drill.title === "Pass Through the Gates");
const lights = coachkitDrillSeed.find(drill => drill.title.startsWith("Traffic Lights"));

test("seed file is camelCase v1 with normalized coordinates and three drills", () => {
  assert.equal(drillSeedFile.schemaVersion, "coachkit-drill-card-v1-camel");
  assert.equal(drillSeedFile.coordSpace, "normalized_0_1");
  assert.deepEqual(drillSeedFile.letterSheetFields, LETTER_SHEET_FIELDS);
  assert.deepEqual(drillSeedFile.detailsOnlyFields, DETAILS_ONLY_FIELDS);
  assert.equal(coachkitDrillSeed.length, 3);
  coachkitDrillSeed.forEach(drill => {
    assert.equal(drillHasLockedSchema(drill), true);
    assert.equal(drill.diagram.coordSpace, "normalized_0_1");
    assert.equal(Array.isArray(drill.progressions), true);
    assert.equal(Array.isArray(drill.regressions), true);
    assert.equal(typeof drill.fewerPlayers, "string");
  });
  assert.equal(triangle.number, 3);
  assert.equal(triangle.category, "PASSING");
  assert.equal(triangle.durationMin, 10);
  assert.equal(gates.playersLabel, "10 (5 pairs)");
  assert.equal(lights.focus, "DRIBBLING");
  assert.equal(lights.category, "WARM-UP");
});

test("letter sheet keeps progressions and leaves how-to-run on the details sheet", () => {
  const sheet = letterSheet(triangle);
  const details = detailsSheet(triangle);
  assert.equal(sheet.title, "Triangle Passing");
  assert.equal(sheet.progressions.length, 4);
  assert.equal(sheet.progressions[0], "Increase distance to 10–12 yards.");
  assert.equal("howToRun" in sheet, false);
  assert.equal(details.howToRun.length, 4);
  assert.equal(details.commonMistakes.length, 4);
  assert.match(details.fewerPlayers, /2 players/);
  assert.equal(details.block, "PASSING");
  assert.equal(details.timeBlock, "10 min");
  assert.equal(details.regressions.length, 3);
  assert.match(formatCredit(triangle), /Jared/);
});

function formatCredit(drill) {
  return letterSheet(drill).diagramCredit;
}

test("normalized 0–1 coords place triangle players, cone distances, passes, and runs", () => {
  const model = buildDiagramModel(triangle.diagram);
  assert.deepEqual(model.players.map(player => player.label), ["A", "B", "C"]);
  assert.equal(model.cones.length, 3);
  const playerA = model.players.find(player => player.id === "pA");
  assert.ok(Math.abs(playerA.x - 160) < 0.01);
  assert.ok(Math.abs(playerA.y - 0.28 * 220) < 0.01);
  assert.equal(model.strokes.filter(stroke => stroke.type === "pass").length, 3);
  assert.equal(model.strokes.filter(stroke => stroke.type === "run").length, 3);
  model.strokes.filter(stroke => stroke.type === "pass").forEach(stroke => {
    assert.equal(stroke.style.dash, strokeStyle("pass").dash);
    assert.equal(stroke.style.arrow, true);
  });
  model.strokes.filter(stroke => stroke.type === "run").forEach(stroke => {
    assert.equal(stroke.style.dash, null);
    assert.equal(stroke.style.arrow, true);
  });
  assert.deepEqual(model.distances.map(item => item.label), ["8 YDS", "8 YDS", "8 YDS"]);
  assert.equal(model.balls.length, 1);
  assert.equal(model.balls[0].id, "pA");
  assert.ok(model.balls[0].x > playerA.x);
  const pass = model.strokes[0];
  const start = pass.points[0];
  const end = pass.points[pass.points.length - 1];
  assert.ok(Math.hypot(start.x - model.players[0].x, start.y - model.players[0].y) > 8);
  assert.ok(Math.hypot(end.x - model.players[1].x, end.y - model.players[1].y) > 8);
});

test("gates and traffic lights resolve cone targets, dribbles, and every ball", () => {
  const gatesModel = buildDiagramModel(gates.diagram);
  assert.equal(gatesModel.cones.length, 6);
  assert.equal(gatesModel.strokes.filter(stroke => stroke.type === "pass").length, 1);
  assert.equal(gatesModel.strokes.filter(stroke => stroke.type === "run").length, 2);
  assert.deepEqual(gatesModel.distances.map(item => item.label), ["3 YD"]);
  const mini = buildDiagramModel(gates.diagram, { mini: true });
  assert.equal(mini.distances.length, 0);
  const lightsModel = buildDiagramModel(lights.diagram);
  assert.equal(lightsModel.strokes.length, 2);
  lightsModel.strokes.forEach(stroke => {
    assert.equal(stroke.type, "dribble");
    assert.equal(stroke.style.wavy, true);
    assert.ok(stroke.points.length > 2);
  });
  assert.equal(lightsModel.balls.length, 4);
  assert.equal(strokeStyle("run").dash, null);
});

test("coaching line names Lazear as head coach", () => {
  const line = coachingLine(drillTeamDefaults);
  assert.match(line, /U8 Passers/);
  assert.match(line, /10 players/);
  assert.match(line, /Head Coach: Lazear/);
  assert.match(line, /Assistant Coach: Jared Calhoun/);
  assert.doesNotMatch(line, /Head Coach: Jared/);
});
