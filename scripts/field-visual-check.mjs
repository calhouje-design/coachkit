// Headless check at a 390x844 phone. Uses the same layout function as the Game Day field.
// Run: node scripts/field-visual-check.mjs
import puppeteer from "puppeteer-core";
import { mkdir, writeFile } from "node:fs/promises";
import { layoutFieldPlayers } from "../src/lib/fieldLayout.js";

const OUT = process.env.OUT_DIR || "/tmp/field-visual";
const VIEW_W = 390;
const VIEW_H = 844;

const sheets = [
  {
    file: "field-421-390.png",
    title: "4-2-1",
    positions: ["GK", "LD", "CD", "CD", "RD", "LM", "RM", "CF"],
    names: ["Sam Keeper", "Blake Pete", "Jaxon Wells", "Wes Duda", "Trey Lazear", "Remi Brown", "Sean Jones", "Henry Davis"],
    numbers: ["1", "2", "3", "4", "5", "6", "7", "8"],
  },
  {
    file: "field-532-390.png",
    title: "5-3-2",
    positions: ["GK", "LB", "CB", "CB", "CB", "RB", "LM", "CM", "RM", "LF", "RF"],
    names: ["Sam Keeper", "Blake Pete", "Jaxon Wells", "Wes Duda", "Trey Lazear", "Maddox Anderson", "Remi Brown", "Sean Jones", "Henry Davis", "Jude Garcia", "John Smith"],
    numbers: ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11"],
  },
];

function fieldHtml(sheet, fieldWidth, fieldHeight) {
  const starters = sheet.positions.map((pos, i) => ({
    pos,
    player: { id: `p${i}`, name: sheet.names[i], number: sheet.numbers[i] },
  }));
  const placed = layoutFieldPlayers(starters, { fieldWidth, fieldHeight });
  const markers = placed.map((spot, i) => {
    const player = starters[i].player;
    const label = spot.labelBox ? `<div class="name" title="${player.name}" aria-label="${player.name}" style="width:${spot.labelBox.width}px;top:${46 + 2}px">${spot.label}</div>` : "";
    return `<div class="mark" style="left:${spot.x}px;top:${spot.y - 23}px" aria-label="${player.name}, ${spot.pos}">
      <div class="circle" data-kind="circle">${player.number}<span>${spot.pos}</span></div>
      ${label}
    </div>`;
  }).join("");
  return `<!doctype html>
<html><head><meta charset="utf-8"><style>
  html, body { margin: 0; background: #1a2332; color: #fff; font-family: "Palatino Linotype", "Book Antiqua", Palatino, Georgia, serif; }
  .page { width: ${VIEW_W}px; box-sizing: border-box; padding: 16px; }
  .row { display: flex; gap: 6px; align-items: stretch; }
  .bench { width: 76px; flex-shrink: 0; border: 1px dashed rgba(255,255,255,0.22); border-radius: 10px; background: rgba(10,13,15,0.55); display: flex; flex-direction: column; align-items: center; padding: 8px 4px; gap: 6px; }
  .sub { width: 100%; min-height: 56px; border-radius: 10px; border: 2px solid #2ecc71; background: linear-gradient(180deg,#f2c14b,#d99820); color: #0a0d0f; font-weight: 900; letter-spacing: 0.08em; }
  .bench b { font-size: 9px; letter-spacing: 0.06em; color: #b8c2cf; }
  .field { position: relative; flex: 1; }
  .field svg { width: 100%; display: block; border-radius: 10px; }
  .mark { position: absolute; width: 46px; transform: translateX(-50%); text-align: center; }
  .circle { width: 46px; height: 46px; border-radius: 50%; box-sizing: border-box; border: 2px solid rgba(255,255,255,0.8); background: linear-gradient(135deg,#f4b942,#d99820); color: #1a1a1a; font-size: 9px; font-weight: 800; display: flex; flex-direction: column; align-items: center; justify-content: center; }
  .circle span { font-size: 8px; }
  .name { position: absolute; left: 50%; transform: translateX(-50%); box-sizing: border-box; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; text-align: center; font-size: 9px; font-weight: 800; line-height: 1.2; letter-spacing: 0.02em; padding: 1px 4px; color: #fff; background: rgba(10,13,15,0.78); border-radius: 4px; }
  h1 { font-size: 13px; margin: 0 0 8px; letter-spacing: 0.04em; }
</style></head>
<body><div class="page"><h1>${sheet.title} · 390px</h1><div class="row"><div class="bench"><button class="sub">SUB</button><b>BENCH</b></div>
<div class="field" id="field">${pitchSvg()}<div id="marks">${markers}</div></div></div></div></body></html>`;
}

