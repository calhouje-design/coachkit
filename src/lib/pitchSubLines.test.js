import "./domSetup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { act, createElement, useLayoutEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { FORMATION_TEMPLATES, reshapeLineup } from "./formations.js";
import { layoutFieldPlayers } from "./fieldLayout.js";
import { pairsForDisplay, planBenchRotation, scheduleHalfRotation } from "./gameDay.js";
import { usePitchSubLines, useReportFieldLayout } from "./pitchSubLines.js";

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
    await act(async () => { live.forEach(observer => observer.callback()); });
    const after = Number(view.host.querySelector(`[data-sub-line="${pair.inId}-${pair.outId}"]`).getAttribute("data-x2"));
    assert.ok(Math.abs(after - before - 36) <= 4, `line moved ${after - before}px`);
  } finally {
    await view.unmount();
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
});
