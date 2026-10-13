import { useLayoutEffect, useRef, useState } from "react";
import { lineStopAtCircle } from "./gameDay.js";

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

/** Dashed sub lines from the bench dots to the field circles currently in the pitch. */
export function readSubLines(root, pairs) {
  if (!root) return [];
  const box = root.getBoundingClientRect();
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
    const radius = Math.min(b.width, b.height) / 2;
    const end = lineStopAtCircle(x1, y1, cx, cy, radius);
    const x2 = Math.round(end.x);
    const y2 = Math.round(end.y);
    return {
      key: `${pair.inId}-${pair.outId}`,
      targetId: pair.outId,
      x1,
      y1,
      x2,
      y2,
      targetX: roundTenth(cx),
      targetY: roundTenth(cy),
      targetR: roundTenth(radius),
      endClear: true,
      points: [{ x: x1, y: y1 }, { x: x2, y: y2 }],
      elevated: false,
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
    && !!line.elevated === !!next[i].elevated && line.endClear !== false === (next[i].endClear !== false)
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

function fieldRectKey(live) {
  const node = live.querySelector("[data-pitch-svg]") || live;
  const box = node.getBoundingClientRect();
  const scrollX = window.scrollX || window.pageXOffset || 0;
  const scrollY = window.scrollY || window.pageYOffset || 0;
  return [
    Math.round(box.left + scrollX),
    Math.round(box.top + scrollY),
    Math.round(box.width),
    Math.round(box.height),
  ].join(",");
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
    let lastRect = fieldRectKey(root);
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
      // The field can move during the hidden frame. The next resize should
      // compare against where it landed, not where it was when the hide started.
      lastRect = fieldRectKey(live);
      const measured = readSubLinesCached(live, shownPairs || []);
      setSubLines(prev => {
        if (sameLines(prev, measured) && !prev.holding) return prev;
        const next = measured.slice();
        next.holding = false;
        return next;
      });
    };
    // Resize bursts share one frame. The first measure stays synchronous.
    // Hide the previous frame only when the field's page position or size
    // changes. Scroll updates the viewport rect without moving the field on
    // the page, so a toolbar resize during scroll does not hide the lines.
    // Rotation still hides immediately.
    const concealIfFieldMoved = (live) => {
      const next = fieldRectKey(live);
      if (next === lastRect) return;
      lastRect = next;
      concealNow(live);
    };
    const measure = () => {
      const live = pitchWrapRef.current;
      if (live) concealIfFieldMoved(live);
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
      if (live && fieldRectKey(live) === lastRect) return;
      measure();
    };
    const onRotate = () => {
      const live = pitchWrapRef.current;
      if (live) concealNow(live);
      measure();
    };
    apply();
    window.addEventListener("resize", onViewport);
    window.addEventListener("orientationchange", onRotate);
    const observer = typeof ResizeObserver === "function" ? new ResizeObserver(measure) : null;
    observer?.observe(root);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener("resize", onViewport);
      window.removeEventListener("orientationchange", onRotate);
      observer?.disconnect();
    };
  }, [pairKey, lineupKey, quarter, swapSel, fieldLayout]);
  // The hide writes visibility onto the element. If the re-show is the same
  // React update as the last visible render, the prop does not change and
  // React leaves the direct write in place. Put it back when the lines are
  // not being held. Do not do this inside apply(); that paints stale frames.
  useLayoutEffect(() => {
    if (subLines.holding) return;
    pitchWrapRef.current?.querySelectorAll("[data-sub-lines]").forEach(node => { node.style.visibility = "visible"; });
  }, [subLines]);
  return subLines;
}
