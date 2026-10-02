import { fieldMarker, lineBand, pitchCenterDisc, twoWideCenters } from "./gameDay.js";

export { lineBand };

/** Circle drawn on the Game Day field. Fixed CSS pixels, not a share of the pitch. */
export const CIRCLE_DIAMETER = 46;
export const LABEL_HEIGHT = 13;
export const LABEL_GAP = 2;
export const BOX_GAP = 2;
export const SIDE_MARGIN = 8;
/** Smallest gap between circles once the side margin has shrunk to make room. */
export const MIN_CIRCLE_GAP = 4;
/** 5-wide alternate stagger, used only when the names do not fit. */
export const LINE_STAGGER = 16;
/** Each side of a 4-wide line when even spacing already clears the labels. */
export const FOUR_WIDE_MIN_NUDGE = 2;
/** Largest outside-to-center gap on a 4-wide line. Well under one circle radius. */
export const FOUR_WIDE_OFFSET_CAP = 8;

const CHAR_W = {
  A: 6.5, B: 6.02, C: 6.5, D: 6.5, E: 6.02, F: 5.5, G: 7.02, H: 7.02, I: 3.52, J: 4.5,
  K: 7.02, L: 6.02, M: 8.5, N: 6.5, O: 7.02, P: 5.5, Q: 7.02, R: 6.5, S: 5.02, T: 6.02,
  U: 6.5, V: 6.5, W: 9, X: 6.5, Y: 6.5, Z: 6.02,
  a: 4.5, b: 5.02, c: 4, d: 5.02, e: 4, f: 3, g: 4.5, h: 5.02, i: 2.52, j: 3, k: 5.02,
  l: 2.52, m: 7.5, n: 5.02, o: 4.5, p: 5.02, q: 5.02, r: 4, s: 3.52, t: 3, u: 5.02,
  v: 4.5, w: 6.5, x: 4.5, y: 4.5, z: 4,
  " ": 2.25, ".": 2.25, "'": 2.52, "-": 3, "…": 6.5,
};

/** Matches the name label drawn on the circle. */
export const LABEL_FONT_SIZE = 9;
export const LABEL_LETTER_SPACING_EM = 0.02;
/**
 * Extra pixels added on top of the measured width.
 * A flat pad shortens names that actually fit, so this stays at 0.
 * Callers round with ceil instead, which covers a fraction of a pixel.
 */
export const LABEL_WIDTH_GUARD = 0;

/** Ceil a measured label width. A value that is already a whole pixel stays put. */
export function roundLabelWidth(px) {
  const n = Number(px);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.ceil(n - 1e-9);
}

/** Outer width of a 9px bold name label, including padding and letter-spacing. */
export function labelWidth(text) {
  const value = String(text || "");
  let width = 8;
  let count = 0;
  for (const ch of value) {
    width += CHAR_W[ch] ?? 9;
    count += 1;
  }
  if (count > 1) width += LABEL_LETTER_SPACING_EM * LABEL_FONT_SIZE * (count - 1);
  return roundLabelWidth(width);
}

/**
 * Preferred side margin, shrunk on a narrow field so this many circles
 * still have a small gap. Never goes negative. A line that cannot fit
 * even at the edge keeps a margin of 0.
 */
export function sideMarginForLine(count, fieldWidth, {
  circle = CIRCLE_DIAMETER,
  minGap = MIN_CIRCLE_GAP,
  preferred = SIDE_MARGIN,
} = {}) {
  const n = Math.max(0, count);
  const width = Math.max(0, Number(fieldWidth) || 0);
  if (n <= 1) return preferred;
  const needed = n * circle + (n - 1) * minGap;
  const room = (width - needed) / 2;
  if (room >= preferred) return preferred;
  return Math.max(0, room);
}

/** Hidden probe that uses the same font rules as the rendered name. */
export function labelProbeCss(fontFamily) {
  const family = fontFamily || "Georgia, serif";
  return `position:absolute;visibility:hidden;white-space:nowrap;pointer-events:none;font-family:${family};font-size:${LABEL_FONT_SIZE}px;font-weight:800;line-height:1.2;letter-spacing:${LABEL_LETTER_SPACING_EM}em;padding:1px 4px;`;
}

