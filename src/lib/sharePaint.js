import { lineStopAtCircle } from "./gameDay.js";

const Q_COLORS = {
  1: ["#f4c442", "#b87818"],
  2: ["#5dadec", "#2471a3"],
  3: ["#c88ce0", "#7d3c98"],
  4: ["#ec7063", "#a93226"],
};

function roundRect(ctx, x, y, w, h, r) {
  const radius = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function firstName(name) {
  return String(name || "").trim().split(/\s+/)[0] || "";
}

function fitCanvas(canvas, w, h) {
  const dpr = Math.max(2, (typeof window !== "undefined" && window.devicePixelRatio) || 1);
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  canvas.style.width = "100%";
  canvas.style.height = "auto";
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  return ctx;
}

export function downloadCanvas(canvas, filename) {
  if (!canvas) return;
  const link = document.createElement("a");
  link.download = filename;
  link.href = canvas.toDataURL("image/png");
  link.click();
}

function paintQuarterPanel(ctx, x, y, w, h, panel) {
  const benchW = 78;
  ctx.save();
  roundRect(ctx, x, y, w, h, 8);
  ctx.clip();

  ctx.fillStyle = "#10160e";
  ctx.fillRect(x, y, w, h);

  const pitchX = x + benchW;
  const pitchY = y + 4;
  const pitchW = w - benchW - 4;
  const pitchH = h - 8;
  const grass = ctx.createLinearGradient(pitchX, pitchY, pitchX, pitchY + pitchH);
  grass.addColorStop(0, "#1e4d1a");
  grass.addColorStop(0.5, "#1a4518");
  grass.addColorStop(1, "#163d13");
  ctx.fillStyle = grass;
  roundRect(ctx, pitchX, pitchY, pitchW, pitchH, 6);
  ctx.fill();
  ctx.save();
  roundRect(ctx, pitchX, pitchY, pitchW, pitchH, 6);
  ctx.clip();
  for (let stripe = 0; stripe < 8; stripe += 1) {
    if (stripe % 2 === 0) {
      ctx.fillStyle = "rgba(255,255,255,0.035)";
      ctx.fillRect(pitchX, pitchY + (pitchH / 8) * stripe, pitchW, pitchH / 8);
    }
  }
  ctx.restore();

  ctx.strokeStyle = "rgba(255,255,255,0.35)";
  ctx.lineWidth = 1.2;
  roundRect(ctx, pitchX, pitchY, pitchW, pitchH, 6);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(pitchX + 6, pitchY + pitchH / 2);
  ctx.lineTo(pitchX + pitchW - 6, pitchY + pitchH / 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(pitchX + pitchW / 2, pitchY + pitchH / 2, (42 / 320) * pitchW, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeRect(pitchX + pitchW * 0.28, pitchY + 6, pitchW * 0.44, pitchH * 0.14);
  ctx.strokeRect(pitchX + pitchW * 0.28, pitchY + pitchH * 0.86 - 6, pitchW * 0.44, pitchH * 0.14);

  const sx = vx => pitchX + (Number(vx) / 320) * pitchW;
  const sy = vy => pitchY + (Number(vy) / 480) * pitchH;
  const rim = (23 / 320) * pitchW;
  const starters = panel.starters || [];
  const bench = panel.bench || [];
  const starterById = {};
  starters.forEach(slot => {
    if (slot.id) starterById[slot.id] = slot;
  });
  const pairByIn = {};
  (panel.pairs || []).forEach(pair => {
    if (pair.inId) pairByIn[pair.inId] = pair;
  });

  const avail = h - 24;
  const gap = 4;
  const cardH = bench.length
    ? Math.max(26, Math.min(48, (avail - gap * Math.max(0, bench.length - 1)) / bench.length))
    : 0;
  const cards = bench.map((player, index) => ({
    player,
    cardY: y + 20 + index * (cardH + gap),
    cardH,
  }));

  const dotAt = (cardY) => ({ x: x + benchW - 12, y: cardY + 22 });

  ctx.fillStyle = "#141a12";
  ctx.fillRect(x, y, benchW, h);
  ctx.fillStyle = "#e8a020";
  ctx.font = "bold 9px Arial, sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillText("BENCH", x + 6, y + 13);
  if (!bench.length) {
    ctx.fillStyle = "#7a7570";
    ctx.font = "bold 9px Arial, sans-serif";
    ctx.fillText("All on", x + 6, y + 32);
  }
  cards.forEach(({ player, cardY, cardH: height }) => {
    const target = starterById[pairByIn[player.id]?.outId];
    ctx.fillStyle = "rgba(255,255,255,0.08)";
    roundRect(ctx, x + 4, cardY, benchW - 8, height, 4);
    ctx.fill();
    ctx.fillStyle = "#e8e4dc";
    ctx.font = "900 11px Arial, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(String(player.number ?? ""), x + 8, cardY + 13);
    ctx.font = "bold 9px Arial, sans-serif";
    ctx.fillText(firstName(player.name).slice(0, target ? 6 : 8), x + 8, cardY + 25);
    if (target) {
      ctx.fillStyle = "#2ecc71";
      ctx.font = "bold 8px Arial, sans-serif";
      ctx.fillText(`for ${firstName(target.name).slice(0, 7)}`, x + 8, cardY + height - 5);
    }
  });
  ctx.save();
  ctx.setLineDash([3, 3]);
  ctx.strokeStyle = "#2ecc71";
  ctx.lineWidth = 1.6;
  cards.forEach(({ player, cardY }) => {
    const target = starterById[pairByIn[player.id]?.outId];
    if (!target) return;
    const dot = dotAt(cardY);
    const stop = lineStopAtCircle(dot.x, dot.y, sx(target.x), sy(target.y), rim);
    ctx.beginPath();
    ctx.moveTo(dot.x, dot.y);
    ctx.lineTo(stop.x, stop.y);
    ctx.stroke();
  });
  ctx.restore();
  cards.forEach(({ player, cardY }) => {
    if (!starterById[pairByIn[player.id]?.outId]) return;
    const dot = dotAt(cardY);
    ctx.beginPath();
    ctx.fillStyle = "#2ecc71";
    ctx.arc(dot.x, dot.y, 3, 0, Math.PI * 2);
    ctx.fill();
  });

  const colors = Q_COLORS[panel.quarter] || Q_COLORS[1];
  const pill = ctx.createLinearGradient(pitchX + 6, pitchY + 6, pitchX + 6, pitchY + 26);
  pill.addColorStop(0, colors[0]);
  pill.addColorStop(1, colors[1]);
  ctx.fillStyle = pill;
  roundRect(ctx, pitchX + 6, pitchY + 6, 36, 18, 4);
  ctx.fill();
  ctx.fillStyle = "#0a0d0f";
  ctx.font = "900 11px Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(`Q${panel.quarter}`, pitchX + 24, pitchY + 15);

  if (!starters.length) {
    ctx.fillStyle = "rgba(255,255,255,0.4)";
    ctx.font = "bold 12px Arial, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("Not planned", pitchX + pitchW / 2, pitchY + pitchH / 2);
    ctx.restore();
    return;
  }

  starters.forEach(slot => {
    const px = sx(slot.x);
    const py = sy(slot.y);
    const grad = ctx.createRadialGradient(px - 4, py - 4, 1, px, py, rim);
    grad.addColorStop(0, "#f5c86a");
    grad.addColorStop(1, "#b87818");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(px, py, rim, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.9)";
    ctx.lineWidth = 1.4;
    ctx.stroke();
    ctx.fillStyle = "#1a1a1a";
    ctx.font = "900 10px Arial, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(slot.number || "?"), px, py - 4);
    ctx.fillStyle = "#2a1a0a";
    ctx.font = "900 8px Arial, sans-serif";
    ctx.fillText(slot.pos || "", px, py + 7);
    const label = firstName(slot.name).slice(0, 10);
    ctx.font = "bold 8px Arial, sans-serif";
    const nameW = Math.max(18, ctx.measureText(label).width + 8);
    ctx.fillStyle = "rgba(10,13,15,0.82)";
    roundRect(ctx, px - nameW / 2, py + rim + 2, nameW, 12, 3);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.textBaseline = "middle";
    ctx.fillText(label, px, py + rim + 8);
  });
  ctx.restore();
}

/** Sheet 1. Four field panels, each with its own bench and dotted sub lines. */
export function paintFieldSheet(canvas, { field, league, opponent, homeScore, awayScore } = {}) {
  if (!canvas) return;
  const W = 740;
  const pad = 10;
  const header = 86;
  const cellW = (W - pad * 3) / 2;
  const cellH = 430;
  const H = header + pad + cellH * 2 + 28;
  const ctx = fitCanvas(canvas, W, H);
  ctx.fillStyle = "#0c1409";
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "#1a2518";
  ctx.fillRect(0, 0, W, header);

  ctx.fillStyle = "#e8a020";
  ctx.beginPath();
  ctx.arc(28, 26, 14, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#0a0d0f";
  ctx.font = "900 11px Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("CK", 28, 26);

  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "#e8e4dc";
  ctx.font = "bold 16px Arial, sans-serif";
  ctx.fillText("CoachKit", 50, 22);
  ctx.fillStyle = "#a8a39e";
  ctx.font = "11px Arial, sans-serif";
  ctx.fillText("Field, bench, and sub lines · Q1–Q4", 50, 40);
  ctx.textAlign = "right";
  ctx.fillStyle = "#e8a020";
  ctx.font = "bold 12px Arial, sans-serif";
  ctx.fillText(league || "", W - 14, 22);
  ctx.fillStyle = "#a8a39e";
  ctx.font = "11px Arial, sans-serif";
  ctx.fillText(new Date().toLocaleDateString(), W - 14, 40);

  ctx.fillStyle = "rgba(232,160,32,0.12)";
  roundRect(ctx, 12, 50, W - 24, 26, 6);
  ctx.fill();
  ctx.textAlign = "center";
  ctx.fillStyle = "#e8e4dc";
  ctx.font = "bold 13px Arial, sans-serif";
  ctx.fillText(`US  ${homeScore ?? 0}  :  ${awayScore ?? 0}  ${(opponent || "THEM").toUpperCase()}`, W / 2, 68);

  const byQuarter = {};
  (field?.quarters || []).forEach(panel => {
    byQuarter[panel.quarter] = panel;
  });
  [[1, 0, 0], [2, 1, 0], [3, 0, 1], [4, 1, 1]].forEach(([quarter, col, row]) => {
    paintQuarterPanel(
      ctx,
      pad + col * (cellW + pad),
      header + pad + row * (cellH + pad),
      cellW,
      cellH,
      byQuarter[quarter] || { quarter, starters: [], bench: [], pairs: [] },
    );
  });

  ctx.fillStyle = "#666";
  ctx.font = "bold 10px Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillText(`CoachKit · ${league || "lineup"} · ${new Date().toLocaleDateString()}`, W / 2, H - 10);
}

function paintCell(ctx, x, y, w, h, cell) {
  const kind = cell?.kind || "unplanned";
  ctx.save();
  roundRect(ctx, x, y, w, h, 4);
  ctx.clip();
  if (kind === "full") {
    ctx.fillStyle = "#2ecc71";
    ctx.fillRect(x, y, w, h);
  } else if (kind === "partial-on") {
    ctx.fillStyle = "rgba(255,255,255,0.16)";
    ctx.fillRect(x, y, w * 0.46, h);
    ctx.fillStyle = "#2ecc71";
    ctx.fillRect(x + w * 0.46, y, w * 0.54, h);
  } else if (kind === "partial-off") {
    ctx.fillStyle = "#2ecc71";
    ctx.fillRect(x, y, w * 0.46, h);
    ctx.fillStyle = "rgba(255,255,255,0.12)";
    ctx.fillRect(x + w * 0.46, y, w * 0.54, h);
  } else if (kind === "bench") {
    ctx.fillStyle = "rgba(255,255,255,0.12)";
    ctx.fillRect(x, y, w, h);
  } else {
    ctx.fillStyle = "rgba(255,255,255,0.04)";
    ctx.fillRect(x, y, w, h);
  }
  ctx.restore();
  const label = kind === "full" || kind === "partial-on"
    ? (cell?.pos || "")
    : kind === "partial-off"
      ? "½"
      : kind === "unplanned"
        ? "?"
        : "";
  ctx.fillStyle = kind === "full" ? "#0a0d0f" : kind === "bench" || kind === "unplanned" ? "rgba(255,255,255,0.55)" : "#fff";
  ctx.font = "900 9px Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  if (label) ctx.fillText(label, x + w / 2, y + h / 2 + 0.5);
}

/** Sheet 2. Green, split, and bench bars for every active player. */
export function paintPlayTimeSheet(canvas, { playTime, league } = {}) {
  if (!canvas) return;
  const rows = playTime?.rows || [];
  const W = 640;
  const rowH = 46;
  const header = 108;
  const H = header + Math.max(1, rows.length) * rowH + 24;
  const ctx = fitCanvas(canvas, W, H);
  ctx.fillStyle = "#0c1409";
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "#1a2518";
  ctx.fillRect(0, 0, W, header);

  ctx.fillStyle = "#e8a020";
  ctx.beginPath();
  ctx.arc(28, 24, 14, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#0a0d0f";
  ctx.font = "900 11px Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("CK", 28, 24);
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "#e8e4dc";
  ctx.font = "bold 16px Arial, sans-serif";
  ctx.fillText("Play time", 50, 20);
  ctx.fillStyle = "#a8a39e";
  ctx.font = "11px Arial, sans-serif";
  ctx.fillText(`${league || "CoachKit"} · how many quarters each player is on`, 50, 38);
  ctx.textAlign = "right";
  ctx.fillText(new Date().toLocaleDateString(), W - 14, 28);

  const legendY = 54;
  paintCell(ctx, 16, legendY, 36, 18, { kind: "full", pos: "" });
  ctx.fillStyle = "#e8e4dc";
  ctx.font = "bold 10px Arial, sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText("Full", 56, legendY + 9);
  paintCell(ctx, 100, legendY, 36, 18, { kind: "partial-on", pos: "" });
  ctx.fillStyle = "#e8e4dc";
  ctx.fillText("Split", 140, legendY + 9);
  paintCell(ctx, 186, legendY, 36, 18, { kind: "bench", pos: "" });
  ctx.fillStyle = "#e8e4dc";
  ctx.fillText("Bench", 226, legendY + 9);
  ctx.fillStyle = "#7a7570";
  ctx.textAlign = "right";
  ctx.fillText(`Min ${playTime?.minQ ?? 2} of 4`, W - 14, legendY + 9);

  const cellsX = 168;
  const cellW = 52;
  const gap = 6;
  ctx.font = "bold 9px Arial, sans-serif";
  ctx.fillStyle = "#7a7570";
  ctx.textAlign = "center";
  [1, 2, 3, 4].forEach((quarter, index) => {
    ctx.fillText(`Q${quarter}`, cellsX + index * (cellW + gap) + cellW / 2, 96);
  });

  if (!rows.length) {
    ctx.fillStyle = "#7a7570";
    ctx.font = "bold 12px Arial, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("No active players", W / 2, header + 28);
  }

  rows.forEach((row, index) => {
    const y = header + index * rowH;
    if (index % 2 === 0) {
      ctx.fillStyle = "rgba(255,255,255,0.03)";
      ctx.fillRect(10, y + 2, W - 20, rowH - 4);
    }
    ctx.fillStyle = "#e8e4dc";
    ctx.font = "bold 12px Arial, sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(firstName(row.name).slice(0, 12), 16, y + 18);
    ctx.fillStyle = "#7a7570";
    ctx.font = "10px Arial, sans-serif";
    ctx.fillText(`#${row.number ?? ""}`, 16, y + 32);
    (row.cells || []).forEach((cell, cellIndex) => {
      paintCell(ctx, cellsX + cellIndex * (cellW + gap), y + 8, cellW, 22, cell);
    });
    ctx.fillStyle = row.met ? "#2ecc71" : "#e8a020";
    ctx.font = "bold 11px Arial, sans-serif";
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    ctx.fillText(row.label || "", W - 16, y + 16);
    const barW = 4 * cellW + 3 * gap;
    ctx.fillStyle = "rgba(255,255,255,0.08)";
    roundRect(ctx, cellsX, y + 34, barW, 4, 2);
    ctx.fill();
    const filled = Math.max(0, Math.min(1, Number(row.ratio) || 0)) * barW;
    if (filled > 0) {
      ctx.fillStyle = row.met ? "#2ecc71" : "#e8a020";
      roundRect(ctx, cellsX, y + 34, filled, 4, 2);
      ctx.fill();
    }
  });

  ctx.fillStyle = "#666";
  ctx.font = "bold 10px Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillText("CoachKit · play time", W / 2, H - 8);
}
