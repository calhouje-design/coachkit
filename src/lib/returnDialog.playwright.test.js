import test from "node:test";
import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import { createServer } from "vite";
import { chromium, devices, webkit } from "playwright";

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

test("the return dialog at 390px warns on a mismatch and stays closed until the coach picks", async () => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  try {
    await page.goto(`${base}/return-dialog.html`, { waitUntil: "networkidle" });
    const sheet = page.getByTestId("return-sheet");
    await sheet.waitFor();
    const box = await sheet.boundingBox();
    assert.ok(box.width >= 360 && box.width <= 390, `sheet width ${box.width}`);
    assert.ok(box.y + box.height >= 820, `sheet bottom ${box.y + box.height}`);
    const confirm = page.getByTestId("return-confirm");
    assert.equal(await confirm.isDisabled(), true);
    assert.ok((await confirm.boundingBox()).height >= 44);
    const yes = page.locator("input[name='return-available']").nth(0);
    const no = page.locator("input[name='return-available']").nth(1);
    assert.equal(await yes.isChecked(), false);
    assert.equal(await no.isChecked(), false);
    assert.equal(await page.locator("input[name='return-quarter'][value='1']").isDisabled(), true);
    assert.equal(await page.locator("input[name='return-quarter'][value='2']").isChecked(), true);
    await page.locator("input[name='return-quarter'][value='3']").check();
    const mismatch = page.getByTestId("return-mismatch");
    await mismatch.waitFor();
    assert.match(await mismatch.innerText(), /You're viewing Q2/);
    assert.match(await mismatch.innerText(), /Switch to Q3/);
    assert.match(await mismatch.innerText(), /Keep Q2 view/);
    assert.equal(await confirm.isDisabled(), true);
    await page.screenshot({ path: "/tmp/coachkit-return-dialog-390.png" });
    await page.getByRole("button", { name: "Keep Q2 view" }).click();
    assert.equal(await page.getByTestId("viewing").innerText(), "Viewing Q2");
    assert.equal(await mismatch.count(), 1);
    await page.getByRole("button", { name: "Switch to Q3" }).click();
    assert.equal(await page.getByTestId("viewing").innerText(), "Viewing Q3");
    assert.equal(await mismatch.count(), 0);
    assert.equal(await confirm.isDisabled(), true);
    await page.getByText("Yes — eligible for Q3", { exact: true }).click();
    assert.equal(await confirm.isDisabled(), false);
    for (let i = 0; i < 8; i++) await page.keyboard.press("Tab");
    const inside = await page.evaluate(() => {
      const root = document.querySelector("[data-testid='return-sheet']");
      return !!root && root.contains(document.activeElement);
    });
    assert.equal(inside, true);
    await confirm.click();
    const log = await page.getByTestId("log").innerText();
    assert.match(log, /"type":"confirm"/);
    assert.match(log, /"quarter":3/);
    assert.match(log, /"available":true/);
  } finally {
    await page.close();
  }
});

test("the return dialog covers the sticky header, and a tap there cancels", async () => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  try {
    await page.goto(`${base}/return-dialog.html`, { waitUntil: "networkidle" });
    await page.getByTestId("return-sheet").waitFor();
    const hit = await page.evaluate(() => {
      const el = document.elementFromPoint(10, 10);
      return el?.getAttribute?.("data-testid") || "";
    });
    assert.equal(hit, "return-backdrop");
    await page.screenshot({ path: "/tmp/coachkit-return-dialog-header-390.png" });
    await page.mouse.click(10, 10);
    assert.match(await page.getByTestId("log").innerText(), /cancel/);
    assert.equal(await page.getByTestId("return-sheet").count(), 0);
    assert.equal(await page.getByTestId("app-header").innerText(), "CoachKit");
  } finally {
    await page.close();
  }
});