function pitchSvg() {
  return `<svg viewBox="0 0 320 480">
    <rect x="5" y="5" width="310" height="470" rx="8" fill="#1e4d1a" stroke="#fff" stroke-width="1.5"/>
    <line x1="5" y1="242" x2="315" y2="242" stroke="rgba(255,255,255,0.6)" stroke-width="1.5" stroke-dasharray="5,4"/>
    <circle cx="160" cy="242" r="42" fill="none" stroke="rgba(255,255,255,0.6)" stroke-width="1.5"/>
    <rect x="80" y="400" width="160" height="75" fill="none" stroke="rgba(255,255,255,0.6)" stroke-width="1.5"/>
    <rect x="80" y="5" width="160" height="75" fill="none" stroke="rgba(255,255,255,0.6)" stroke-width="1.5"/>
    <g><rect x="12" y="12" width="62" height="34" rx="8" fill="#f4c442"/><text x="43" y="36" text-anchor="middle" fill="#0a0d0f" font-family="Arial" font-weight="900" font-size="20">Q1</text></g>
  </svg>`;
}

function overlaps(a, b) {
  return a.x < b.right - 0.5 && a.right > b.x + 0.5 && a.y < b.bottom - 0.5 && a.bottom > b.y + 0.5;
}

const browser = await puppeteer.launch({
  executablePath: "/usr/bin/google-chrome",
  headless: "new",
  args: ["--no-sandbox", "--disable-gpu"],
});
await mkdir(OUT, { recursive: true });
const report = [];
for (const sheet of sheets) {
  const page = await browser.newPage();
  await page.setViewport({ width: VIEW_W, height: VIEW_H, deviceScaleFactor: 2 });
  const shell = fieldHtml(sheet, 276, 414);
  await page.setContent(shell, { waitUntil: "domcontentloaded" });
  const size = await page.$eval("#field", el => ({ width: el.clientWidth, height: el.querySelector("svg").clientHeight }));
  const fitted = fieldHtml(sheet, size.width, size.height);
  await page.setContent(fitted, { waitUntil: "domcontentloaded" });
  const result = await page.evaluate(() => {
    const field = document.getElementById("field").getBoundingClientRect();
    const boxes = [...document.querySelectorAll(".circle, .name")].map(el => {
      const r = el.getBoundingClientRect();
      return {
        kind: el.className,
        name: el.getAttribute("title") || el.getAttribute("aria-label") || el.textContent,
        x: r.left - field.left,
        y: r.top - field.top,
        right: r.right - field.left,
        bottom: r.bottom - field.top,
        full: el.getAttribute("title") || "",
        text: el.className === "name" ? el.textContent : "",
        scroll: el.className === "name" ? el.scrollWidth : 0,
        client: el.className === "name" ? el.clientWidth : 0,
      };
    });
    return { field: { width: field.width, height: field.height }, boxes };
  });
  const hits = [];
  for (let a = 0; a < result.boxes.length; a++) {
    for (let b = a + 1; b < result.boxes.length; b++) {
      const left = result.boxes[a];
      const right = result.boxes[b];
      if (overlaps(left, right)) hits.push(`${left.kind} ${left.name} / ${right.kind} ${right.name}`);
    }
  }
  const outside = result.boxes.filter(box => box.x < -0.5 || box.y < -0.5 || box.right > result.field.width + 0.5 || box.bottom > result.field.height + 0.5);
  const clipped = result.boxes.filter(box => box.kind === "name" && box.text === box.full && box.scroll > box.client + 0.5);
  const shot = `${OUT}/${sheet.file}`;
  await page.screenshot({ path: shot, clip: { x: 0, y: 0, width: VIEW_W, height: Math.min(VIEW_H, 760) } });
  await writeFile(`${OUT}/${sheet.file.replace(".png", ".json")}`, JSON.stringify({ size, field: result.field, hits, outside, boxes: result.boxes }, null, 2));
  report.push({ file: shot, formation: sheet.title, field: result.field, hits, clipped: clipped.map(box => box.full), outside: outside.map(box => box.name) });
  await page.close();
}
await browser.close();
// Dev-only CLI report for this headless check.
console.log(JSON.stringify(report, null, 2));
if (report.some(row => row.hits.length || row.outside.length || row.clipped.length)) process.exit(1);
