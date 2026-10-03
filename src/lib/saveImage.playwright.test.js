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
    await page.waitForFunction(() => [...document.querySelectorAll("[data-save-kind='field']")].every(node => !node.disabled));
    const fieldButtons = page.locator("[data-save-kind='field']");
    const fieldCount = await fieldButtons.count();
    for (let index = 0; index < fieldCount; index += 1) await fieldButtons.nth(index).click();
    await page.getByTestId("save-play-time-image").click();
    let shares = await pngShares(page);
    assert.equal(shares.length, 9, JSON.stringify(shares));
    assert.deepEqual(shares.map((row) => row.name), [
      "CoachKit_Field_Q1_H1.png",
      "CoachKit_Field_Q1_H2.png",
      "CoachKit_Field_Q2_H1.png",
      "CoachKit_Field_Q2_H2.png",
      "CoachKit_Field_Q3_H1.png",
      "CoachKit_Field_Q3_H2.png",
      "CoachKit_Field_Q4_H1.png",
      "CoachKit_Field_Q4_H2.png",
      "CoachKit_PlayTime.png",
    ]);
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
    await page.waitForFunction(() => [...document.querySelectorAll("[data-save-kind='game-log-field']")].every(node => !node.disabled));
    const logButtons = page.locator("[data-save-kind='game-log-field']");
    const logCount = await logButtons.count();
    for (let index = 0; index < logCount; index += 1) await logButtons.nth(index).click();
    await page.getByTestId("save-game-log-play").click();
    shares = await pngShares(page);
    assert.equal(shares.length, 12, JSON.stringify(shares));
    assert.deepEqual(shares.slice(9).map((row) => row.name), [
      "CoachKit_Field_H1.png",
      "CoachKit_Field_H2.png",
      "CoachKit_PlayTime.png",
    ]);
    for (const row of shares.slice(9)) {
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
    await page.getByTestId("field-tile").first().waitFor();
    const expected = await page.getByTestId("field-tile").count() + 1;
    await page.waitForFunction((count) => window.__encodes >= count, expected);
    await page.waitForTimeout(250);
    assert.equal(await page.evaluate(() => window.__encodes), expected);
    await page.evaluate(() => {
      window.__coachkitSameContentRender();
      window.__coachkitSameContentRender();
      window.__coachkitSameContentRender();
    });
    await page.waitForTimeout(400);
    assert.equal(await page.evaluate(() => window.__encodes), expected);
    await page.evaluate(() => window.__coachkitChangeScore());
    await page.waitForFunction((count) => window.__encodes >= count, expected * 2);
    await page.waitForTimeout(300);
    assert.equal(await page.evaluate(() => window.__encodes), expected * 2);
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
    await page.getByTestId("game-log-field-tile").first().waitFor();
    const expected = await page.getByTestId("game-log-field-tile").count() + 1;
    await page.waitForFunction((count) => window.__encodes >= count, expected);
    await page.waitForTimeout(300);
    assert.equal(await page.evaluate(() => window.__encodes), expected);
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
    await page.waitForFunction(() => [...document.querySelectorAll("[data-hold-kind='field']")].length > 0 && [...document.querySelectorAll("[data-hold-kind='field']")].every(node => !node.disabled));
    const fieldHolds = await page.locator("[data-hold-kind='field']").evaluateAll(nodes => nodes.map(node => node.getAttribute("data-testid")));
    assert.equal(fieldHolds.length, 8);
    for (const id of fieldHolds) await cachedHoldImage(page, id);
    await cachedHoldImage(page, "hold-play-time-image");
    await page.getByTestId("share-modal").getByRole("button", { name: "Close" }).click();
    await page.getByRole("button", { name: "Game Log" }).click();
    await page.getByTestId("game-log-sheets").locator("summary").click();
    await page.getByTestId("hold-game-log-field").waitFor();
    await page.waitForFunction(() => [...document.querySelectorAll("[data-hold-kind='game-log-field']")].every(node => !node.disabled));
    const logHolds = await page.locator("[data-hold-kind='game-log-field']").evaluateAll(nodes => nodes.map(node => node.getAttribute("data-testid")));
    assert.deepEqual(logHolds, ["hold-game-log-field", "hold-game-log-field-1"]);
    for (const id of logHolds) await cachedHoldImage(page, id);
    await cachedHoldImage(page, "hold-game-log-play");
  } finally {
    await page.close();
    await context.close();
  }
});