test("a second return opened immediately is not covered by the first toast", async () => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  try {
    await page.goto(`${base}/return-dialog.html`, { waitUntil: "networkidle" });
    await page.getByTestId("return-sheet").waitFor();
    await page.getByText("Yes — eligible for Q2", { exact: true }).click();
    await page.getByTestId("return-confirm").click();
    const toast = page.getByTestId("return-toast");
    await toast.waitFor();
    assert.equal(await toast.evaluate(el => getComputedStyle(el).zIndex), "150");
    assert.match(await page.getByTestId("log").innerText(), /"playerId":"p7"/);
    await page.getByTestId("open-b").click();
    const sheet = page.getByTestId("return-sheet");
    await sheet.waitFor();
    assert.equal(await toast.count(), 0);
    await page.getByText("Yes — eligible for Q2", { exact: true }).click();
    const confirm = page.getByTestId("return-confirm");
    const box = await confirm.boundingBox();
    const hit = await page.evaluate(({ x, y }) => {
      const el = document.elementFromPoint(x, y);
      return el?.closest?.("[data-testid='return-confirm']")?.getAttribute("data-testid") || el?.getAttribute?.("data-testid") || "";
    }, { x: box.x + box.width / 2, y: box.y + box.height / 2 });
    assert.equal(hit, "return-confirm");
    await confirm.click();
    assert.equal(await sheet.count(), 0);
    const log = await page.getByTestId("log").innerText();
    assert.match(log, /"playerId":"p8"/);
    assert.match(log, /"type":"confirm"/);
    assert.match(log, /"available":true/);
  } finally {
    await page.close();
  }
});

async function launchEngine(engine) {
  const options = { headless: true };
  if (engine === chromium) {
    options.args = ["--no-sandbox", "--disable-gpu"];
    try {
      await access("/usr/bin/google-chrome");
      options.executablePath = "/usr/bin/google-chrome";
    } catch {
      /* CI uses the Chromium Playwright downloads. */
    }
  }
  return engine.launch(options);
}

async function focusStaysInside(page) {
  const inside = () => page.evaluate(() => {
    const root = document.querySelector("[data-testid='return-sheet']");
    return !!root && root.contains(document.activeElement);
  });
  await page.goto(`${base}/return-dialog.html`, { waitUntil: "networkidle" });
  await page.getByTestId("return-sheet").waitFor();
  const behind = page.getByTestId("behind");
  assert.equal(await behind.evaluate(el => el.inert), true);
  assert.equal(await behind.evaluate(el => el.getAttribute("aria-hidden")), "true");
  const controls = page.locator("[data-testid='return-sheet']").locator("button:not([disabled]), input:not([disabled])");
  const count = await controls.count();
  assert.ok(count >= 5, `focusable count ${count}`);
  const groups = await page.evaluate(() => {
    const root = document.querySelector("[data-testid='return-sheet']");
    return new Set([...root.querySelectorAll("input[type='radio']:not([disabled])")].map(el => el.name)).size;
  });
  assert.equal(groups, 2);
  for (let i = 0; i < count; i++) {
    const control = controls.nth(i);
    await control.focus();
    await page.keyboard.press("Tab");
    assert.equal(await inside(), true, `Tab from control ${i}`);
    await control.focus();
    await page.keyboard.press("Shift+Tab");
    assert.equal(await inside(), true, `Shift+Tab from control ${i}`);
  }
  await page.locator("input[name='return-quarter']:checked").focus();
  await page.keyboard.press("Shift+Tab");
  assert.equal(await inside(), true);
  await page.locator("input[name='return-quarter']:checked").focus();
  const focusedBehind = await page.evaluate(() => {
    const behind = document.querySelector("[data-testid='behind']");
    behind.focus();
    return document.activeElement === behind;
  });
  assert.equal(focusedBehind, false);
  assert.equal(await inside(), true);
  await page.keyboard.press("Enter");
  assert.equal((await page.getByTestId("log").innerText()).includes("behind"), false);
  assert.equal(await page.getByTestId("return-sheet").count(), 1);
  assert.equal(await inside(), true);
}

test("tab and shift-tab stay inside the return sheet on Pixel 7 and iPhone 13", async () => {
  const targets = [
    { engine: chromium, device: devices["Pixel 7"] },
    { engine: webkit, device: devices["iPhone 13"] },
  ];
  for (const target of targets) {
    const launched = await launchEngine(target.engine);
    const context = await launched.newContext({ ...target.device });
    const page = await context.newPage();
    try {
      await focusStaysInside(page);
    } finally {
      await context.close();
      await launched.close();
    }
  }
});

