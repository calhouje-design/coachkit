import "./domSetup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { act, createElement, useLayoutEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { FORMATION_TEMPLATES, reshapeLineup } from "./formations.js";
import { CIRCLE_DIAMETER, layoutFieldPlayers } from "./fieldLayout.js";
import { lineStopAtCircle, pairsForDisplay, planBenchRotation, routeClearOfObstacles, scheduleHalfRotation } from "./gameDay.js";
import { PITCH_LAYER, subLineCacheKey, usePitchSubLines, useReportFieldLayout } from "./pitchSubLines.js";

const h = createElement;

function roster(count) {
  const positions = ["GK", "LD", "RD", "LM", "RM", "CM", "CF", "LF", "RF", "LB", "RB", "CDM", "CAM", "LW", "RW"];
  return Array.from({ length: count }, (_, i) => ({
    id: `p${i + 1}`,
    name: `P${i + 1}`,
    positions,
  }));
}

function slotsNamed(format, name) {
  return FORMATION_TEMPLATES[format].find(shape => shape.name === name).slots;
}

function planAt(slots) {
  const planned = scheduleHalfRotation(roster(9), slots, { minHalves: 4, seed: 1 });
  const lineup = planned.lineups[1];
  const pairs = pairsForDisplay(planBenchRotation(lineup, { nextLineup: planned.lineups[2] }), [], lineup);
  return { lineup, pairs };
}

function Bench({ pairs }) {
  return h("div", null, pairs.map((pair, i) => h("span", {
    key: pair.inId,
    "data-sub-from": pair.inId,
    style: { position: "absolute", left: "4px", top: `${20 + i * 36}px`, width: "8px", height: "8px" },
  })));
}

function Field({ lineup, fieldWidth, onLayout }) {
  const rootRef = useRef(null);
  const [placed, setPlaced] = useState([]);
  const slotKey = (lineup?.starters || []).map(slot => `${slot.pos}:${slot.player?.id || ""}`).join("|");
  useReportFieldLayout(rootRef, placed, onLayout);
  useLayoutEffect(() => {
    const el = rootRef.current;
    if (!el || !lineup) {
      setPlaced(prev => (prev.length ? [] : prev));
      return;
    }
    const height = Math.round(fieldWidth * 1.5);
    Object.defineProperty(el, "clientWidth", { configurable: true, get: () => fieldWidth });
    Object.defineProperty(el, "clientHeight", { configurable: true, get: () => height });
    setPlaced(layoutFieldPlayers(lineup.starters || [], { fieldWidth, fieldHeight: height }));
  }, [lineup, slotKey, fieldWidth]);
  return h("div", { ref: rootRef, style: { position: "relative" } }, (lineup?.starters || []).map((slot, idx) => {
    const spot = placed[idx];
    if (!spot || !slot.player) return null;
    return h("div", {
      key: slot.player.id,
      style: {
        position: "absolute",
        left: `${spot.x}px`,
        top: `${spot.y - 23}px`,
        width: "46px",
        height: "46px",
      },
    }, h("div", {
      "data-sub-to": slot.player.id,
      style: { width: "46px", height: "46px" },
    }));
  }));
}

function Harness({ lineup, pairs, fieldWidth }) {
  const pitchRef = useRef(null);
  const [fieldLayout, setFieldLayout] = useState("");
  const lineupKey = (lineup?.starters || []).map(slot => `${slot.pos}:${slot.player?.id || ""}`).join(",");
  const lines = usePitchSubLines(pitchRef, {
    shownPairs: pairs,
    lineupKey,
    quarter: 1,
    swapSel: null,
    fieldLayout,
  });
  return h("div", {
    ref: pitchRef,
    "data-pitch": "1",
    style: { position: "relative", width: `${fieldWidth}px`, height: "800px" },
  },
  h("div", {
    "data-sub-lines": "",
    "data-hold": lines.holding ? "1" : "0",
    style: { visibility: lines.holding ? "hidden" : "visible" },
  }),
  h(Bench, { pairs }),
  h(Field, { lineup, fieldWidth, onLayout: setFieldLayout }),
  lines.map(line => h("div", {
    key: line.key,
    "data-sub-line": line.key,
    "data-x2": String(line.x2),
    "data-y2": String(line.y2),
  })));
}