/** Shorten a name so it fits maxWidth. Full text stays available to the caller. */
export function fitPlayerLabel(name, maxWidth, measure = labelWidth) {
  const full = String(name || "").replace(/\s+/g, " ").trim();
  if (!full) return "";
  const cap = Math.max(0, maxWidth);
  if (measure(full) <= cap) return full;
  const parts = full.split(" ");
  if (parts.length >= 2 && parts[parts.length - 1][0]) {
    const short = `${parts[0]} ${parts[parts.length - 1][0]}.`;
    if (measure(short) <= cap) return short;
  }
  let shown = full;
  while (shown.length > 1 && measure(`${shown}…`) > cap) shown = shown.slice(0, -1);
  const withEllipsis = `${shown}…`;
  if (measure(withEllipsis) <= cap) return withEllipsis;
  return full[0];
}

export function lineCenters(count, fieldWidth, {
  circle = CIRCLE_DIAMETER,
  sideMargin = SIDE_MARGIN,
} = {}) {
  const n = Math.max(0, count);
  if (!n) return [];
  if (n === 1) return [fieldWidth / 2];
  const inset = sideMargin + circle / 2;
  const span = Math.max(0, fieldWidth - inset * 2);
  const step = span / (n - 1);
  return Array.from({ length: n }, (_, i) => inset + step * i);
}

function overlaps(a, b, gap = 0) {
  return a.x < b.x + b.width + gap
    && a.x + a.width + gap > b.x
    && a.y < b.y + b.height + gap
    && a.y + a.height + gap > b.y;
}

function verticalOverlap(top, height, otherTop, otherHeight, gap) {
  return top < otherTop + otherHeight + gap && top + height + gap > otherTop;
}

function staggerFor(count, amount, needed) {
  if (!needed || amount <= 0) return Array.from({ length: count }, () => 0);
  if (count >= 5) return Array.from({ length: count }, (_, i) => (i % 2 === 1 ? -amount : 0));
  return Array.from({ length: count }, () => 0);
}

/**
 * Even spacing first. Shorten a name that does not fit that slot, then use
 * the smallest outside-up / center-down nudge that still clears the boxes.
 * A line that already clears only moves a few pixels.
 */
function fourWideDy(group, xs, lineY, { width, circle, labelHeight, labelGap, boxGap, measureLabel }) {
  const straight = group.map((item, i) => ({ ...item, x: xs[i], y: lineY, fieldWidth: width }));
  const caps = maxWidths(straight, { width, circle, labelHeight, labelGap, boxGap });
  const boxes = group.map((item, i) => {
    const label = fitPlayerLabel(item.name, caps[i], measureLabel);
    const measured = label ? measureLabel(label) : 0;
    return Math.min(measured, Math.max(0, caps[i]));
  });
  let crowded = false;
  for (let i = 0; i < boxes.length - 1; i++) {
    const gap = xs[i + 1] - xs[i] - boxes[i] / 2 - boxes[i + 1] / 2;
    if (gap < boxGap - 0.01) crowded = true;
  }
  const wanted = crowded ? labelHeight + boxGap : FOUR_WIDE_MIN_NUDGE * 2;
  const separation = Math.min(FOUR_WIDE_OFFSET_CAP, wanted);
  const nudge = separation / 2;
  return [-nudge, nudge, nudge, -nudge];
}

function markerRects(item, circle, labelGap, labelHeight) {
  const circleBox = {
    x: item.x - circle / 2,
    y: item.y - circle / 2,
    width: circle,
    height: circle,
  };
  if (!item.label || !(item.labelBoxWidth > 0)) {
    return { circle: circleBox, labelBox: null };
  }
  const width = item.labelBoxWidth;
  let left = Number.isFinite(item.labelLeft) ? item.labelLeft : item.x - width / 2;
  if (left < 0) left = 0;
  if (left + width > item.fieldWidth) left = Math.max(0, item.fieldWidth - width);
  return {
    circle: circleBox,
    labelBox: {
      x: left,
      y: item.y + circle / 2 + labelGap,
      width,
      height: labelHeight,
    },
  };
}

/**
 * An outermost name that does not fit while centered may slide toward
 * the middle of the field. Circles stay put. The label stays inside the
 * field and clear of a neighbor label or circle.
 */
