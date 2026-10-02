import { useLayoutEffect, useRef, useState } from "react";
import { lineStopAtCircle } from "./gameDay.js";

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
    const x1 = a.left + a.width / 2 - box.left;
    const y1 = a.top + a.height / 2 - box.top;
    const cx = b.left + b.width / 2 - box.left;
    const cy = b.top + b.height / 2 - box.top;
    const end = lineStopAtCircle(x1, y1, cx, cy, Math.min(b.width, b.height) / 2);
    return {
      key: `${pair.inId}-${pair.outId}`,
      x1: Math.round(x1),
      y1: Math.round(y1),
      x2: Math.round(end.x),
      y2: Math.round(end.y),
    };
  }).filter(Boolean);
}

function sameLines(prev, next) {
  return prev.length === next.length && prev.every((line, i) =>
    line.key === next[i].key && line.x1 === next[i].x1 && line.y1 === next[i].y1 && line.x2 === next[i].x2 && line.y2 === next[i].y2
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
    const measure = () => {
      const next = readSubLines(root, shownPairs || []);
      setSubLines(prev => (sameLines(prev, next) ? prev : next));
    };
    measure();
    window.addEventListener("resize", measure);
    const observer = typeof ResizeObserver === "function" ? new ResizeObserver(measure) : null;
    observer?.observe(root);
    return () => {
      window.removeEventListener("resize", measure);
      observer?.disconnect();
    };
  }, [pairKey, lineupKey, quarter, swapSel, fieldLayout]);
  return subLines;
}