function assertLinesOnCircles(host, pairs) {
  const pitch = host.querySelector("[data-pitch]");
  const box = pitch.getBoundingClientRect();
  const lines = [...host.querySelectorAll("[data-sub-line]")];
  assert.equal(lines.length, pairs.length, `expected ${pairs.length} sub lines`);
  pairs.forEach(pair => {
    const line = host.querySelector(`[data-sub-line="${pair.inId}-${pair.outId}"]`);
    const circle = host.querySelector(`[data-sub-to="${pair.outId}"]`);
    assert.ok(line, `missing line for ${pair.outId}`);
    assert.ok(circle, `missing circle for ${pair.outId}`);
    const bounds = circle.getBoundingClientRect();
    const cx = bounds.left + bounds.width / 2 - box.left;
    const cy = bounds.top + bounds.height / 2 - box.top;
    const x2 = Number(line.getAttribute("data-x2"));
    const y2 = Number(line.getAttribute("data-y2"));
    const dist = Math.hypot(x2 - cx, y2 - cy);
    const radius = Math.min(bounds.width, bounds.height) / 2;
    assert.ok(Math.abs(dist - radius) <= 4, `${pair.outId} line ends ${dist.toFixed(1)}px from the circle center, radius ${radius}`);
  });
}

async function renderPitch(props) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => { root.render(h(Harness, props)); });
  return {
    host,
    async rerender(next) { await act(async () => { root.render(h(Harness, next)); }); },
    async unmount() {
      await act(async () => { root.unmount(); });
      host.remove();
    },
  };
}

for (const fieldWidth of [390, 430]) {
  test(`a 6v6 plan draws every sub line on its circle at ${fieldWidth}px`, async () => {
    const { lineup, pairs } = planAt(slotsNamed("6v6", "2-2-1"));
    assert.equal(pairs.length, 3);
    const view = await renderPitch({ lineup, pairs, fieldWidth });
    try {
      assertLinesOnCircles(view.host, pairs);
    } finally {
      await view.unmount();
    }
  });

  test(`an 8v8 plan draws its sub line on the circle at ${fieldWidth}px`, async () => {
    const { lineup, pairs } = planAt(slotsNamed("8v8", "3-3-1"));
    assert.equal(pairs.length, 1);
    const view = await renderPitch({ lineup, pairs, fieldWidth });
    try {
      assertLinesOnCircles(view.host, pairs);
    } finally {
      await view.unmount();
    }
  });

  test(`switching 6v6 to 2-1-2 keeps every sub line on a circle at ${fieldWidth}px`, async () => {
    const { lineup, pairs } = planAt(slotsNamed("6v6", "2-2-1"));
    const view = await renderPitch({ lineup, pairs, fieldWidth });
    try {
      assertLinesOnCircles(view.host, pairs);
      const reshaped = reshapeLineup(lineup, slotsNamed("6v6", "2-1-2"));
      const nextPairs = pairsForDisplay(planBenchRotation(reshaped, { nextLineup: lineup }), [], reshaped);
      assert.equal(nextPairs.length, 3);
      await view.rerender({ lineup: reshaped, pairs: nextPairs, fieldWidth });
      assertLinesOnCircles(view.host, nextPairs);
    } finally {
      await view.unmount();
    }
  });
}

test("a pitch resize remeasures sub lines without a window resize", async () => {
  const fieldWidth = 390;
  const { lineup, pairs } = planAt(slotsNamed("6v6", "2-2-1"));
  const view = await renderPitch({ lineup, pairs, fieldWidth });
  try {
    const pair = pairs[0];
    const line = view.host.querySelector(`[data-sub-line="${pair.inId}-${pair.outId}"]`);
    const before = Number(line.getAttribute("data-x2"));
    const circle = view.host.querySelector(`[data-sub-to="${pair.outId}"]`);
    circle.parentElement.style.left = `${parseFloat(circle.parentElement.style.left) + 36}px`;
    const live = globalThis.__resizeObservers.filter(observer => !observer.disconnected);
    assert.ok(live.length > 0);
    await act(async () => {
      live.forEach(observer => observer.callback());
      await new Promise(resolve => requestAnimationFrame(resolve));
    });
    const after = Number(view.host.querySelector(`[data-sub-line="${pair.inId}-${pair.outId}"]`).getAttribute("data-x2"));
    assert.ok(Math.abs(after - before - 36) <= 4, `line moved ${after - before}px`);
  } finally {
    await view.unmount();
  }
});