function widenOuterLabels(items, { width, height, circle, labelHeight, labelGap, boxGap, measureLabel, guardCenter = false, onlyCount = 0 }) {
  items.forEach((item, index) => {
    if (onlyCount && item.lineCount !== onlyCount) return;
    if (!item.name || item.label === item.name) return;
    if (item.lineCount < 2) return;
    if (item.lineIndex !== 0 && item.lineIndex !== item.lineCount - 1) return;
    const fullWidth = measureLabel(item.name);
    if (!(fullWidth > 0)) return;
    const span = outerLabelSpan(item, items, { width, height, circle, labelHeight, labelGap, boxGap, guardCenter });
    if (!span || fullWidth > span.hi - span.lo + 0.01) return;
    let labelLeft = item.x - fullWidth / 2;
    if (labelLeft < span.lo) labelLeft = span.lo;
    if (labelLeft + fullWidth > span.hi) labelLeft = span.hi - fullWidth;
    if (labelLeft < span.lo - 0.01) return;
    const trial = items.map((other, i) => (i === index ? {
      ...other,
      label: other.name,
      labelBoxWidth: fullWidth,
      labelLeft,
      fieldWidth: width,
    } : other));
    if (collidingLabelIndexes(trial, circle, labelGap, labelHeight, boxGap).has(index)) return;
    item.label = item.name;
    item.labelBoxWidth = fullWidth;
    item.labelLeft = labelLeft;
  });
}

function outerLabelSpan(item, items, { width, height, circle, labelHeight, labelGap, boxGap, guardCenter = false }) {
  const leftOuter = item.lineIndex === 0;
  let lo = 0;
  let hi = width;
  const top = item.y + circle / 2 + labelGap;
  items.forEach(other => {
    if (other === item) return;
    const drawn = markerRects({ ...other, fieldWidth: width }, circle, labelGap, labelHeight);
    if (drawn.labelBox && verticalOverlap(top, labelHeight, drawn.labelBox.y, drawn.labelBox.height, boxGap)) {
      if (leftOuter) hi = Math.min(hi, drawn.labelBox.x - boxGap);
      else lo = Math.max(lo, drawn.labelBox.x + drawn.labelBox.width + boxGap);
    }
    if (verticalOverlap(top, labelHeight, drawn.circle.y, drawn.circle.height, 0)) {
      if (leftOuter) hi = Math.min(hi, drawn.circle.x - boxGap);
      else lo = Math.max(lo, drawn.circle.x + drawn.circle.width + boxGap);
    }
  });
  if (guardCenter) {
    const block = centerLabelBlock(item, { width, height, circle, labelHeight, labelGap, boxGap });
    if (block) {
      if (leftOuter) hi = Math.min(hi, block.lo);
      else lo = Math.max(lo, block.hi);
    }
  }
  if (hi - lo < 1) return null;
  return { lo, hi };
}

/**
 * Spread each horizontal line across the field and keep circles and name
 * labels from overlapping. A line of exactly two sits about a third of the
 * way in from each sideline, stopping short of the center circle. A 4-wide
 * line stays nearly straight: even spacing first, then the smallest
 * outside-up / center-down nudge that clears the labels. A 5-wide line
 * staggers alternate players only when the names do not fit. Long names
 * shorten to a first name and last initial, then an ellipsis, before that
 * nudge grows.
 */
