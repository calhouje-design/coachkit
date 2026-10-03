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
  const canShare = (data) => Array.isArray(data?.files) && data.files.length > 0;
  const share = (data) => {
    const file = data?.files?.[0];
    window.__imageShares.push({
      name: file?.name || "",
      type: file?.type || "",
      isFile: typeof File !== "undefined" && file instanceof File,
      eventType: window.event?.type || "",
      userActive: navigator.userActivation?.isActive === true,
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
        eventType: entry.eventType,
        userActive: entry.userActive,
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
      assert.equal(row.eventType, "click", row.name);
      assert.equal(row.userActive, true, row.name);
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
      assert.equal(row.eventType, "click", row.name);
      assert.equal(row.userActive, true, row.name);
      assert.equal(row.png, true, row.name);
      assert.ok(row.size > 1000, `${row.name} size ${row.size}`);
    }
    assert.equal(errors.length, 0, errors.join("\n"));
  } finally {
    await page.close();
    await context.close();
  }
});

test("same-content re-renders do not re-encode, and a score change encodes once", async () => {
  const context = await browser.newContext({ ...devices["iPhone 13"] });
  await context.addInitScript(() => {
    window.__encodes = 0;
    const proto = HTMLCanvasElement.prototype;
    const original = proto.toBlob;
    proto.toBlob = function countToBlob(...args) {
      window.__encodes += 1;
      return original.apply(this, args);
    };
  });
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  try {
    await page.goto(`${base}/src/lib/harness/save-image.html`, { waitUntil: "networkidle" });
    await page.evaluate(() => { window.__encodes = 0; });
    await page.getByRole("button", { name: "Share lineup" }).click();
    await page.getByTestId("save-field-image").waitFor();
    await page.waitForFunction(() => window.__encodes >= 2);
    await page.waitForTimeout(250);
    assert.equal(await page.evaluate(() => window.__encodes), 2);
    await page.evaluate(() => {
      window.__coachkitSameContentRender();
      window.__coachkitSameContentRender();
      window.__coachkitSameContentRender();
    });
    await page.waitForTimeout(400);
    assert.equal(await page.evaluate(() => window.__encodes), 2);
    await page.evaluate(() => window.__coachkitChangeScore());
    await page.waitForFunction(() => window.__encodes >= 4);
    await page.waitForTimeout(300);
    assert.equal(await page.evaluate(() => window.__encodes), 4);
  } finally {
    await page.close();
    await context.close();
  }
});

test("a collapsed 12-game log encodes nothing until one game is expanded", async () => {
  const context = await browser.newContext({ ...devices["iPhone 13"] });
  await context.addInitScript(() => {
    window.__encodes = 0;
    const proto = HTMLCanvasElement.prototype;
    const original = proto.toBlob;
    proto.toBlob = function countToBlob(...args) {
      window.__encodes += 1;
      return original.apply(this, args);
    };
  });
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  try {
    await page.goto(`${base}/src/lib/harness/save-image.html?games=12`, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Game Log" }).click();
    await page.getByTestId("game-log-sheets").first().waitFor();
    assert.equal(await page.getByTestId("game-log-sheets").count(), 12);
    await page.waitForTimeout(400);
    assert.equal(await page.evaluate(() => window.__encodes), 0);
    await page.getByTestId("game-log-sheets").first().locator("summary").click();
    await page.getByTestId("save-game-log-field").waitFor();
    await page.waitForFunction(() => window.__encodes >= 2);
    await page.waitForTimeout(300);
    assert.equal(await page.evaluate(() => window.__encodes), 2);
  } finally {
    await page.close();
    await context.close();
  }
});

test("encoding at tap time fails the in-click share checks", async () => {
  const context = await browser.newContext({ ...devices["iPhone 13"] });
  await context.addInitScript(shareStub);
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  try {
    await page.setContent(`<!doctype html><body>
      <button id="late">Save late</button>
      <canvas id="c" width="32" height="32"></canvas>
      <script>
        document.getElementById("late").addEventListener("click", async () => {
          const canvas = document.getElementById("c");
          const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
          const file = new File([blob], "late.png", { type: "image/png" });
          await navigator.share({ files: [file], title: "late" });
        });
      </script>
    </body>`);
    await page.getByRole("button", { name: "Save late" }).click();
    await page.waitForFunction(() => window.__imageShares.length === 1);
    const row = await page.evaluate(() => {
      const entry = window.__imageShares[0];
      return { eventType: entry.eventType, userActive: entry.userActive };
    });
    assert.throws(() => {
      assert.equal(row.eventType, "click");
      assert.equal(row.userActive, true);
    }, /click|true|userActive|eventType/);
    console.log(`negative encode-at-tap: eventType=${JSON.stringify(row.eventType)} userActive=${row.userActive}`);
  } finally {
    await page.close();
    await context.close();
  }
});
