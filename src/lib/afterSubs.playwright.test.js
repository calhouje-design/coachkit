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

test("Start and After subs at 390px stay independent, and the share sheet shows both", async () => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on("pageerror", error => errors.push(String(error)));
  try {
    await page.goto(`${base}/src/lib/harness/after-subs.html`, { waitUntil: "networkidle" });
    const toggle = page.getByTestId("phase-toggle");
    await toggle.waitFor();
    const box = await toggle.boundingBox();
    assert.ok(box.width <= 390, `toggle width ${box.width}`);
    assert.equal(await page.getByTestId("phase-start").getAttribute("aria-checked"), "true");
    const startIds = await page.locator("[data-testid^='field-player-']").evaluateAll(nodes => nodes.map(node => node.getAttribute("data-player-id")));
    await page.getByTestId("phase-after").click();
    await page.getByTestId("phase-caption").waitFor();
    assert.match(await page.getByTestId("phase-caption").innerText(), /After subs · Q1 2nd half/);
    const gk = page.getByTestId("field-player-0");
    assert.match(await gk.getAttribute("aria-label"), /goalkeeper, fixed/);
    await page.getByTestId("phase-after").focus();
    await page.keyboard.press("ArrowLeft");
    assert.equal(await page.getByTestId("phase-start").getAttribute("aria-checked"), "true");
    await page.keyboard.press("ArrowRight");
    assert.equal(await page.getByTestId("phase-after").getAttribute("aria-checked"), "true");
    const before = await page.locator("[data-testid^='field-player-']").evaluateAll(nodes => nodes.map(node => node.getAttribute("data-player-id")));
    await page.getByTestId("field-player-1").click();
    await page.getByTestId("field-player-2").click();
    const after = await page.locator("[data-testid^='field-player-']").evaluateAll(nodes => nodes.map(node => node.getAttribute("data-player-id")));
    assert.notDeepEqual(after, before);
    assert.equal(after[0], before[0], "goalkeeper stayed");
    await page.getByTestId("reset-after-subs").waitFor();
    await page.getByTestId("phase-start").click();
    const startAgain = await page.locator("[data-testid^='field-player-']").evaluateAll(nodes => nodes.map(node => node.getAttribute("data-player-id")));
    assert.deepEqual(startAgain, startIds);
    await page.getByRole("button", { name: "Share lineup" }).click();
    const sheet = page.getByTestId("share-sheet");
    await sheet.waitFor();
    assert.equal(await sheet.getAttribute("data-dual"), "true");
    assert.deepEqual(await sheet.getByTestId("field-tile-label").allInnerTexts(), [
      "Q1 · 1st half",
      "Q1 · 2nd half",
      "Q2 · 1st half",
      "Q2 · 2nd half",
      "Q3 · 1st half",
      "Q3 · 2nd half",
      "Q4 · 1st half",
      "Q4 · 2nd half",
    ]);
    const layout = await sheet.evaluate(node => {
      const rect = (el) => {
        const box = el.getBoundingClientRect();
        return { x: box.x, y: box.y, width: box.width, height: box.height };
      };
      const tiles = [...node.querySelectorAll("[data-testid='field-tile']")].map(rect);
      const play = rect(node.querySelector("[data-testid='play-time-sheet']"));
      const modal = node.closest("[data-testid='share-modal']");
      const body = node.closest("[data-testid='share-body']") || modal;
      return {
        columns: getComputedStyle(node.querySelector("[data-testid='field-grid']")).gridTemplateColumns.split(" ").filter(Boolean).length,
        tiles,
        play,
        modalOverflow: modal.scrollWidth - modal.clientWidth,
        bodyOverflow: body.scrollWidth - body.clientWidth,
      };
    });
    assert.equal(layout.columns, 2);
    assert.ok(Math.abs(layout.tiles[0].y - layout.tiles[1].y) < 8);
    assert.ok(layout.tiles[1].x > layout.tiles[0].x + 20);
    assert.ok(layout.tiles[2].y > layout.tiles[0].y + 40);
    assert.ok(Math.abs(layout.tiles[2].y - layout.tiles[3].y) < 8);
    assert.ok(layout.play.y > layout.tiles[layout.tiles.length - 1].y);
    assert.ok(layout.modalOverflow <= 1, `modal overflow ${layout.modalOverflow}`);
    assert.ok(layout.bodyOverflow <= 1, `body overflow ${layout.bodyOverflow}`);
    await page.getByTestId("open-print-preview").click();
    await page.getByTestId("print-preview").waitFor();
    assert.equal(errors.length, 0, errors.join("\n"));
  } finally {
    await page.close();
  }
});

test("the share grid stays two columns at 320px with no sideways overflow", async () => {
  const page = await browser.newPage({ viewport: { width: 320, height: 700 } });
  const errors = [];
  page.on("pageerror", error => errors.push(String(error)));
  try {
    await page.goto(`${base}/src/lib/harness/after-subs.html`, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Share lineup" }).click();
    const sheet = page.getByTestId("share-sheet");
    await sheet.waitFor();
    const layout = await sheet.evaluate(node => {
      const rect = (el) => el.getBoundingClientRect();
      const tiles = [...node.querySelectorAll("[data-testid='field-tile']")].map(rect);
      const modal = node.closest("[data-testid='share-modal']");
      const body = document.querySelector("[data-testid='share-body']");
      return {
        columns: getComputedStyle(node.querySelector("[data-testid='field-grid']")).gridTemplateColumns.split(" ").filter(Boolean).length,
        sameRow: Math.abs(tiles[0].y - tiles[1].y) < 8 && tiles[1].x > tiles[0].x,
        q2Below: tiles[2].y > tiles[0].y + 20,
        pageOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        modalOverflow: modal.scrollWidth - modal.clientWidth,
        bodyOverflow: body.scrollWidth - body.clientWidth,
        labels: [...node.querySelectorAll("[data-testid='field-tile-label']")].slice(0, 4).map(el => el.textContent),
      };
    });
    assert.equal(layout.columns, 2);
    assert.equal(layout.sameRow, true);
    assert.equal(layout.q2Below, true);
    assert.deepEqual(layout.labels, ["Q1 · 1st half", "Q1 · 2nd half", "Q2 · 1st half", "Q2 · 2nd half"]);
    assert.ok(layout.pageOverflow <= 1, `page overflow ${layout.pageOverflow}`);
    assert.ok(layout.modalOverflow <= 1, `modal overflow ${layout.modalOverflow}`);
    assert.ok(layout.bodyOverflow <= 1, `body overflow ${layout.bodyOverflow}`);
    assert.equal(errors.length, 0, errors.join("\n"));
  } finally {
    await page.close();
  }
});
