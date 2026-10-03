import test from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
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
      keys: Object.keys(data || {}),
      title: data?.title,
      text: data?.text,
      url: data?.url,
      lastModified: file?.lastModified || 0,
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
        text: entry.text,
        url: entry.url,
        keys: entry.keys,
        lastModified: entry.lastModified,
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
      assert.deepEqual(row.keys, ["files"], row.name);
      assert.equal(row.title, undefined, row.name);
      assert.equal(row.text, undefined, row.name);
      assert.equal(row.url, undefined, row.name);
      assert.equal(typeof row.lastModified, "number", row.name);
      assert.ok(row.lastModified > 0, row.name);
    }

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
      assert.deepEqual(row.keys, ["files"], row.name);
      assert.equal(row.title, undefined, row.name);
      assert.equal(row.text, undefined, row.name);
      assert.equal(row.url, undefined, row.name);
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

async function cachedHoldImage(page, testId) {
  const before = await page.evaluate(() => window.__encodes);
  await page.getByTestId(testId).click();
  await page.getByTestId("save-image-overlay").waitFor();
  const info = await page.evaluate(async () => {
    const img = document.querySelector("[data-testid='save-image-preview']");
    const hint = document.querySelector("[data-testid='save-image-hint']")?.textContent || "";
    const src = img?.src || "";
    const response = await fetch(src);
    const bytes = new Uint8Array(await response.arrayBuffer());
    return {
      hint,
      src,
      png: bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71,
      size: bytes.length,
      encodes: window.__encodes,
    };
  });
  assert.equal(info.hint, "Press and hold the image, then tap Save to Photos (or Add to Photos).", testId);
  assert.equal(info.src.startsWith("blob:"), true, info.src);
  assert.equal(info.src.includes("data:"), false, info.src);
  assert.equal(info.png, true, testId);
  assert.ok(info.size > 1000, `${testId} size ${info.size}`);
  assert.equal(info.encodes, before, testId);
  await page.getByTestId("save-image-overlay").getByRole("button", { name: "Close" }).click();
  await page.getByTestId("save-image-overlay").waitFor({ state: "hidden" });
}

test("press and hold opens the cached PNG for every save button", async () => {
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
    await page.getByRole("button", { name: "Share lineup" }).click();
    await page.getByTestId("hold-field-image").waitFor();
    await page.waitForFunction(() => !document.querySelector("[data-testid='hold-field-image']")?.disabled);
    await cachedHoldImage(page, "hold-field-image");
    await cachedHoldImage(page, "hold-play-time-image");
    await page.getByTestId("share-modal").getByRole("button", { name: "Close" }).click();
    await page.getByRole("button", { name: "Game Log" }).click();
    await page.getByTestId("game-log-sheets").locator("summary").click();
    await page.getByTestId("hold-game-log-field").waitFor();
    await page.waitForFunction(() => !document.querySelector("[data-testid='hold-game-log-field']")?.disabled);
    await cachedHoldImage(page, "hold-game-log-field");
    await cachedHoldImage(page, "hold-game-log-play");
  } finally {
    await page.close();
    await context.close();
  }
});

test("the build stamp renders inside Settings", async () => {
  const context = await browser.newContext({ ...devices["iPhone 13"] });
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  const sha = execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim();
  try {
    await page.goto(`${base}/src/lib/harness/save-image.html`, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Settings" }).click();
    const dialog = page.getByRole("dialog", { name: "Settings" });
    await dialog.waitFor();
    const stamp = dialog.getByTestId("build-stamp");
    assert.equal(await stamp.innerText(), `Build ${sha}`);
    assert.equal(await stamp.evaluate((el) => el.closest("[role='dialog']")?.getAttribute("aria-label")), "Settings");
  } finally {
    await page.close();
    await context.close();
  }
});

test("settings footer shows the short build SHA", async () => {
  const context = await browser.newContext({ ...devices["iPhone 13"] });
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  const sha = execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim();
  try {
    await page.goto(`${base}/src/lib/harness/save-image.html`, { waitUntil: "networkidle" });
    await page.getByTestId("build-stamp").waitFor();
    assert.equal(await page.getByTestId("build-stamp").innerText(), `Build ${sha}`);
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
          await navigator.share({ files: [file] });
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
