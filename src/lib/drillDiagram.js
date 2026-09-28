/** Pure geometry for printable drill diagrams. Coordinates in the seed are 0–100. */

export const DIAGRAM_VIEW = { w: 320, h: 220 };

export const SHEET_CHROME = "U8 Passers · 10 players · Head Coach Lazear; Assistant Coach Jared Calhoun";

const LOCKED_FIELDS = [
  "number",
  "name",
  "block",
  "time_block",
  "purpose",
  "setup",
  "diagram",
  "diagram_credit",
  "how_to_run",
  "coaching_points",
  "progressions",
  "common_mistakes",
  "legend",
];

export function diagramPoint(entity, view = DIAGRAM_VIEW) {
  const x = Number(entity?.x);
  const y = Number(entity?.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return { x: (x / 100) * view.w, y: (y / 100) * view.h };
}

export function playerById(diagram, id) {
  return (diagram?.players || []).find(player => player && player.id === id) || null;
}

export function strokeStyle(type) {
  if (type === "pass") return { dash: "8 6", width: 2.4, arrow: true, wavy: false };
  if (type === "dribble") return { dash: null, width: 2.2, arrow: false, wavy: true };
  return { dash: null, width: 2.4, arrow: true, wavy: false };
}

function moveAlong(origin, toward, distance) {
  const dx = toward.x - origin.x;
  const dy = toward.y - origin.y;
  const len = Math.hypot(dx, dy) || 1;
  return { x: origin.x + (dx / len) * distance, y: origin.y + (dy / len) * distance };
}

export function trimEnds(points, startPad, endPad) {
  if (!points || points.length < 2) return points || [];
  const start = moveAlong(points[0], points[1], startPad);
  const end = moveAlong(points[points.length - 1], points[points.length - 2], endPad);
  return [start, ...points.slice(1, -1), end];
}

export function squiggleBetween(a, b, waves = 5, amp = 7) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const points = [a];
  for (let i = 1; i < waves; i++) {
    const t = i / waves;
    const sign = i % 2 === 0 ? 1 : -1;
    points.push({
      x: a.x + dx * t + nx * amp * sign,
      y: a.y + dy * t + ny * amp * sign,
    });
  }
  points.push(b);
  return points;
}

function squiggleAround(point) {
  return [
    { x: point.x - 22, y: point.y + 10 },
    { x: point.x - 8, y: point.y - 12 },
    { x: point.x + 8, y: point.y + 8 },
    { x: point.x + 22, y: point.y - 6 },
  ];
}

export function strokePoints(diagram, stroke, view = DIAGRAM_VIEW) {
  if (Array.isArray(stroke?.path) && stroke.path.length) {
    return stroke.path
      .map(pair => diagramPoint({ x: pair?.[0], y: pair?.[1] }, view))
      .filter(Boolean);
  }
  const from = diagramPoint(playerById(diagram, stroke?.from), view);
  const to = diagramPoint(playerById(diagram, stroke?.to), view);
  if (!from) return [];
  if (stroke?.type === "dribble" && (!to || stroke.from === stroke.to)) return squiggleAround(from);
  if (!to) return [];
  if (stroke?.type === "dribble") return squiggleBetween(from, to);
  return [from, to];
}

export function pathFromPoints(points) {
  if (!points?.length) return "";
  return points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(" ");
}

export function distanceAnchor(diagram, distance, view = DIAGRAM_VIEW) {
  const from = diagramPoint(playerById(diagram, distance?.from), view);
  const to = diagramPoint(playerById(diagram, distance?.to), view);
  if (!from || !to) return null;
  const mx = (from.x + to.x) / 2;
  const my = (from.y + to.y) / 2;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  const lift = 16;
  return {
    x: mx + (-dy / len) * lift,
    y: my + (dx / len) * lift,
    label: distance.label || "",
  };
}

export function ballAnchor(diagram, view = DIAGRAM_VIEW) {
  const player = playerById(diagram, diagram?.ballAt);
  const point = diagramPoint(player, view);
  if (!point) return null;
  return { x: point.x + 12, y: point.y + 14 };
}

export function buildDiagramModel(diagram, options = {}) {
  const view = options.view || DIAGRAM_VIEW;
  const mini = !!options.mini;
  const players = (diagram?.players || []).map(player => {
    const point = diagramPoint(player, view);
    return point ? { id: player.id, label: player.label || player.id, x: point.x, y: point.y } : null;
  }).filter(Boolean);
  const cones = (diagram?.cones || []).map(cone => {
    const point = diagramPoint(cone, view);
    return point ? { x: point.x, y: point.y } : null;
  }).filter(Boolean);
  const strokes = (diagram?.strokes || []).map((stroke, index) => {
    let points = strokePoints(diagram, stroke, view);
    if (points.length >= 2 && stroke?.type !== "dribble") points = trimEnds(points, 18, 20);
    return {
      id: `${stroke?.type || "run"}-${index}`,
      type: stroke?.type || "run",
      style: strokeStyle(stroke?.type),
      points,
      d: pathFromPoints(points),
    };
  }).filter(stroke => stroke.points.length >= 2);
  const distances = mini
    ? []
    : (diagram?.distances || []).map(distance => distanceAnchor(diagram, distance, view)).filter(Boolean);
  return {
    view,
    players,
    cones,
    strokes,
    distances,
    ball: ballAnchor(diagram, view),
  };
}

export function progressionGroups(progressions) {
  const source = progressions || {};
  const asList = value => (Array.isArray(value) ? value.filter(Boolean) : value ? [value] : []);
  return [
    { key: "easier", title: "Easier", items: asList(source.easier) },
    { key: "harder", title: "Harder", items: asList(source.harder) },
    { key: "fewer_players", title: "Fewer players", items: asList(source.fewer_players) },
  ];
}

export function drillHasLockedSchema(drill) {
  if (!drill || typeof drill !== "object") return false;
  return LOCKED_FIELDS.every(field => Object.prototype.hasOwnProperty.call(drill, field));
}
