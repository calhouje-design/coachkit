import "./domSetup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { act, createElement, useLayoutEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { FORMATION_TEMPLATES, reshapeLineup } from "./formations.js";
import { CIRCLE_DIAMETER, layoutFieldPlayers } from "./fieldLayout.js";
import { pairsForDisplay, planBenchRotation, scheduleHalfRotation } from "./gameDay.js";
import { endDotOnTarget, subLineCacheKey, usePitchSubLines, useReportFieldLayout } from "./pitchSubLines.js";

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

function Harness({ lineup, pairs, fieldWidth, markField = false }) {
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
  markField ? h("div", {
    "data-pitch-svg": "",
    style: { width: `${fieldWidth}px`, height: `${fieldWidth * 1.5}px` },
  }) : null,
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
    "data-elevated": line.elevated ? "1" : "0",
    "data-end-clear": line.endClear === false ? "0" : "1",
    "data-target": line.targetId || "",
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

test("a window resize that does not move the field leaves the lines up", async () => {
  const fieldWidth = 390;
  const { lineup, pairs } = planAt(slotsNamed("6v6", "2-2-1"));
  const view = await renderPitch({ lineup, pairs, fieldWidth, markField: true });
  try {
    const layer = () => view.host.querySelector("[data-sub-lines]");
    const pitch = view.host.querySelector("[data-pitch]");
    assert.equal(layer().getAttribute("data-hold"), "0");
    pitch.style.height = "900px";
    await act(async () => {
      window.dispatchEvent(new window.Event("resize"));
    });
    assert.equal(layer().getAttribute("data-hold"), "0");
    assert.equal(layer().style.visibility, "visible");
    await act(async () => {
      window.dispatchEvent(new window.Event("resize"));
      await new Promise(resolve => requestAnimationFrame(resolve));
    });
    assert.equal(layer().getAttribute("data-hold"), "0");
    assert.equal(view.host.querySelectorAll("[data-sub-line]").length, pairs.length);
  } finally {
    await view.unmount();
  }
});

test("a field resize hides sub lines until the next frame", async () => {
  const fieldWidth = 390;
  const { lineup, pairs } = planAt(slotsNamed("6v6", "2-2-1"));
  const view = await renderPitch({ lineup, pairs, fieldWidth });
  try {
    const layer = () => view.host.querySelector("[data-sub-lines]");
    const pitch = view.host.querySelector("[data-pitch]");
    const svg = document.createElement("div");
    svg.setAttribute("data-pitch-svg", "");
    svg.style.width = "390px";
    svg.style.height = "585px";
    pitch.appendChild(svg);
    assert.equal(layer().getAttribute("data-hold"), "0");
    svg.style.width = "320px";
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
  } finally {
    await view.unmount();
  }
});

test("rotation hides sub lines until the next frame", async () => {
  const fieldWidth = 390;
  const { lineup, pairs } = planAt(slotsNamed("6v6", "2-2-1"));
  const view = await renderPitch({ lineup, pairs, fieldWidth });
  try {
    const layer = () => view.host.querySelector("[data-sub-lines]");
    assert.equal(layer().getAttribute("data-hold"), "0");
    await act(async () => {
      window.dispatchEvent(new window.Event("orientationchange"));
    });
    assert.equal(layer().getAttribute("data-hold"), "1");
    assert.equal(layer().style.visibility, "hidden");
    await act(async () => {
      await new Promise(resolve => requestAnimationFrame(resolve));
    });
    assert.equal(layer().getAttribute("data-hold"), "0");
    assert.equal(view.host.querySelectorAll("[data-sub-line]").length, pairs.length);
  } finally {
    await view.unmount();
  }
});

const LONG_NAMES = [
  "Christopher Montgomery", "Alexander Richardson", "Benjamin Harrington",
  "Nathaniel Pemberton", "Sebastian Callahan", "Maximilian Holloway",
  "Christopher Ellington", "Alexander Pembroke", "Benjamin Sutterfield",
  "Nathaniel Broderick", "Sebastian Langford", "Maximilian Cartwright",
  "Christopher Delaney", "Alexander Forsythe", "Benjamin Aldridge",
  "Nathaniel Kingsley",
];

function longRoster() {
  const positions = ["GK", "LB", "CB", "RB", "LM", "CM", "RM", "LF", "RF", "CF"];
  return LONG_NAMES.map((name, index) => ({
    id: `p${index + 1}`,
    name,
    number: String(index + 1),
    positions,
  }));
}

function planLong(shape) {
  const slots = slotsNamed("11v11", shape);
  const planned = scheduleHalfRotation(longRoster(), slots, {
    minHalves: 4,
    totalQuarters: 4,
    seed: 1,
    rate: () => 1,
  });
  const lineup = planned.lineups[1];
  const pairs = pairsForDisplay(planBenchRotation(lineup, { nextLineup: planned.lineups[2] }), [], lineup);
  return { lineup, pairs };
}

test("a seam end dot leaves the neighbour and stays on the target rim", () => {
  const radius = 23;
  const cx = 60.5;
  const cy = 120;
  const others = [{ cx: 23, cy: 120, r: radius }, { cx: 98, cy: 120, r: radius }];
  const facingX = cx - radius;
  const insideLeft = Math.hypot(facingX - 23, 0) < radius;
  assert.equal(insideLeft, true);
  const dot = endDotOnTarget(cx, cy, radius, facingX - 30, cy, others);
  assert.equal(dot.clear, true);
  assert.ok(Math.abs(Math.hypot(dot.x - cx, dot.y - cy) - radius) < 0.05);
  others.forEach(other => {
    assert.ok(Math.hypot(dot.x - other.cx, dot.y - other.cy) >= other.r - 0.05);
  });
  const buried = endDotOnTarget(0, 0, radius, -40, 0, [{ cx: 0, cy: 0, r: 80 }]);
  assert.equal(buried.clear, false);
  assert.ok(Math.abs(Math.hypot(buried.x, buried.y) - radius) < 0.05);
});

for (const fieldWidth of [196, 266]) {
  for (const shape of FORMATION_TEMPLATES["11v11"]) {
    test(`end dots at field ${fieldWidth} stay outside neighbouring circles in ${shape.name}`, () => {
      const { lineup } = planLong(shape.name);
      const placed = layoutFieldPlayers(lineup.starters, {
        fieldWidth,
        fieldHeight: Math.round(fieldWidth * 1.5),
      });
      const radius = CIRCLE_DIAMETER / 2;
      placed.forEach((spot, idx) => {
        if (!spot) return;
        const others = placed.flatMap((other, j) => (
          other && j !== idx ? [{ cx: other.x, cy: other.y, r: radius }] : []
        ));
        const dot = endDotOnTarget(spot.x, spot.y, radius, 4, spot.y, others);
        const rim = Math.abs(Math.hypot(dot.x - spot.x, dot.y - spot.y) - radius);
        assert.ok(rim < 0.2, `${shape.name} ${lineup.starters[idx].pos} left the rim by ${rim.toFixed(2)}`);
        if (!dot.clear) return;
        others.forEach(other => {
          const gap = Math.hypot(dot.x - other.cx, dot.y - other.cy) - other.r;
          assert.ok(gap >= -0.05, `${shape.name} ${lineup.starters[idx].pos} sits ${(-gap).toFixed(1)}px inside a neighbour`);
        });
      });
    });

    test(`routed end dots at field ${fieldWidth} miss neighbouring circles in ${shape.name}`, async () => {
      const { lineup, pairs } = planLong(shape.name);
      const view = await renderPitch({ lineup, pairs, fieldWidth });
      try {
        const pitch = view.host.querySelector("[data-pitch]");
        const box = pitch.getBoundingClientRect();
        const circles = [...view.host.querySelectorAll("[data-sub-to]")].map(node => {
          const bounds = node.getBoundingClientRect();
          return {
            id: node.getAttribute("data-sub-to"),
            cx: bounds.left + bounds.width / 2 - box.left,
            cy: bounds.top + bounds.height / 2 - box.top,
            r: Math.min(bounds.width, bounds.height) / 2,
          };
        });
        const dots = [...view.host.querySelectorAll("[data-sub-line][data-elevated='1']")];
        dots.forEach(line => {
          const x2 = Number(line.getAttribute("data-x2"));
          const y2 = Number(line.getAttribute("data-y2"));
          const target = circles.find(circle => circle.id === line.getAttribute("data-target"));
          assert.ok(target, "elevated line names its target");
          const rim = Math.abs(Math.hypot(x2 - target.cx, y2 - target.cy) - target.r);
          assert.ok(rim <= 1.5, `${shape.name} end is ${rim.toFixed(1)}px off the target rim`);
          const inside = circles.filter(circle => (
            circle.id !== target.id && Math.hypot(x2 - circle.cx, y2 - circle.cy) < circle.r - 0.4
          ));
          if (line.getAttribute("data-end-clear") === "0") return;
          assert.equal(inside.length, 0, `${shape.name} dot for ${target.id} is inside ${inside.length} neighbour(s)`);
        });
      } finally {
        await view.unmount();
      }
    });
  }
}

test("Game Day reports the field layout into the sub-line measure", () => {
  const app = readFileSync(new URL("../App.jsx", import.meta.url), "utf8");
  const measure = readFileSync(new URL("./pitchSubLines.js", import.meta.url), "utf8");
  assert.match(app, /useReportFieldLayout\(rootRef, placed, onLayout\)/);
  assert.match(app, /usePitchSubLines\(pitchWrapRef/);
  assert.match(app, /onLayout=\{setFieldLayout\}/);
  assert.match(measure, /new ResizeObserver\(measure\)/);
  assert.match(measure, /observer\?\.observe\(root\)/);
  assert.match(measure, /addEventListener\("orientationchange", onRotate\)/);
});
