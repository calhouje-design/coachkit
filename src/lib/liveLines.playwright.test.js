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

/** Screen position of each live sub line, and the bench chip it starts from. */
async function liveLines(page) {
  return page.locator("[data-phase]").evaluate(wrap => {
    const lines = [...wrap.querySelectorAll("[data-sub-lines] polyline")].map(node => {
      const ctm = node.getScreenCTM();
      const points = node.getAttribute("points").trim().split(/\s+/).map(pair => {
        const [x, y] = pair.split(",").map(Number);
        const screen = new DOMPoint(x, y).matrixTransform(ctm);
        return { x: screen.x, y: screen.y };
      });
      return { points };
    });
    const circles = [...wrap.querySelectorAll("[data-sub-to]")].map(node => {
      const bounds = node.getBoundingClientRect();
      const marker = node.closest("[data-player-marker]");
      const label = marker?.getAttribute("aria-label") || "";
      return {
        id: node.getAttribute("data-sub-to"),
        name: label.split(",")[0].trim().split(/\s+/)[0],
        keeper: /goalkeeper/.test(label),
        cx: bounds.left + bounds.width / 2,
        cy: bounds.top + bounds.height / 2,
      };
    });
    return [...wrap.querySelectorAll("[data-testid='bench-player']")].map(node => {
      const text = node.innerText.replace(/\s+/g, " ").trim();
      const named = (text.match(/for (\S+)/) || [])[1] || "";
      const dot = node.querySelector("[data-sub-from]");
      if (!named || !dot) return { id: node.getAttribute("data-player-id"), text, named, lined: false };
      const bounds = dot.getBoundingClientRect();
      const x = bounds.left + bounds.width / 2;
      const y = bounds.top + bounds.height / 2;
      let best = null;
      lines.forEach(line => {
        const start = line.points[0];
        const distance = Math.hypot(start.x - x, start.y - y);
        if (!best || distance < best.distance) best = { distance, line };
      });
      const end = best.line.points[best.line.points.length - 1];
      const ranked = circles
        .map(circle => ({ ...circle, distance: Math.hypot(end.x - circle.cx, end.y - circle.cy) }))
        .sort((a, b) => a.distance - b.distance);
      return {
        id: node.getAttribute("data-player-id"),
        text,
        named,
        lined: true,
        points: best.line.points.length,
        startDistance: best.distance,
        endDistance: ranked[0]?.distance ?? null,
        hit: ranked[0]?.name || "",
        hitId: ranked[0]?.id || "",
        keeper: !!ranked[0]?.keeper,
      };
    });
  });
}

async function returnBackHalf(page, victim) {
  const card = page.locator("[data-player-card]").filter({ hasText: victim }).first();
  await card.getByRole("button", { name: "Inj" }).click();
  await page.getByRole("button", { name: "Return" }).first().click();
  await page.getByTestId("return-back-1").click();
  await page.getByRole("radio", { name: /Yes/ }).click();
  await page.getByTestId("return-confirm").click();
  await page.getByTestId("return-sheet").waitFor({ state: "detached" });
  await page.locator("[data-phase] [data-sub-lines] polyline").first().waitFor();
}

test("after a Q1 injury and a back-half Return, live sub lines match the bench labels and the share tiles", async () => {
  const cases = [
    { format: "8v8", shape: "3-3-1", extra: 4, seed: 3, victim: "Ivy" },
    { format: "11v11", shape: "4-4-2", extra: 5, seed: 1, victim: "Ann" },
  ];
  for (const item of cases) {
    const page = await browser.newPage({ viewport: { width: 390, height: 900 } });
    const errors = [];
    page.on("pageerror", error => errors.push(String(error)));
    try {
      const query = `format=${item.format}&shape=${encodeURIComponent(item.shape)}&extra=${item.extra}&seed=${item.seed}`;
      await page.goto(`${base}/src/lib/harness/live-lines.html?${query}`, { waitUntil: "networkidle" });
      await returnBackHalf(page, item.victim);
      const rows = await liveLines(page);
      const lined = rows.filter(row => row.lined);
      assert.ok(lined.length > 0, `${item.format} drew no sub lines`);
      assert.ok(lined.some(row => row.text.includes(item.victim)), `${item.format} returner`);
      await page.getByRole("button", { name: "Share lineup" }).click();
      const tile = page.locator("[data-testid='field-tile'][data-caption='Q1 · 1st half']");
      await tile.waitFor();
      const tilePairs = Object.fromEntries(
        (await tile.getAttribute("data-pairs")).split(",").filter(Boolean).map(pair => {
          const [inId, outId] = pair.split(">");
          return [inId, outId];
        }),
      );
      assert.equal(Object.keys(tilePairs).length, lined.length, item.format);
      for (const row of lined) {
        assert.equal(row.points, 2, `${item.format} ${row.text}`);
        assert.ok(row.startDistance < 8, `${item.format} line start ${row.startDistance}`);
        assert.equal(row.hit, row.named, `${item.format} ${row.text} hit ${row.hit}`);
        assert.ok(row.endDistance < 28, `${item.format} line end ${row.endDistance}`);
        assert.equal(row.keeper, false, `${item.format} ${row.text}`);
        assert.equal(row.hitId, tilePairs[row.id], `${item.format} ${row.id}`);
      }
      assert.equal(errors.length, 0, errors.join("\n"));
    } finally {
      await page.close();
    }
  }
});