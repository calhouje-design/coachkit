import test from "node:test";
import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import { createServer } from "vite";
import { chromium } from "playwright";

async function launchBrowser() {
  const options = { headless: true, args: ["--no-sandbox", "--disable-gpu"] };
  try {
    await access("/usr/bin/google-chrome");
    options.executablePath = "/usr/bin/google-chrome";
  } catch {
    /* CI uses the Chromium Playwright downloads. */
  }
  return chromium.launch(options);
}

let server;
let browser;
let base;

test.before(async () => {
  server = await createServer({
    configFile: new URL("../../vite.config.js", import.meta.url).pathname,
    server: { host: "127.0.0.1", port: 0 },
    logLevel: "error",
  });
  await server.listen();
  const address = server.httpServer.address();
  base = `http://127.0.0.1:${address.port}`;
  browser = await launchBrowser();
});

test.after(async () => {
  await browser?.close();
  await server?.close();
});

test("tile panels match the old sheet origin on every compared lineup", async () => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  page.setDefaultTimeout(30000);
  try {
    await page.goto(`${base}/src/lib/harness/save-image.html`, { waitUntil: "networkidle" });
    const result = await page.evaluate(async () => {
      const { FORMATION_TEMPLATES } = await import("/src/lib/formations.js");
      const { scheduleHalfRotation, shareFieldSheet } = await import("/src/lib/gameDay.js");
      const { decorateShareSheet } = await import("/src/lib/afterSubs.js");
      const { paintFieldSheet, paintFieldTile } = await import("/src/lib/sharePaint.js");
      const { fieldImageTiles } = await import("/src/lib/fieldGrid.js");

      const roster = (count) => Array.from({ length: count }, (_, index) => ({
        id: `p${index + 1}`,
        name: `Player ${index + 1}`,
        number: String(index + 1),
        positions: ["GK", "CM", "CF"],
        injured: false,
        out: false,
        ratings: {},
      }));

      const sheetFor = (format, shapeName, periods, subMode) => {
        const slots = FORMATION_TEMPLATES[format].find(shape => shape.name === shapeName).slots;
        const players = roster(slots.length + 3);
        const planned = scheduleHalfRotation(players, slots, {
          minHalves: periods,
          totalQuarters: periods,
          rate: () => 1,
        });
        const quarters = Array.from({ length: periods }, (_, index) => index + 1);
        const periodAbbrev = periods === 2 ? "H" : "Q";
        return decorateShareSheet(
          shareFieldSheet({ lineups: planned.lineups, pairPlan: {}, subMode, quarters, periodAbbrev }),
          { lineups: planned.lineups, subMode, periodAbbrev, roster: players },
        );
      };

      const sheetCssWidth = (count) => {
        const cols = count === 3 ? 3 : count === 1 ? 1 : 2;
        const cellW = count === 3 ? 250 : 360;
        return 10 + cols * cellW + 10 * cols;
      };

      const maxDelta = (sheetCanvas, tileCanvas, px, py, sheetW) => {
        const sdpr = sheetCanvas.width / sheetW;
        const tdpr = tileCanvas.width / 380;
        const width = Math.round(360 * sdpr);
        const height = Math.round(430 * sdpr);
        if (width !== Math.round(360 * tdpr) || height !== Math.round(430 * tdpr)) return { delta: 999, over1: -1 };
        const sheetPixels = sheetCanvas.getContext("2d").getImageData(Math.round(px * sdpr), Math.round(py * sdpr), width, height).data;
        const tilePixels = tileCanvas.getContext("2d").getImageData(Math.round(10 * tdpr), Math.round(88 * tdpr), width, height).data;
        let delta = 0;
        let over1 = 0;
        for (let i = 0; i < sheetPixels.length; i += 4) {
          const pixel = Math.max(
            Math.abs(sheetPixels[i] - tilePixels[i]),
            Math.abs(sheetPixels[i + 1] - tilePixels[i + 1]),
            Math.abs(sheetPixels[i + 2] - tilePixels[i + 2]),
          );
          if (pixel > delta) delta = pixel;
          if (pixel > 1) over1 += 1;
        }
        return { delta, over1 };
      };

      const cases = [
        ["8v8", "3-3-1", 4],
        ["9v9", "3-3-2", 4],
        ["11v11", "4-4-2", 4],
        ["7v7", "2-3-1", 2],
      ];
      const mismatches = [];
      let comparisons = 0;
      let maxSeen = 0;
      for (const [format, shapeName, periods] of cases) {
        for (const subMode of [false, true]) {
          const field = sheetFor(format, shapeName, periods, subMode);
          const sheetW = sheetCssWidth(field.quarters.length);
          const painted = {};
          for (const view of subMode ? ["start", "after"] : ["both"]) {
            const canvas = document.createElement("canvas");
            paintFieldSheet(canvas, { field, league: format, opponent: "Them", homeScore: 1, awayScore: 0, view });
            painted[view] = canvas;
          }
          for (const tile of fieldImageTiles(field)) {
            const view = tile.half === "after" ? "after" : tile.half === "start" ? "start" : "both";
            const tileCanvas = document.createElement("canvas");
            paintFieldTile(tileCanvas, {
              panel: tile.panel,
              caption: tile.caption,
              league: format,
              opponent: "Them",
              homeScore: 1,
              awayScore: 0,
            });
            const slot = Math.max(0, (tile.panel.quarter || 1) - 1);
            const { delta, over1 } = maxDelta(
              painted[view],
              tileCanvas,
              10 + (slot % 2) * 370,
              96 + Math.floor(slot / 2) * 440,
              sheetW,
            );
            comparisons += 1;
            maxSeen = Math.max(maxSeen, delta);
            if (delta > 2 || over1 > 8) mismatches.push({ format, subMode, caption: tile.caption, quarter: tile.panel.quarter, delta, over1 });
          }
        }
      }
      const probeField = sheetFor("8v8", "3-3-1", 4, true);
      const probeTile = fieldImageTiles(probeField).find(tile => tile.half === "start" && tile.panel.quarter === 1);
      const probeSheet = document.createElement("canvas");
      paintFieldSheet(probeSheet, { field: probeField, league: "8v8", opponent: "Them", homeScore: 1, awayScore: 0, view: "start" });
      const shifted = document.createElement("canvas");
      paintFieldTile(shifted, {
        panel: { ...probeTile.panel, quarter: 2 },
        caption: probeTile.caption,
        league: "8v8",
        opponent: "Them",
        homeScore: 1,
        awayScore: 0,
      });
      const shiftedDelta = maxDelta(probeSheet, shifted, 10, 96, sheetCssWidth(probeField.quarters.length)).delta;
      return { comparisons, maxSeen, mismatches, shiftedDelta };
    });
    console.log(`panel parity: ${result.comparisons} comparisons, max channel delta ${result.maxSeen}, shifted-origin delta ${result.shiftedDelta}`);
    assert.equal(result.comparisons, 42, JSON.stringify(result));
    assert.deepEqual(result.mismatches, []);
    assert.ok(result.maxSeen <= 2, `max channel delta ${result.maxSeen}`);
    assert.ok(result.shiftedDelta > 30, `shifted origin delta ${result.shiftedDelta}`);
  } finally {
    await page.close();
  }
});
