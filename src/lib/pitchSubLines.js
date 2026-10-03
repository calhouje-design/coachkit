import { useLayoutEffect, useRef, useState } from "react";
import { lineStopAtCircle, routeClearOfObstacles } from "./gameDay.js";

/** Sub lines paint under player markers. Markers stay tappable; lines do not take hits. */
export const PITCH_LAYER = { line: 1, marker: 6 };

/** Circle positions plus the field size. A change means the sub lines should be measured again. */
export function fieldLayoutSignature(placed, fieldWidth, fieldHeight) {
  const spots = (placed || []).map(spot => (
    spot ? `${Math.round(spot.x)},${Math.round(spot.y)}` : "-"
  )).join("|");
  return `${Math.round(fieldWidth) || 0}x${Math.round(fieldHeight) || 0}:${spots}`;
}

function cssEscape(value) {
  const text = String(value);
  if (typeof window !== "undefined" && window.CSS && CSS.escape) return CSS.escape(text);
  return text;
}

function roundTenth(value) {
  return Math.round(value * 10) / 10;
}

/** Circles and name boxes a sub line has to miss. The target circle is the endpoint, so it is left out. */
function subLineObstacles(root, box, targetId) {
  return [...root.querySelectorAll("[data-sub-to]")].flatMap(node => {
    const id = node.getAttribute("data-sub-to");
    const bounds = node.getBoundingClientRect();
    const obstacles = [];
    if (id !== targetId) {
      obstacles.push({
        cx: bounds.left + bounds.width / 2 - box.left,
        cy: bounds.top + bounds.height / 2 - box.top,
        r: Math.min(bounds.width, bounds.height) / 2,
      });
    }
    const label = node.parentElement?.querySelector("[title]");
    if (!label) return obstacles;
    const labelBox = label.getBoundingClientRect();
    if (labelBox.width > 0 && labelBox.height > 0) {
      obstacles.push({
        x: labelBox.left - box.left,
        y: labelBox.top - box.top,
        w: labelBox.width,
        h: labelBox.height,
      });
    }
    return obstacles;
  });
}

function benchDots(root, box, exceptId) {
  return [...root.querySelectorAll("[data-sub-from]")].flatMap(node => {
    if (node.getAttribute("data-sub-from") === exceptId) return [];
    const bounds = node.getBoundingClientRect();
    if (!(bounds.width > 0) || !(bounds.height > 0)) return [];
    return [{
      x: bounds.left + bounds.width / 2 - box.left,
      y: bounds.top + bounds.height / 2 - box.top,
    }];
  });
}

function guideRect(node, box) {
  if (!node) return null;
  const bounds = node.getBoundingClientRect();
  if (!(bounds.width > 0) || !(bounds.height > 0)) return null;
  return {
    x: bounds.left - box.left,
    y: bounds.top - box.top,
    w: bounds.width,
    h: bounds.height,
  };
}

/** Field rect, the quarter badge, and the bench column, in pitch-wrap coordinates. */
function pitchGuides(root, box) {
  const bounds = guideRect(root.querySelector("[data-pitch-svg]"), box);
  let badge = null;
  if (bounds) {
    const sx = bounds.w / 320;
    const sy = bounds.h / 480;
    badge = { x: bounds.x + 12 * sx, y: bounds.y + 12 * sy, w: 62 * sx, h: 34 * sy };
  }
  return { bounds, badge, bench: guideRect(root.querySelector("[data-bench-column]"), box) };
}

/** Dashed sub lines from the bench dots to the field circles currently in the pitch. */
export function readSubLines(root, pairs) {
  if (!root) return [];
  const box = root.getBoundingClientRect();
  const guides = pitchGuides(root, box);
  const drawn = [];
  return (pairs || []).map(pair => {
    const from = root.querySelector(`[data-sub-from="${cssEscape(pair.inId)}"]`);
    const to = root.querySelector(`[data-sub-to="${cssEscape(pair.outId)}"]`);
    if (!from || !to) return null;
    const a = from.getBoundingClientRect();
    const b = to.getBoundingClientRect();
    const x1 = Math.round(a.left + a.width / 2 - box.left);
    const y1 = Math.round(a.top + a.height / 2 - box.top);
    const cx = b.left + b.width / 2 - box.left;
    const cy = b.top + b.height / 2 - box.top;
    const end = lineStopAtCircle(x1, y1, cx, cy, Math.min(b.width, b.height) / 2);
    const x2 = Math.round(end.x);
    const y2 = Math.round(end.y);
    const routed = routeClearOfObstacles(x1, y1, x2, y2, subLineObstacles(root, box, pair.outId), 3, {
      bounds: guides.bounds,
      badge: guides.badge,
      bench: guides.bench,
      lines: drawn,
      dots: benchDots(root, box, pair.inId),
    });
    const points = routed.map(point => ({ x: roundTenth(point.x), y: roundTenth(point.y) }));
    points[0] = { x: x1, y: y1 };
    points[points.length - 1] = { x: x2, y: y2 };
    drawn.push(points);
    return {
      key: `${pair.inId}-${pair.outId}`,
      x1,
      y1,
      x2,
      y2,
      points,
      elevated: !!routed.elevated,
    };
  }).filter(Boolean);
}