test("a name-label resize changes the sub-line cache key", () => {
  const host = document.createElement("div");
  host.style.width = "320px";
  host.style.height = "480px";
  const dot = document.createElement("span");
  dot.setAttribute("data-sub-from", "in");
  dot.style.left = "4px";
  dot.style.top = "20px";
  dot.style.width = "8px";
  dot.style.height = "8px";
  const circle = document.createElement("span");
  circle.setAttribute("data-sub-to", "out");
  circle.style.left = "140px";
  circle.style.top = "180px";
  circle.style.width = "46px";
  circle.style.height = "46px";
  const label = document.createElement("span");
  label.setAttribute("title", "Dee");
  label.style.left = "120px";
  label.style.top = "228px";
  label.style.width = "48px";
  label.style.height = "13px";
  host.append(dot, circle, label);
  document.body.appendChild(host);
  const pairs = [{ inId: "in", outId: "out" }];
  const before = subLineCacheKey(host, pairs);
  label.style.width = "72px";
  const after = subLineCacheKey(host, pairs);
  host.remove();
  assert.notEqual(before, after);
});

test("a window resize hides sub lines until the next frame", async () => {
  const fieldWidth = 390;
  const { lineup, pairs } = planAt(slotsNamed("6v6", "2-2-1"));
  const view = await renderPitch({ lineup, pairs, fieldWidth });
  try {
    const layer = () => view.host.querySelector("[data-sub-lines]");
    assert.equal(layer().getAttribute("data-hold"), "0");
    assert.equal(layer().style.visibility, "visible");
    await act(async () => {
      window.dispatchEvent(new window.Event("resize"));
    });
    assert.equal(layer().getAttribute("data-hold"), "1");
    assert.equal(layer().style.visibility, "hidden");
    await act(async () => {
      await new Promise(resolve => requestAnimationFrame(resolve));
    });
    assert.equal(layer().getAttribute("data-hold"), "0");
    assert.equal(layer().style.visibility, "visible");
    assert.equal(view.host.querySelectorAll("[data-sub-line]").length, pairs.length);
  } finally {
    await view.unmount();
  }
});

function longRoster() {
  const positions = ["GK", "LB", "CB", "RB", "LM", "CM", "RM", "LF", "RF", "CF", "CDM", "CAM"];
  const names = [
    "Christopher Montgomery", "Alexander Richardson", "Benjamin Harrington",
    "Nathaniel Pemberton", "Sebastian Callahan", "Maximilian Holloway",
    "Christopher Ellington", "Alexander Pembroke", "Benjamin Sutterfield",
    "Nathaniel Broderick", "Sebastian Langford", "Maximilian Cartwright",
    "Christopher Delaney", "Alexander Forsythe", "Benjamin Aldridge",
    "Nathaniel Kingsley",
  ];
  return names.map((name, i) => ({ id: `p${i + 1}`, name, number: String(i + 1), positions }));
}

function segmentHitsRect(from, to, rect) {
  const len = Math.hypot(to.x - from.x, to.y - from.y);
  const steps = Math.max(1, Math.ceil(len / 2));
  for (let step = 0; step <= steps; step += 1) {
    const t = step / steps;
    const x = from.x + (to.x - from.x) * t;
    const y = from.y + (to.y - from.y) * t;
    if (x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h) return true;
  }
  return false;
}

