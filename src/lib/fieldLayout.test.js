import test from "node:test";
import assert from "node:assert/strict";
import { FORMATION_TEMPLATES } from "./formations.js";
import {
  CIRCLE_DIAMETER,
  FOUR_WIDE_MIN_NUDGE,
  FOUR_WIDE_OFFSET_CAP,
  LABEL_FONT_SIZE,
  LABEL_LETTER_SPACING_EM,
  LABEL_WIDTH_GUARD,
  SIDE_MARGIN,
  fitPlayerLabel,
  labelWidth,
  layoutFieldPlayers,
} from "./fieldLayout.js";

const WIDTHS = [320, 360, 390, 430];
const NAMES = ["Blake Pete", "Jaxon Wells", "Wes Duda", "Trey Lazear", "Maddox Anderson"];
const LINE_POS = {
  1: ["CF"],
  2: ["LD", "RD"],
  3: ["LD", "CD", "RD"],
  4: ["LD", "CD", "CD", "RD"],
  5: ["LB", "CB", "CB", "CB", "RB"],
};

function startersFor(positions, names = NAMES) {
  return positions.map((pos, i) => ({
    pos,
    player: { id: `p${i}`, name: names[i % names.length], number: String(i + 1) },
  }));
}

function rectsOf(layout) {
  const rects = [];
  layout.forEach(spot => {
    rects.push({ ...spot.circle, who: spot.fullName, kind: "circle" });
    if (spot.labelBox) rects.push({ ...spot.labelBox, who: spot.fullName, kind: "label" });
  });
  return rects;
}

function overlaps(a, b) {
  return a.x < b.x + b.width - 0.05
    && a.x + a.width > b.x + 0.05
    && a.y < b.y + b.height - 0.05
    && a.y + a.height > b.y + 0.05;
}

function assertInsideField(layout, fieldWidth, fieldHeight) {
  rectsOf(layout).forEach(box => {
    assert.ok(box.x >= -0.05, `${box.who} ${box.kind} left ${box.x}`);
    assert.ok(box.y >= -0.05, `${box.who} ${box.kind} top ${box.y}`);
    assert.ok(box.x + box.width <= fieldWidth + 0.05, `${box.who} ${box.kind} right`);
    assert.ok(box.y + box.height <= fieldHeight + 0.05, `${box.who} ${box.kind} bottom`);
  });
}

function assertNoOverlap(layout) {
  const rects = rectsOf(layout);
  for (let a = 0; a < rects.length; a++) {
    for (let b = a + 1; b < rects.length; b++) {
      assert.equal(
        overlaps(rects[a], rects[b]),
        false,
        `${rects[a].kind} ${rects[a].who} hits ${rects[b].kind} ${rects[b].who}`,
      );
    }
  }
}

function assertSpread(layout, fieldWidth) {
  const lines = new Map();
  layout.forEach(spot => {
    if (!lines.has(spot.line)) lines.set(spot.line, []);
    lines.get(spot.line).push(spot);
  });
  const inset = SIDE_MARGIN + CIRCLE_DIAMETER / 2;
  lines.forEach(group => {
    group.sort((a, b) => a.lineIndex - b.lineIndex);
    if (group.length === 1) {
      assert.ok(Math.abs(group[0].x - fieldWidth / 2) < 0.6);
      return;
    }
    assert.ok(Math.abs(group[0].x - inset) < 0.6, `left edge ${group[0].x}`);
    assert.ok(Math.abs(group[group.length - 1].x - (fieldWidth - inset)) < 0.6, `right edge ${group.at(-1).x}`);
    for (let i = 1; i < group.length; i++) {
      assert.ok(group[i].x > group[i - 1].x);
    }
  });
}

test("label width includes letter-spacing and a rounding guard", () => {
  const gap = labelWidth("AA") - labelWidth("A");
  assert.ok(gap >= 7, `letter-spacing gap ${gap}`);
  assert.equal(LABEL_WIDTH_GUARD, 2);
  assert.ok(labelWidth("Sean Jones") >= LABEL_WIDTH_GUARD);
  assert.equal(LABEL_FONT_SIZE, 9);
  assert.equal(LABEL_LETTER_SPACING_EM, 0.02);
});

test("a tight label uses a last initial, then an ellipsis", () => {
  assert.equal(fitPlayerLabel("Blake Pete", labelWidth("Blake Pete")), "Blake Pete");
  assert.equal(fitPlayerLabel("Jaxon Wells", labelWidth("Jaxon W.")), "Jaxon W.");
  const cap = labelWidth("Mad…");
  const tiny = fitPlayerLabel("Maddox Anderson", cap);
  assert.equal(tiny, "Mad…");
  assert.ok(labelWidth(tiny) <= cap);
});

test("every formation and every line size stays inside the field without collisions", () => {
  const formations = Object.values(FORMATION_TEMPLATES).flat();
  assert.ok(formations.length >= 40);
  WIDTHS.forEach(fieldWidth => {
    const fieldHeight = fieldWidth * 1.5;
    for (let count = 1; count <= 5; count++) {
      const layout = layoutFieldPlayers(startersFor(LINE_POS[count]), { fieldWidth, fieldHeight });
      assert.equal(layout.length, count);
      assertInsideField(layout, fieldWidth, fieldHeight);
      assertNoOverlap(layout);
      assertSpread(layout, fieldWidth);
      if (count === 4) assertOutsidePairHigher(layout, `${count}-wide ${fieldWidth}`);
    }
    formations.forEach(formation => {
      const layout = layoutFieldPlayers(startersFor(formation.slots), { fieldWidth, fieldHeight });
      assert.equal(layout.length, formation.slots.length, formation.name);
      assertInsideField(layout, fieldWidth, fieldHeight);
      assertNoOverlap(layout);
      assertSpread(layout, fieldWidth);
      assertOutsidePairHigher(layout, formation.name);
    });
  });
});

