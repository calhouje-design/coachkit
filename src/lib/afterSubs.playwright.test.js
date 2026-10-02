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
    await page.goto(`${base}/after-subs.html`, { waitUntil: "networkidle" });
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
    await page.getByTestId("open-print-preview").click();
    await page.getByTestId("print-preview").waitFor();
    assert.equal(errors.length, 0, errors.join("\n"));
  } finally {
    await page.close();
  }
});
