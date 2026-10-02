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