test("11v11 numbers and names are not covered by a line drawn above them", () => {
  assert.ok(PITCH_LAYER.marker > PITCH_LAYER.line);
  const app = readFileSync(new URL("../App.jsx", import.meta.url), "utf8");
  assert.match(app, /zIndex:PITCH_LAYER\.line/);
  assert.match(app, /PITCH_LAYER\.marker/);
  assert.match(app, /data-sub-lines=""/);
  assert.match(app, /data-player-marker=""/);
  assert.match(app, /data-jersey=""/);
  assert.equal(app.includes("zIndex:13"), false);
  assert.match(app, /pointerEvents:"none"/);
  const fieldWidth = 196;
  const fieldHeight = 294;
  const fieldX = 82;
  const fieldY = 8;
  const players = longRoster();
  for (const name of ["4-4-2", "4-5-1", "5-3-2"]) {
    const slots = slotsNamed("11v11", name);
    const planned = scheduleHalfRotation(players, slots, { minHalves: 4, seed: 1 });
    const lineup = planned.lineups[1];
    const pairs = pairsForDisplay(planBenchRotation(lineup, { nextLineup: planned.lineups[2] }), [], lineup);
    assert.ok(pairs.length >= 1, `${name} has no sub pairs`);
    const layout = layoutFieldPlayers(lineup.starters, { fieldWidth, fieldHeight });
    const bounds = { x: fieldX, y: fieldY, w: fieldWidth, h: fieldHeight };
    pairs.forEach((pair, index) => {
      const starter = lineup.starters.find(slot => slot.player?.id === pair.outId);
      const spot = layout.find(item => item.pos === starter.pos && item.fullName === starter.player.name);
      assert.ok(spot, `${name} missing ${pair.outId}`);
      const dot = { x: 72, y: 36 + index * 48 };
      const center = { x: fieldX + spot.x, y: fieldY + spot.y };
      const end = lineStopAtCircle(dot.x, dot.y, center.x, center.y, CIRCLE_DIAMETER / 2);
      const obstacles = [];
      layout.forEach(other => {
        if (other !== spot) obstacles.push({ cx: fieldX + other.x, cy: fieldY + other.y, r: CIRCLE_DIAMETER / 2 });
        if (other.labelBox) {
          obstacles.push({
            x: fieldX + other.labelBox.x,
            y: fieldY + other.labelBox.y,
            w: other.labelBox.width,
            h: other.labelBox.height,
          });
        }
      });
      const routed = routeClearOfObstacles(dot.x, dot.y, end.x, end.y, obstacles, 3, {
        bounds,
        bench: { x: 0, y: 0, w: fieldX, h: fieldY + fieldHeight },
        badge: {
          x: fieldX + (12 / 320) * fieldWidth,
          y: fieldY + (12 / 480) * fieldHeight,
          w: (62 / 320) * fieldWidth,
          h: (34 / 480) * fieldHeight,
        },
      });
      assert.ok(routed.length <= 4, `${name} bends ${routed.length - 2}`);
      const boxes = [{
        x: spot.x - 8,
        y: spot.y - 9,
        w: 16,
        h: 9,
        kind: "number",
        who: spot.pos,
      }];
      if (spot.labelBox) boxes.push({ ...spot.labelBox, kind: "name", who: spot.pos });
      layout.forEach(other => {
        if (other === spot) return;
        boxes.push({ x: other.x - 8, y: other.y - 9, w: 16, h: 9, kind: "number", who: other.pos });
        if (other.labelBox) boxes.push({ ...other.labelBox, kind: "name", who: other.pos });
      });
      for (let i = 1; i < routed.length; i += 1) {
        const from = { x: routed[i - 1].x - fieldX, y: routed[i - 1].y - fieldY };
        const to = { x: routed[i].x - fieldX, y: routed[i].y - fieldY };
        boxes.forEach(box => {
          if (!segmentHitsRect(from, to, box)) return;
          assert.ok(
            PITCH_LAYER.line < PITCH_LAYER.marker,
            `${name} ${box.kind} ${box.who} is covered by a line drawn above it`,
          );
        });
      }
    });
  }
});

test("Game Day reports the field layout into the sub-line measure", () => {
  const app = readFileSync(new URL("../App.jsx", import.meta.url), "utf8");
  const measure = readFileSync(new URL("./pitchSubLines.js", import.meta.url), "utf8");
  assert.match(app, /useReportFieldLayout\(rootRef, placed, onLayout\)/);
  assert.match(app, /usePitchSubLines\(pitchWrapRef/);
  assert.match(app, /onLayout=\{setFieldLayout\}/);
  assert.match(measure, /new ResizeObserver\(measure\)/);
  assert.match(measure, /observer\?\.observe\(root\)/);
  assert.match(measure, /addEventListener\("orientationchange", onViewport\)/);
});