const subLineCache = new Map();

export function subLineCacheKey(root, pairs) {
  const box = root.getBoundingClientRect();
  const size = `${Math.round(box.width)}x${Math.round(box.height)}`;
  const spots = [...root.querySelectorAll("[data-sub-to], [data-sub-from]")].map(node => {
    const bounds = node.getBoundingClientRect();
    const id = node.getAttribute("data-sub-to") || node.getAttribute("data-sub-from");
    return `${id}:${Math.round(bounds.left - box.left)},${Math.round(bounds.top - box.top)},${Math.round(bounds.width)}`;
  }).sort().join(";");
  const pairKey = (pairs || []).map(pair => `${pair.inId}>${pair.outId}`).join("|");
  const labels = [...root.querySelectorAll("[title]")].map(node => {
    const bounds = node.getBoundingClientRect();
    return `${Math.round(bounds.left - box.left)},${Math.round(bounds.top - box.top)},${Math.round(bounds.width)},${Math.round(bounds.height)}`;
  }).sort().join(";");
  return `${size}|${pairKey}|${spots}|${labels}`;
}

function readSubLinesCached(root, pairs) {
  const key = subLineCacheKey(root, pairs);
  if (subLineCache.has(key)) return subLineCache.get(key);
  const next = readSubLines(root, pairs);
  subLineCache.set(key, next);
  if (subLineCache.size > 32) subLineCache.delete(subLineCache.keys().next().value);
  return next;
}

function samePoints(prev, next) {
  if (!prev || !next || prev.length !== next.length) return false;
  return prev.every((point, i) => point.x === next[i].x && point.y === next[i].y);
}

function sameLines(prev, next) {
  return prev.length === next.length && prev.every((line, i) =>
    line.key === next[i].key && line.x1 === next[i].x1 && line.y1 === next[i].y1 && line.x2 === next[i].x2 && line.y2 === next[i].y2
    && !!line.elevated === !!next[i].elevated
    && samePoints(line.points, next[i].points)
  );
}

/**
 * Tell the pitch when circles have been committed. Runs after `placed` is
 * rendered, so the parent can measure `[data-sub-to]` on the next pass.
 */
export function useReportFieldLayout(rootRef, placed, onLayout) {
  const onLayoutRef = useRef(onLayout);
  onLayoutRef.current = onLayout;
  const last = useRef("");
  useLayoutEffect(() => {
    const el = rootRef.current;
    const signature = fieldLayoutSignature(placed, el?.clientWidth || 0, el?.clientHeight || 0);
    if (signature === last.current) return;
    last.current = signature;
    onLayoutRef.current?.(signature);
  }, [placed]);
}

/** Measure sub lines after the field layout signature changes, and when the pitch box itself resizes. */
export function usePitchSubLines(pitchWrapRef, { shownPairs, lineupKey, quarter, swapSel, fieldLayout }) {
  const [subLines, setSubLines] = useState([]);
  const pairKey = (shownPairs || []).map(pair => `${pair.inId}>${pair.outId}`).join("|");
  useLayoutEffect(() => {
    const root = pitchWrapRef.current;
    if (!root) {
      setSubLines(prev => (prev.length ? [] : prev));
      return undefined;
    }
    let frame = 0;
    let queued = false;
    let lastSize = `${root.clientWidth}x${root.clientHeight}`;
    const concealNow = (live) => {
      live.querySelectorAll("[data-sub-lines]").forEach(node => {
        node.style.visibility = "hidden";
      });
      setSubLines(prev => {
        if (prev.holding) return prev;
        const next = prev.slice();
        next.holding = true;
        return next;
      });
    };
    const apply = () => {
      const live = pitchWrapRef.current;
      if (!live) return;
      const measured = readSubLinesCached(live, shownPairs || []);
      setSubLines(prev => {
        if (sameLines(prev, measured) && !prev.holding) return prev;
        const next = measured.slice();
        next.holding = false;
        return next;
      });
    };
    // Resize bursts (including the iOS toolbar) share one frame. The first
    // measure stays synchronous so the lines are present on the commit.
    // A real viewport change hides the previous frame immediately; the
    // observer still waits for the animation frame before drawing the new one.
    const measure = () => {
      const live = pitchWrapRef.current;
      if (live) {
        const size = `${live.clientWidth}x${live.clientHeight}`;
        if (size !== lastSize) {
          lastSize = size;
          concealNow(live);
        }
      }
      if (queued) return;
      queued = true;
      frame = requestAnimationFrame(() => {
        queued = false;
        frame = 0;
        apply();
      });
    };
    const onViewport = () => {
      const live = pitchWrapRef.current;
      if (live) concealNow(live);
      measure();
    };
    apply();
    window.addEventListener("resize", onViewport);
    window.addEventListener("orientationchange", onViewport);
    const observer = typeof ResizeObserver === "function" ? new ResizeObserver(measure) : null;
    observer?.observe(root);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener("resize", onViewport);
      window.removeEventListener("orientationchange", onViewport);
      observer?.disconnect();
    };
  }, [pairKey, lineupKey, quarter, swapSel, fieldLayout]);
  return subLines;
}