export function layoutFieldPlayers(starters, {
  fieldWidth,
  fieldHeight,
  measureLabel = labelWidth,
  circle = CIRCLE_DIAMETER,
  labelHeight = LABEL_HEIGHT,
  labelGap = LABEL_GAP,
  boxGap = BOX_GAP,
  sideMargin = SIDE_MARGIN,
  stagger = LINE_STAGGER,
} = {}) {
  const width = Math.max(0, Number(fieldWidth) || 0);
  const height = Math.max(0, Number(fieldHeight) || 0);
  const slots = starters || [];
  const counts = {};
  slots.forEach(slot => { counts[slot?.pos] = (counts[slot?.pos] || 0) + 1; });
  const seen = {};
  const items = slots.map((slot, index) => {
    const pos = slot?.pos || "";
    const indexAmongSame = seen[pos] || 0;
    seen[pos] = indexAmongSame + 1;
    const marker = fieldMarker(pos, indexAmongSame, counts[pos] || 1);
    const name = String(slot?.player?.name || slot?.name || "").trim();
    return {
      index,
      pos,
      name,
      band: lineBand(pos),
      sortX: marker.x,
      baseY: (marker.y / 480) * height,
    };
  });

  const groups = new Map();
  items.forEach(item => {
    if (!groups.has(item.band)) groups.set(item.band, []);
    groups.get(item.band).push(item);
  });

  groups.forEach(group => {
    group.sort((a, b) => a.sortX - b.sortX || a.index - b.index);
    const ys = group.map(item => item.baseY);
    const lineY = ys.reduce((sum, y) => sum + y, 0) / ys.length;
    const margin = sideMarginForLine(group.length, width, { circle, preferred: sideMargin });
    const xs = lineCenters(group.length, width, { circle, sideMargin: margin });
    let offsets;
    if (group.length === 4) {
      offsets = fourWideDy(group, xs, lineY, {
        width, circle, labelHeight, labelGap, boxGap, measureLabel,
      });
    } else {
      const unstaggered = maxWidths(group.map((item, i) => ({ ...item, x: xs[i], y: lineY })), {
        width, circle, labelHeight, labelGap, boxGap,
      });
      const needed = group.some((item, i) => item.name && measureLabel(item.name) > unstaggered[i] + 0.01);
      offsets = staggerFor(group.length, stagger, needed);
    }
    group.forEach((item, i) => {
      item.x = xs[i];
      item.lineIndex = i;
      item.lineCount = group.length;
      item.dy = offsets[i];
      const minY = circle / 2;
      const maxY = height - circle / 2 - labelGap - labelHeight;
      let y = lineY + offsets[i];
      if (Number.isFinite(maxY) && maxY >= minY) y = Math.min(maxY, Math.max(minY, y));
      else y = Math.max(minY, y);
      item.y = y;
    });
  });

  liftLabelsOffCircles(items, { circle, labelHeight, labelGap, boxGap });
  let caps = maxWidths(items, { width, height, circle, labelHeight, labelGap, boxGap });
  for (let pass = 0; pass < 4; pass++) {
    items.forEach((item, i) => {
      item.fieldWidth = width;
      item.labelLeft = null;
      item.label = fitPlayerLabel(item.name, caps[i], measureLabel);
      const measured = item.label ? measureLabel(item.label) : 0;
      item.labelBoxWidth = Math.min(measured, Math.max(0, caps[i]));
    });
    widenOuterLabels(items, { width, height, circle, labelHeight, labelGap, boxGap, measureLabel });
    const crowded = collidingLabelIndexes(items, circle, labelGap, labelHeight, boxGap);
    if (!crowded.size) break;
    caps = caps.map((cap, i) => (crowded.has(i) ? Math.max(0, cap - 4) : cap));
  }
  pullTwoWideInward(items, { width, height, circle, labelHeight, labelGap, boxGap, measureLabel });

  return items.map(item => {
    const rects = markerRects(item, circle, labelGap, labelHeight);
    return {
      index: item.index,
      pos: item.pos,
      x: item.x,
      y: item.y,
      line: item.band,
      lineIndex: item.lineIndex,
      lineCount: item.lineCount,
      dy: item.dy,
      fullName: item.name,
      label: item.label,
      circle: rects.circle,
      labelBox: rects.labelBox,
    };
  });
}

/**
 * A fixed-size label can meet the next line's circle on a short field.
 * Shift the whole line up by the same amount so a stagger stays intact.
 * Same-line neighbors are left to the width cap; lifting them one by one
 * pulls a staggered row apart.
 */
function liftLabelsOffCircles(items, { circle, labelHeight, labelGap, boxGap, lineCount = null }) {
  const minY = circle / 2;
  const reach = circle / 2 + 48;
  const bands = new Map();
  items.forEach(item => {
    if (!bands.has(item.band)) bands.set(item.band, []);
    bands.get(item.band).push(item);
  });
  const ordered = [...bands.values()].sort((a, b) => {
    const mid = group => group.reduce((sum, item) => sum + item.y, 0) / group.length;
    return mid(b) - mid(a);
  });
  ordered.forEach(group => {
    if (lineCount != null && group[0]?.lineCount !== lineCount) return;
    let lift = 0;
    group.forEach(item => {
      items.forEach(other => {
        if (other.band === item.band || other.y <= item.y) return;
        if (Math.abs(item.x - other.x) >= reach) return;
        const labelBottom = item.y + circle / 2 + labelGap + labelHeight;
        const circleTop = other.y - circle / 2;
        lift = Math.max(lift, labelBottom + boxGap - circleTop);
      });
    });
    if (lift <= 0) return;
    const room = Math.min(...group.map(item => item.y - minY));
    const applied = Math.min(lift, Math.max(0, room));
    group.forEach(item => { item.y -= applied; });
  });
}

function placeTwoWideXs(items, width, height, circle, boxGap) {
  const groups = new Map();
  items.forEach(item => {
    if (item.lineCount !== 2) return;
    if (!groups.has(item.band)) groups.set(item.band, []);
    groups.get(item.band).push(item);
  });
  groups.forEach(group => {
    group.sort((a, b) => a.lineIndex - b.lineIndex);
    const lineY = group.reduce((sum, item) => sum + item.y, 0) / group.length;
    const [left, right] = twoWideCenters(width, height, lineY, { circle, gap: boxGap });
    group[0].x = left;
    group[1].x = right;
  });
}

