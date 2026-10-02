import { createHash } from "node:crypto";
import test from "node:test";
import assert from "node:assert/strict";
import { FORMATION_TEMPLATES } from "./formations.js";
import { fieldMarker, pitchCenterDisc, shareFieldSheet, TWO_WIDE_FRACTION } from "./gameDay.js";
import {
  CIRCLE_DIAMETER,
  FOUR_WIDE_MIN_NUDGE,
  FOUR_WIDE_OFFSET_CAP,
  LABEL_FONT_SIZE,
  LABEL_LETTER_SPACING_EM,
  LABEL_WIDTH_GUARD,
  MIN_CIRCLE_GAP,
  SIDE_MARGIN,
  fitPlayerLabel,
  labelWidth,
  layoutFieldPlayers,
  roundLabelWidth,
  sideMarginForLine,
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
    if (group.length === 2) {
      const tol = Math.max(16, fieldWidth * 0.05);
      assert.ok(Math.abs(group[0].x - fieldWidth / 3) <= tol, `left third ${group[0].x}`);
      assert.ok(Math.abs(group[group.length - 1].x - (2 * fieldWidth) / 3) <= tol, `right third ${group.at(-1).x}`);
      assert.ok(group[1].x > group[0].x);
      return;
    }
    assert.ok(Math.abs(group[0].x - inset) < 0.6, `left edge ${group[0].x}`);
    assert.ok(Math.abs(group[group.length - 1].x - (fieldWidth - inset)) < 0.6, `right edge ${group.at(-1).x}`);
    for (let i = 1; i < group.length; i++) {
      assert.ok(group[i].x > group[i - 1].x);
    }
  });
}