async function pngHashInPage(page, expression) {
  return page.evaluate(expression);
}

test("each saved field PNG is that tile's image", async () => {
  const context = await browser.newContext({ ...devices["iPhone 13"] });
  await context.addInitScript(shareStub);
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  try {
    await page.goto(`${base}/src/lib/harness/save-image.html`, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Share lineup" }).click();
    await page.waitForFunction(() => [...document.querySelectorAll("[data-save-kind='field']")].every(node => !node.disabled));
    assert.equal(await page.getByTestId("share-helper").innerText(), "Each quarter has a 1st-half and a 2nd-half lineup. Tap Save under any image to send it or add it to Photos.");
    assert.equal(await page.getByTestId("field-tile-canvas").first().getAttribute("aria-label"), "Q1 · 1st half lineup");
    assert.equal(await page.getByTestId("field-tile-canvas").first().getAttribute("role"), "img");
    const previewHashes = await pngHashInPage(page, async () => {
      const hash = async (blob) => {
        const bytes = new Uint8Array(await blob.arrayBuffer());
        let value = 2166136261;
        for (let i = 0; i < bytes.length; i += 1) value = Math.imul(value ^ bytes[i], 16777619);
        return value >>> 0;
      };
      const nodes = [...document.querySelectorAll("[data-testid='field-tile-canvas']")];
      const hashes = [];
      for (const node of nodes) {
        const blob = await new Promise(resolve => node.toBlob(resolve));
        hashes.push(await hash(blob));
      }
      return hashes;
    });
    const buttons = page.locator("[data-save-kind='field']");
    const count = await buttons.count();
    for (let index = 0; index < count; index += 1) await buttons.nth(index).click();
    const fileHashes = await pngHashInPage(page, async () => {
      const hash = async (file) => {
        const bytes = new Uint8Array(await file.arrayBuffer());
        let value = 2166136261;
        for (let i = 0; i < bytes.length; i += 1) value = Math.imul(value ^ bytes[i], 16777619);
        return value >>> 0;
      };
      const hashes = [];
      for (const entry of window.__imageShares) hashes.push(await hash(entry.file));
      return hashes;
    });
    assert.equal(new Set(previewHashes).size, previewHashes.length, "preview tiles must differ");
    assert.deepEqual(fileHashes, previewHashes);
  } finally {
    await page.close();
    await context.close();
  }
});

test("a game log with a 2nd-half split saves each half", async () => {
  const context = await browser.newContext({ ...devices["iPhone 13"] });
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  try {
    await page.goto(`${base}/src/lib/harness/save-image.html?log=split`, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Game Log" }).click();
    await page.getByTestId("game-log-sheets").locator("summary").click();
    await page.waitForFunction(() => [...document.querySelectorAll("[data-save-kind='game-log-field']")].every(node => !node.disabled));
    assert.equal(await page.getByTestId("game-log-sheet").getAttribute("data-dual"), "true");
    assert.deepEqual(
      await page.getByTestId("game-log-field-tile").evaluateAll(nodes => nodes.map(node => node.getAttribute("data-filename"))),
      ["CoachKit_Field_Q1_H1.png", "CoachKit_Field_Q1_H2.png", "CoachKit_Field_Q2.png"],
    );
    assert.deepEqual(
      await page.getByTestId("game-log-field-label").allInnerTexts(),
      ["Q1 · 1st half", "Q1 · 2nd half", "Q2"],
    );
    const hashes = await page.evaluate(async () => {
      const hash = async (canvas) => {
        const blob = await new Promise(resolve => canvas.toBlob(resolve));
        const bytes = new Uint8Array(await blob.arrayBuffer());
        let value = 2166136261;
        for (let i = 0; i < bytes.length; i += 1) value = Math.imul(value ^ bytes[i], 16777619);
        return value >>> 0;
      };
      const nodes = [...document.querySelectorAll("[data-testid='game-log-field-canvas']")];
      return [await hash(nodes[0]), await hash(nodes[1])];
    });
    assert.notEqual(hashes[0], hashes[1]);
  } finally {
    await page.close();
    await context.close();
  }
});

test("halves games label start and after subs", async () => {
  const context = await browser.newContext({ ...devices["iPhone 13"] });
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  try {
    await page.goto(`${base}/src/lib/harness/save-image.html?periods=halves`, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Share lineup" }).click();
    const sheet = page.getByTestId("share-sheet");
    await sheet.waitFor();
    assert.equal(await page.getByTestId("share-helper").innerText(), "Each half has a start lineup and an after-subs lineup. Tap Save under any image to send it or add it to Photos.");
    assert.deepEqual(await sheet.getByTestId("field-tile-label").allInnerTexts(), [
      "1st half · start",
      "1st half · after subs",
      "2nd half · start",
      "2nd half · after subs",
    ]);
    assert.deepEqual(
      await sheet.getByTestId("field-tile").evaluateAll(nodes => nodes.map(node => node.getAttribute("data-filename"))),
      [
        "CoachKit_Field_H1_Start.png",
        "CoachKit_Field_H1_After.png",
        "CoachKit_Field_H2_Start.png",
        "CoachKit_Field_H2_After.png",
      ],
    );
    const overflow = await page.getByTestId("share-modal").evaluate(node => node.scrollWidth - node.clientWidth);
    assert.ok(overflow <= 1, `overflow ${overflow}`);
  } finally {
    await page.close();
    await context.close();
  }
});

test("full mode lays the quarters out two per row above play time", async () => {
  const context = await browser.newContext({ ...devices["iPhone 13"] });
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  try {
    await page.goto(`${base}/src/lib/harness/save-image.html?sub=0`, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Share lineup" }).click();
    const sheet = page.getByTestId("share-sheet");
    await sheet.waitFor();
    assert.equal(await sheet.getAttribute("data-dual"), "false");
    assert.equal(await page.getByTestId("share-helper").innerText(), "Tap Save under any image to send it or add it to Photos.");
    assert.deepEqual(await sheet.getByTestId("field-tile-label").allInnerTexts(), ["Q1", "Q2", "Q3", "Q4"]);
    assert.deepEqual(
      await sheet.getByTestId("field-tile").evaluateAll(nodes => nodes.map(node => node.getAttribute("data-filename"))),
      ["CoachKit_Field_Q1.png", "CoachKit_Field_Q2.png", "CoachKit_Field_Q3.png", "CoachKit_Field_Q4.png"],
    );
    const layout = await sheet.evaluate(node => {
      const rect = (el) => el.getBoundingClientRect();
      const tiles = [...node.querySelectorAll("[data-testid='field-tile']")].map(rect);
      const play = rect(node.querySelector("[data-testid='play-time-sheet']"));
      const modal = node.closest("[data-testid='share-modal']");
      return {
        columns: getComputedStyle(node.querySelector("[data-testid='field-grid']")).gridTemplateColumns.split(" ").filter(Boolean).length,
        tiles,
        play,
        overflow: modal.scrollWidth - modal.clientWidth,
      };
    });
    assert.equal(layout.columns, 2);
    assert.ok(Math.abs(layout.tiles[0].y - layout.tiles[1].y) < 8);
    assert.ok(layout.tiles[1].x > layout.tiles[0].x);
    assert.ok(layout.tiles[2].y > layout.tiles[0].y + 20);
    assert.ok(layout.play.y > layout.tiles[3].y);
    assert.ok(layout.overflow <= 1, `overflow ${layout.overflow}`);
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