test("4-2-1 spreads the back four and keeps the long names readable", () => {
  const names = ["Blake Pete", "Jaxon Wells", "Wes Duda", "Trey Lazear", "Remi Brown", "Sean Jones", "Henry Davis"];
  const positions = ["GK", "LD", "CD", "CD", "RD", "LM", "RM", "CF"];
  const layout = layoutFieldPlayers(startersFor(positions, names), { fieldWidth: 360, fieldHeight: 540 });
  const defense = layout.filter(spot => spot.line === "def").sort((a, b) => a.x - b.x);
  assert.deepEqual(defense.map(spot => spot.pos), ["LD", "CD", "CD", "RD"]);
  assert.deepEqual(defense.map(spot => spot.dy), tinyFourWide());
  assertOutsidePairHigher(defense, "4-2-1");
  assert.ok(ySpan(defense) <= FOUR_WIDE_OFFSET_CAP);
  defense.forEach(spot => assert.equal(spot.label, spot.fullName));
  assert.ok(defense[defense.length - 1].x - defense[0].x > 360 * 0.7);
});

test("a tight 4-wide line shortens names before the nudge grows, and a 5-wide line alternates only when needed", () => {
  const wide = Array.from({ length: 4 }, () => "Maddox Anderson");
  const four = layoutFieldPlayers(startersFor(["LD", "CD", "CD", "RD"], wide), {
    fieldWidth: 240,
    fieldHeight: 360,
  });
  assert.deepEqual(four.map(spot => spot.dy), tinyFourWide());
  assertOutsidePairHigher(four, "crowded 4");
  assert.ok(ySpan(four) <= FOUR_WIDE_OFFSET_CAP);
  four.forEach(spot => assert.notEqual(spot.label, spot.fullName));

  const five = layoutFieldPlayers(startersFor(["LB", "CB", "CB", "CB", "RB"], Array(5).fill("Maddox Anderson")), {
    fieldWidth: 320,
    fieldHeight: 480,
  });
  assert.deepEqual(five.map(spot => spot.dy), [0, -16, 0, -16, 0]);
  assertNoOverlap(five);
  assertInsideField(five, 320, 480);
  assert.ok(ySpan(five) <= 16.5);
});

test("a phone-width field keeps each line together and the 4-2-1 names readable", () => {
  const four = layoutFieldPlayers(startersFor(
    ["GK", "LD", "CD", "CD", "RD", "LM", "RM", "CF"],
    ["Sam Keeper", "Blake Pete", "Jaxon Wells", "Wes Duda", "Trey Lazear", "Remi Brown", "Sean Jones", "Henry Davis"],
  ), { fieldWidth: 266, fieldHeight: 399 });
  assertNoOverlap(four);
  assertInsideField(four, 266, 399);
  const defense = four.filter(spot => spot.line === "def").sort((a, b) => a.x - b.x);
  assertOutsidePairHigher(defense, "phone 4-2-1");
  assert.ok(ySpan(defense) <= FOUR_WIDE_OFFSET_CAP, `defense span ${ySpan(defense)}`);
  assert.deepEqual(defense.map(spot => spot.dy), tinyFourWide());
  defense.forEach(spot => assert.equal(spot.label, spot.fullName));

  const five = layoutFieldPlayers(startersFor(
    ["GK", "LB", "CB", "CB", "CB", "RB", "LM", "CM", "RM", "LF", "RF"],
    ["Sam Keeper", "Blake Pete", "Jaxon Wells", "Wes Duda", "Trey Lazear", "Maddox Anderson", "Remi Brown", "Sean Jones", "Henry Davis", "Jude Garcia", "John Smith"],
  ), { fieldWidth: 266, fieldHeight: 399 });
  assertNoOverlap(five);
  assertInsideField(five, 266, 399);
  const back = five.filter(spot => spot.line === "def");
  assert.ok(ySpan(back) <= 16.5, `back span ${ySpan(back)}`);
});

function tinyFourWide() {
  return [-FOUR_WIDE_MIN_NUDGE, FOUR_WIDE_MIN_NUDGE, FOUR_WIDE_MIN_NUDGE, -FOUR_WIDE_MIN_NUDGE];
}

function ySpan(spots) {
  const ys = spots.map(spot => spot.y);
  return Math.max(...ys) - Math.min(...ys);
}

/** North is a smaller y. Outside players sit above the center pair. */
function assertOutsidePairHigher(layout, label) {
  const lines = new Map();
  layout.forEach(spot => {
    if (spot.lineCount !== 4) return;
    if (!lines.has(spot.line)) lines.set(spot.line, []);
    lines.get(spot.line).push(spot);
  });
  let seen = 0;
  lines.forEach(group => {
    group.sort((a, b) => a.lineIndex - b.lineIndex);
    seen += 1;
    assert.equal(group.length, 4, label);
    assert.ok(group[0].y < group[1].y, `${label} left outside should sit above the center`);
    assert.ok(group[3].y < group[2].y, `${label} right outside should sit above the center`);
    assert.ok(group[0].y < group[2].y, `${label} outside pair should sit above the center pair`);
    const offset = Math.max(group[1].y, group[2].y) - Math.min(group[0].y, group[3].y);
    assert.ok(offset <= FOUR_WIDE_OFFSET_CAP + 0.05, `${label} offset ${offset} exceeds ${FOUR_WIDE_OFFSET_CAP}`);
  });
  if (layout.length && layout.every(spot => spot.lineCount === 4)) assert.ok(seen > 0, label);
}