/**
 * Move a finished 2-player line inward. Other lines are already laid out,
 * and this pass does not write their x, y, or labels.
 */
function pullTwoWideInward(items, { width, height, circle, labelHeight, labelGap, boxGap, measureLabel }) {
  if (!items.some(item => item.lineCount === 2)) return;
  placeTwoWideXs(items, width, height, circle, boxGap);
  liftLabelsOffCircles(items, { circle, labelHeight, labelGap, boxGap, lineCount: 2 });
  placeTwoWideXs(items, width, height, circle, boxGap);
  let caps = maxWidths(items, { width, height, circle, labelHeight, labelGap, boxGap, guardCenter: true });
  for (let pass = 0; pass < 4; pass++) {
    items.forEach((item, i) => {
      if (item.lineCount !== 2) return;
      item.fieldWidth = width;
      item.labelLeft = null;
      item.label = fitPlayerLabel(item.name, caps[i], measureLabel);
      const measured = item.label ? measureLabel(item.label) : 0;
      item.labelBoxWidth = Math.min(measured, Math.max(0, caps[i]));
    });
    widenOuterLabels(items, {
      width, height, circle, labelHeight, labelGap, boxGap, measureLabel,
      guardCenter: true,
      onlyCount: 2,
    });
    const crowded = collidingLabelIndexes(items, circle, labelGap, labelHeight, boxGap);
    if (![...crowded].some(i => items[i].lineCount === 2)) break;
    caps = caps.map((cap, i) => (
      items[i].lineCount === 2 && crowded.has(i) ? Math.max(0, cap - 4) : cap
    ));
  }
}

/** X range where a name under this circle would enter the center circle. */
function centerLabelBlock(item, { width, height, circle, labelHeight, labelGap, boxGap }) {
  if (item.lineCount !== 2) return null;
  const mark = pitchCenterDisc(width, height);
  const top = item.y + circle / 2 + labelGap;
  const bottom = top + labelHeight;
  const radius = mark.r + boxGap;
  if (!(radius > 0)) return null;
  const yNear = Math.min(Math.max(mark.cy, top), bottom);
  const dy = yNear - mark.cy;
  if (Math.abs(dy) >= radius) return null;
  const half = Math.sqrt(Math.max(0, radius * radius - dy * dy));
  return { lo: mark.cx - half, hi: mark.cx + half };
}

function maxWidths(items, { width, height, circle, labelHeight, labelGap, boxGap, guardCenter = false }) {
  return items.map((item, i) => {
    let maxW = Math.min(item.x * 2, (width - item.x) * 2) - 1;
    const top = item.y + circle / 2 + labelGap;
    items.forEach((other, j) => {
      if (i === j) return;
      const dx = Math.abs(item.x - other.x);
      const otherTop = other.y + circle / 2 + labelGap;
      if (verticalOverlap(top, labelHeight, otherTop, labelHeight, boxGap)) {
        maxW = Math.min(maxW, dx - boxGap);
      }
      const circleTop = other.y - circle / 2;
      if (verticalOverlap(top, labelHeight, circleTop, circle, 0)) {
        maxW = Math.min(maxW, 2 * (dx - circle / 2 - boxGap));
      }
    });
    const block = guardCenter
      ? centerLabelBlock(item, { width, height, circle, labelHeight, labelGap, boxGap })
      : null;
    if (block) {
      if (item.x <= block.lo) maxW = Math.min(maxW, Math.max(0, (block.lo - item.x) * 2));
      else if (item.x >= block.hi) maxW = Math.min(maxW, Math.max(0, (item.x - block.hi) * 2));
      else maxW = 0;
    }
    return Math.max(0, maxW);
  });
}

function collidingLabelIndexes(items, circle, labelGap, labelHeight, boxGap) {
  const rects = [];
  items.forEach((item, i) => {
    const drawn = markerRects(item, circle, labelGap, labelHeight);
    rects.push({ i, kind: "circle", ...drawn.circle });
    if (drawn.labelBox) rects.push({ i, kind: "label", ...drawn.labelBox });
  });
  const bad = new Set();
  for (let a = 0; a < rects.length; a++) {
    for (let b = a + 1; b < rects.length; b++) {
      if (rects[a].i === rects[b].i) continue;
      if (!overlaps(rects[a], rects[b], 0)) continue;
      if (rects[a].kind === "label") bad.add(rects[a].i);
      if (rects[b].kind === "label") bad.add(rects[b].i);
    }
  }
  return bad;
}