test("both quarter choices fit at 320 and 390 and the focus trap stays shut", async () => {
  for (const width of [320, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 700 } });
    try {
      await page.goto(`${base}/return-dialog.html`, { waitUntil: "networkidle" });
      const sheet = page.getByTestId("return-sheet");
      await sheet.waitFor();
      const whole = page.getByTestId("return-whole-2");
      const back = page.getByTestId("return-back-2");
      await whole.waitFor();
      await back.waitFor();
      assert.match(await whole.innerText(), /Q2/);
      assert.match(await back.innerText(), /Q2 · 2nd half/);
      const wholeBox = await whole.boundingBox();
      const backBox = await back.boundingBox();
      assert.ok(wholeBox.height >= 44, `whole height ${wholeBox.height} at ${width}`);
      assert.ok(backBox.height >= 44, `back height ${backBox.height} at ${width}`);
      assert.ok(wholeBox.width >= 44, `whole width ${wholeBox.width} at ${width}`);
      assert.ok(backBox.width >= 44, `back width ${backBox.width} at ${width}`);
      const overflow = await page.evaluate(() => {
        const root = document.documentElement;
        const dialog = document.querySelector("[data-testid='return-sheet']");
        const row = document.querySelector("[data-testid='return-quarter-row-2']");
        return {
          doc: root.scrollWidth > root.clientWidth + 1,
          sheet: dialog.scrollWidth > dialog.clientWidth + 1,
          row: row.scrollWidth > row.clientWidth + 1,
        };
      });
      assert.deepEqual(overflow, { doc: false, sheet: false, row: false });
      assert.equal(await page.locator("input[name='return-quarter'][value='1']").isDisabled(), true);
      assert.equal(await page.locator("input[name='return-quarter'][value='1-back']").isDisabled(), true);
      assert.equal(await page.locator("input[name='return-quarter'][value='2']").isChecked(), true);
      await page.locator("input[name='return-quarter'][value='2-back']").check();
      assert.match(await page.locator("body").innerText(), /2nd half of Q2/);
      assert.equal(await page.getByTestId("return-mismatch").count(), 0);
      const inside = await page.evaluate(() => {
        const root = document.querySelector("[data-testid='return-sheet']");
        const list = [...root.querySelectorAll("button:not([disabled]), input:not([disabled])")];
        list[0].focus();
        return root.contains(document.activeElement);
      });
      assert.equal(inside, true);
      for (let i = 0; i < 12; i++) await page.keyboard.press("Tab");
      const still = await page.evaluate(() => {
        const root = document.querySelector("[data-testid='return-sheet']");
        return !!root && root.contains(document.activeElement);
      });
      assert.equal(still, true, `focus left the sheet at ${width}`);
    } finally {
      await page.close();
    }
  }
});

test("the After view shows a back-half returner who is off at the start", async () => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on("pageerror", error => errors.push(String(error)));
  try {
    await page.goto(`${base}/src/lib/harness/back-half.html`, { waitUntil: "networkidle" });
    const returner = await page.getByTestId("returner-id").getAttribute("data-player-id");
    const toggle = page.getByTestId("phase-toggle");
    await toggle.scrollIntoViewIfNeeded();
    await toggle.waitFor();
    const ids = () => page.locator("[data-testid^='field-player-']").evaluateAll(nodes => (
      nodes.map(node => node.getAttribute("data-player-id"))
    ));
    const startIds = await ids();
    assert.equal(startIds.includes(returner), false);
    await page.getByTestId("phase-after").click();
    await page.getByTestId("phase-caption").waitFor();
    const afterIds = await ids();
    assert.equal(afterIds.includes(returner), true);
    assert.notDeepEqual(afterIds, startIds);
    await page.getByRole("button", { name: "Share lineup" }).click();
    const sheet = page.getByTestId("share-sheet");
    await sheet.waitFor();
    assert.equal(await sheet.getAttribute("data-dual"), "true");
    assert.equal(errors.length, 0, errors.join("\n"));
  } finally {
    await page.close();
  }
});

test("escape and the backdrop leave the return dialog without a confirm", async () => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  try {
    await page.goto(`${base}/return-dialog.html`, { waitUntil: "networkidle" });
    await page.getByTestId("return-sheet").waitFor();
    await page.keyboard.press("Escape");
    assert.match(await page.getByTestId("log").innerText(), /cancel/);
    assert.equal(await page.getByTestId("return-sheet").count(), 0);
    await page.getByTestId("reopen").click();
    await page.getByTestId("return-sheet").waitFor();
    await page.mouse.click(8, 8);
    const log = await page.getByTestId("log").innerText();
    assert.equal(log.split("cancel").length - 1, 2);
    assert.equal(await page.getByTestId("return-sheet").count(), 0);
  } finally {
    await page.close();
  }
});
