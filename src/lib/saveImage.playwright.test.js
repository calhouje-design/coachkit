import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "vite";
import { devices, webkit } from "playwright";

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
  browser = await webkit.launch({ headless: true });
});

test.after(async () => {
  await browser?.close();
  await server?.close();
});

function shareStub() {
  window.__imageShares = [];
  window.__saveClickDepth = 0;
  document.addEventListener("click", () => { window.__saveClickDepth += 1; }, true);
  document.addEventListener("click", () => { window.__saveClickDepth -= 1; }, false);
  const canShare = (data) => Array.isArray(data?.files) && data.files.length > 0;
  const share = (data) => {
    const file = data?.files?.[0];
    window.__imageShares.push({
      name: file?.name || "",
      type: file?.type || "",
      isFile: typeof File !== "undefined" && file instanceof File,
      duringClick: window.__saveClickDepth > 0,
      title: data?.title || "",
      file,
    });
    return Promise.resolve();
  };
  Object.defineProperty(navigator, "canShare", { configurable: true, writable: true, value: canShare });
  Object.defineProperty(navigator, "share", { configurable: true, writable: true, value: share });
}

async function pngShares(page) {
  return page.evaluate(async () => {
    const rows = [];
    for (const entry of window.__imageShares) {
      const bytes = new Uint8Array(await entry.file.slice(0, 8).arrayBuffer());
      rows.push({
        name: entry.name,
        type: entry.type,
        isFile: entry.isFile,
        duringClick: entry.duringClick,
        title: entry.title,
        size: entry.file.size,
        png: bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71,
      });
    }
    return rows;
  });
}

test("iPhone Web Share receives the field, play-time, and game-log PNG files from the tap", async () => {
  const context = await browser.newContext({ ...devices["iPhone 13"] });
  await context.addInitScript(shareStub);
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  const errors = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  try {
    await page.goto(`${base}/src/lib/harness/save-image.html`, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Share lineup" }).click();
    await page.getByTestId("share-modal").waitFor();
    await page.getByTestId("save-field-image").click();
    await page.getByTestId("save-play-time-image").click();
    let shares = await pngShares(page);
    assert.equal(shares.length, 2, JSON.stringify(shares));
    assert.deepEqual(shares.map((row) => row.name), ["CoachKit_Field_Q1-Q4.png", "CoachKit_PlayTime.png"]);
    for (const row of shares) {
      assert.equal(row.isFile, true, row.name);
      assert.equal(row.type, "image/png", row.name);
      assert.equal(row.duringClick, true, row.name);
      assert.equal(row.png, true, row.name);
      assert.ok(row.size > 1000, `${row.name} size ${row.size}`);
    }
    assert.equal(shares[0].title, "CoachKit field");
    assert.equal(shares[1].title, "CoachKit play time");

    await page.getByTestId("share-modal").getByRole("button", { name: "Close" }).click();
    await page.getByRole("button", { name: "Game Log" }).click();
    await page.getByTestId("game-log-sheets").locator("summary").click();
    await page.getByTestId("save-game-log-field").click();
    await page.getByTestId("save-game-log-play").click();
    shares = await pngShares(page);
    assert.equal(shares.length, 4, JSON.stringify(shares));
    assert.equal(shares[2].name, "CoachKit_Field_H1-H2.png");
    assert.equal(shares[3].name, "CoachKit_PlayTime.png");
    for (const row of shares.slice(2)) {
      assert.equal(row.isFile, true, row.name);
      assert.equal(row.type, "image/png", row.name);
      assert.equal(row.duringClick, true, row.name);
      assert.equal(row.png, true, row.name);
      assert.ok(row.size > 1000, `${row.name} size ${row.size}`);
    }
    assert.equal(errors.length, 0, errors.join("\n"));
  } finally {
    await page.close();
    await context.close();
  }
});