test("label width includes letter-spacing and only rounds up", () => {
  const gap = labelWidth("AA") - labelWidth("A");
  assert.ok(gap >= 7, `letter-spacing gap ${gap}`);
  assert.equal(LABEL_WIDTH_GUARD, 0);
  assert.equal(labelWidth("Sean Jones"), roundLabelWidth(labelWidth("Sean Jones")));
  assert.equal(roundLabelWidth(52), 52);
  assert.equal(roundLabelWidth(52.01), 53);
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

test("a narrow field shrinks the side margin so 4-wide circles keep a gap", () => {
  assert.ok(sideMarginForLine(4, 196) < SIDE_MARGIN);
  assert.ok(sideMarginForLine(4, 320) === SIDE_MARGIN);
  const phone = [196, 236, 266, 306];
  phone.forEach(fieldWidth => {
    const layout = layoutFieldPlayers(startersFor(["LD", "CD", "CD", "RD"]), {
      fieldWidth,
      fieldHeight: fieldWidth * 1.5,
    });
    assertNoOverlap(layout);
    assertInsideField(layout, fieldWidth, fieldWidth * 1.5);
    const xs = layout.map(spot => spot.x).sort((a, b) => a - b);
    for (let i = 1; i < xs.length; i++) {
      assert.ok(xs[i] - xs[i - 1] >= CIRCLE_DIAMETER + MIN_CIRCLE_GAP - 0.05, `${fieldWidth} gap`);
    }
  });
  const five = layoutFieldPlayers(startersFor(["LB", "CB", "CB", "CB", "RB"]), {
    fieldWidth: 236,
    fieldHeight: 354,
  });
  assertNoOverlap(five);
  const xs = five.map(spot => spot.x).sort((a, b) => a - b);
  for (let i = 1; i < xs.length; i++) {
    assert.ok(xs[i] - xs[i - 1] >= CIRCLE_DIAMETER - 0.05, "360px five-across");
  }
});

test("an outer label slides inward so a name like Wes Johnson stays whole", () => {
  const measure = (text) => (text === "Wes Johnson" ? 70 : labelWidth(text));
  const names = ["Wes Johnson", "Bo", "Al", "Ed"];
  const wide = layoutFieldPlayers(startersFor(["LD", "CD", "CD", "RD"], names), {
    fieldWidth: 266,
    fieldHeight: 399,
    measureLabel: measure,
  });
  const short = layoutFieldPlayers(startersFor(["LD", "CD", "CD", "RD"], ["Bo", "Al", "Ed", "Jo"]), {
    fieldWidth: 266,
    fieldHeight: 399,
    measureLabel: measure,
  });
  const left = wide.find(spot => spot.fullName === "Wes Johnson");
  assert.equal(left.label, "Wes Johnson");
  assert.equal(left.x, short[0].x);
  const center = left.labelBox.x + left.labelBox.width / 2;
  assert.ok(center > left.x + 0.5, `label center ${center} should sit inside of the circle ${left.x}`);
  assert.ok(left.labelBox.x >= -0.05);
  assertNoOverlap(wide);
  assertInsideField(wide, 266, 399);
});

test("a 2-wide line sits about a third of the way in and stays clear at 320", () => {
  assert.equal(TWO_WIDE_FRACTION, 1 / 3);
  [320, 390, 430, 770].forEach(fieldWidth => {
    const fieldHeight = fieldWidth * 1.5;
    const defense = layoutFieldPlayers(startersFor(["LD", "RD"]), { fieldWidth, fieldHeight })
      .sort((a, b) => a.x - b.x);
    assert.ok(Math.abs(defense[0].x - fieldWidth / 3) < 0.01, `def left ${defense[0].x}`);
    assert.ok(Math.abs(defense[1].x - (2 * fieldWidth) / 3) < 0.01, `def right ${defense[1].x}`);
    assertNoOverlap(defense);
    assertInsideField(defense, fieldWidth, fieldHeight);
    assertClearOfCenter(defense, fieldWidth, fieldHeight);
  });

  const fieldWidth = 320;
  const fieldHeight = 480;
  const mids = layoutFieldPlayers(startersFor(["LM", "RM"]), { fieldWidth, fieldHeight })
    .sort((a, b) => a.x - b.x);
  const tol = 16;
  assert.ok(Math.abs(mids[0].x - fieldWidth / 3) <= tol, `mid left ${mids[0].x}`);
  assert.ok(Math.abs(mids[1].x - (2 * fieldWidth) / 3) <= tol, `mid right ${mids[1].x}`);
  assert.ok(mids[0].x < fieldWidth / 3, "a narrow mid line stops before the center circle");
  assertNoOverlap(mids);
  assertInsideField(mids, fieldWidth, fieldHeight);
  assertClearOfCenter(mids, fieldWidth, fieldHeight);

  ["2-2-1", "2-1-2", "2-0-3", "1-3-1"].forEach(name => {
    const formation = FORMATION_TEMPLATES["6v6"].find(shape => shape.name === name);
    const layout = layoutFieldPlayers(startersFor(formation.slots), { fieldWidth, fieldHeight });
    assertNoOverlap(layout);
    assertInsideField(layout, fieldWidth, fieldHeight);
    assertClearOfCenter(layout.filter(spot => spot.lineCount === 2), fieldWidth, fieldHeight);
  });

  const classic = FORMATION_TEMPLATES["11v11"].find(shape => shape.name === "4-4-2");
  const eleven = layoutFieldPlayers(startersFor(classic.slots, [
    "Sam Keeper", "Blake Pete", "Jaxon Wells", "Wes Duda", "Trey Lazear",
    "Remi Brown", "Sean Jones", "Henry Davis", "Jude Garcia", "John Smith", "Max Cole",
  ]), { fieldWidth, fieldHeight });
  const strikers = eleven.filter(spot => spot.lineCount === 2).sort((a, b) => a.x - b.x);
  assert.deepEqual(strikers.map(spot => spot.pos), ["LF", "RF"]);
  assert.ok(Math.abs(strikers[0].x - fieldWidth / 3) < 0.01);
  assert.ok(Math.abs(strikers[1].x - (2 * fieldWidth) / 3) < 0.01);
  const banks = eleven.filter(spot => spot.lineCount === 4);
  assert.equal(banks.length, 8);
});

test("share and print use the same 2-wide spots and leave a 4-wide line on its markers", () => {
  const positions = ["GK", "LB", "CB", "CB", "RB", "LM", "CM", "CM", "RM", "LF", "RF"];
  const starters = startersFor(positions, [
    "Sam Keeper", "Blake Pete", "Jaxon Wells", "Wes Duda", "Trey Lazear",
    "Remi Brown", "Sean Jones", "Henry Davis", "Jude Garcia", "John Smith", "Max Cole",
  ]);
  const sheet = shareFieldSheet({ lineups: { 1: { starters, bench: [] } }, subMode: false, quarters: [1] });
  const drawn = sheet.quarters[0].starters;
  const counts = {};
  positions.forEach(pos => { counts[pos] = (counts[pos] || 0) + 1; });
  const seen = {};
  drawn.forEach(slot => {
    const indexAmongSame = seen[slot.pos] || 0;
    seen[slot.pos] = indexAmongSame + 1;
    const marker = fieldMarker(slot.pos, indexAmongSame, counts[slot.pos]);
    const rawX = Math.round(marker.x * 10) / 10;
    if (slot.pos === "LF" || slot.pos === "RF") {
      assert.notEqual(slot.x, rawX);
    } else {
      assert.equal(slot.x, rawX, slot.pos);
    }
  });
  const left = drawn.find(slot => slot.pos === "LF");
  const right = drawn.find(slot => slot.pos === "RF");
  assert.equal(left.x, 106.7);
  assert.equal(right.x, 213.3);
});

test("3-wide, 4-wide, and 5-wide output stays byte-identical to main", () => {
  const digest = createHash("sha256").update(unchangedLineSnapshot()).digest("hex");
  assert.equal(digest, "c32f836c6928a55b713c0161650b96b3525d8c739feaf72f79f1a7bb182fd484");
});

test("a 430px 4-5-1 midfield stays straight when the names fit", () => {
  const formation = FORMATION_TEMPLATES["11v11"].find(shape => shape.name === "4-5-1");
  const names = [
    "Sam Keeper", "Blake Pete", "Jaxon Wells", "Wes Duda", "Trey Lazear",
    "Remi Brown", "Sean Jones", "Henry Davis", "Jude Garcia", "John Smith", "Max Cole",
  ];
  const layout = layoutFieldPlayers(startersFor(formation.slots, names), {
    fieldWidth: 306,
    fieldHeight: 459,
  });
  const mids = layout.filter(spot => spot.line === "mid");
  assert.equal(mids.length, 5);
  assert.deepEqual(mids.map(spot => spot.dy), [0, 0, 0, 0, 0]);
  assertNoOverlap(layout);
});

const GOLD_NAMES = [
  "Blake Pete", "Jaxon Wells", "Wes Duda", "Trey Lazear", "Maddox Anderson",
  "Remi Brown", "Sean Jones", "Henry Davis", "Jude Garcia", "John Smith", "Max Cole",
];
const GOLD_WIDTHS = [196, 228, 236, 266, 298, 306, 320, 360, 390, 430, 520, 770];
const GOLD_LINES = {
  1: ["CF"],
  3: ["LD", "CD", "RD"],
  4: ["LD", "CD", "CD", "RD"],
  5: ["LB", "CB", "CB", "CB", "RB"],
};

function goldStarters(positions) {
  return positions.map((pos, i) => ({
    pos,
    player: { id: `p${i}`, name: GOLD_NAMES[i % GOLD_NAMES.length], number: String(i + 1) },
  }));
}

/** Layout bytes for every line that is not 2-wide, captured from main b094532. */
function unchangedLineSnapshot() {
  const parts = [];
  for (const count of [1, 3, 4, 5]) {
    for (const fieldWidth of GOLD_WIDTHS) {
      const layout = layoutFieldPlayers(goldStarters(GOLD_LINES[count]), {
        fieldWidth,
        fieldHeight: fieldWidth * 1.5,
      });
      parts.push(`${count}@${fieldWidth}:${JSON.stringify(layout)}`);
    }
  }
  const formations = Object.entries(FORMATION_TEMPLATES).flatMap(([format, list]) => (
    list.map(formation => ({ format, ...formation }))
  ));
  for (const formation of formations) {
    for (const fieldWidth of GOLD_WIDTHS) {
      const layout = layoutFieldPlayers(goldStarters(formation.slots), {
        fieldWidth,
        fieldHeight: fieldWidth * 1.5,
      });
      const kept = layout.filter(spot => spot.lineCount !== 2);
      parts.push(`${formation.format}:${formation.name}@${fieldWidth}:${JSON.stringify(kept)}`);
    }
  }
  return parts.join("\n");
}

function hitsDisc(box, disc) {
  const cx = Math.min(Math.max(disc.cx, box.x), box.x + box.width);
  const cy = Math.min(Math.max(disc.cy, box.y), box.y + box.height);
  return Math.hypot(cx - disc.cx, cy - disc.cy) < disc.r - 0.05;
}

function assertClearOfCenter(layout, fieldWidth, fieldHeight) {
  const disc = pitchCenterDisc(fieldWidth, fieldHeight);
  layout.forEach(spot => {
    assert.equal(hitsDisc(spot.circle, disc), false, `${spot.pos} circle meets the center circle`);
    if (spot.labelBox) {
      assert.equal(hitsDisc(spot.labelBox, disc), false, `${spot.pos} label meets the center circle`);
    }
  });
}

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
