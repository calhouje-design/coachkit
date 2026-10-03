import test from "node:test";
import assert from "node:assert/strict";
import { access, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "vite";
import { chromium } from "playwright";

const SHAPES = ["4-4-2", "4-3-3", "4-2-3-1", "3-5-2", "5-3-2", "4-1-4-1", "3-4-3", "4-5-1"];
const GLYPH_CAP = 0.02;

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

function collectScript() {
  const markedNumbers = [...document.querySelectorAll("[data-jersey]")];
  const numbers = markedNumbers.length ? markedNumbers : [...document.querySelectorAll("[data-sub-to]")].flatMap(node => (
    [...node.querySelectorAll("div")].filter(el => /^\d+$/.test((el.textContent || "").trim())).slice(0, 1)
  ));
  const markedNames = [...document.querySelectorAll("[data-player-marker] [title]")];
  const names = markedNames.length ? markedNames : [...document.querySelectorAll("[data-sub-to]")].flatMap(node => {
    const label = node.parentElement?.querySelector("[title]");
    return label ? [label] : [];
  });
  const boxes = [];
  numbers.forEach(node => {
    const rect = node.getBoundingClientRect();
    boxes.push({
      kind: "number",
      who: `${node.textContent} ${node.closest("[aria-label]")?.getAttribute("aria-label") || ""}`,
      x: rect.x,
      y: rect.y,
      w: rect.width,
      h: rect.height,
    });
  });
  document.querySelectorAll("[data-sub-to]").forEach(node => {
    const rect = node.getBoundingClientRect();
    const r = Math.min(rect.width, rect.height) / 2 - 1;
    boxes.push({
      kind: "jersey",
      who: node.closest("[aria-label]")?.getAttribute("aria-label") || "jersey",
      x: rect.x,
      y: rect.y,
      w: rect.width,
      h: rect.height,
      disk: { cx: rect.x + rect.width / 2, cy: rect.y + rect.height / 2, r },
    });
  });
  names.forEach(node => {
    const rect = node.getBoundingClientRect();
    boxes.push({
      kind: "name",
      who: node.getAttribute("title") || "",
      x: rect.x,
      y: rect.y,
      w: rect.width,
      h: rect.height,
    });
  });
  return boxes;
}

async function changedPixels(page, shown, hidden, boxes) {
  return page.evaluate(async ({ shown: shownShot, hidden: hiddenShot, boxes: regions }) => {
    const load = (b64) => new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("shot failed"));
      img.src = `data:image/png;base64,${b64}`;
    });
    const withLines = await load(shownShot);
    const withoutLines = await load(hiddenShot);
    const canvas = document.createElement("canvas");
    canvas.width = withLines.width;
    canvas.height = withLines.height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    const read = (img) => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
      return ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    };
    const before = read(withLines);
    const after = read(withoutLines);
    const diffs = [];
    regions.forEach(box => {
      const x0 = Math.max(0, Math.floor(box.x));
      const y0 = Math.max(0, Math.floor(box.y));
      const x1 = Math.min(canvas.width, Math.ceil(box.x + box.w));
      const y1 = Math.min(canvas.height, Math.ceil(box.y + box.h));
      let changed = 0;
      let seen = 0;
      for (let y = y0; y < y1; y += 1) {
        for (let x = x0; x < x1; x += 1) {
          if (box.disk) {
            const dx = x + 0.5 - box.disk.cx;
            const dy = y + 0.5 - box.disk.cy;
            if (dx * dx + dy * dy > box.disk.r * box.disk.r) continue;
          }
          const i = (y * canvas.width + x) * 4;
          seen += 1;
          if (before[i] !== after[i] || before[i + 1] !== after[i + 1] || before[i + 2] !== after[i + 2] || before[i + 3] !== after[i + 3]) {
            changed += 1;
          }
        }
      }
      if (box.kind === "name") {
        let glyphs = 0;
        let covered = 0;
        for (let y = y0; y < y1; y += 1) {
          for (let x = x0; x < x1; x += 1) {
            const i = (y * canvas.width + x) * 4;
            if (after[i] < 180 || after[i + 1] < 180 || after[i + 2] < 180) continue;
            glyphs += 1;
            // A line under the translucent chip tints the fringe by a few levels.
            // Count the glyph as covered only when the ink itself moves.
            const ink = Math.abs(before[i] - after[i]) >= 40
              || Math.abs(before[i + 1] - after[i + 1]) >= 40
              || Math.abs(before[i + 2] - after[i + 2]) >= 40;
            if (ink) covered += 1;
          }
        }
        diffs.push({ kind: "name", who: box.who, changed, seen, glyphs, covered, ratio: glyphs ? covered / glyphs : 0 });
      } else if (changed > 0) {
        diffs.push({ kind: box.kind, who: box.who, changed, seen });
      }
    });
    return diffs;
  }, { shown, hidden, boxes });
}

function endDotScript() {
  const circles = [...document.querySelectorAll("[data-sub-to]")].map(node => {
    const rect = node.getBoundingClientRect();
    return {
      id: node.getAttribute("data-sub-to"),
      cx: rect.x + rect.width / 2,
      cy: rect.y + rect.height / 2,
      r: Math.min(rect.width, rect.height) / 2,
    };
  });
  const highlights = [...document.querySelectorAll("[data-sub-target]")].map(node => {
    const rect = node.getBoundingClientRect();
    return { cx: rect.x + rect.width / 2, cy: rect.y + rect.height / 2 };
  });
  const ends = document.querySelector("[data-sub-ends]");
  return {
    endsVisibility: ends ? getComputedStyle(ends).visibility : "missing",
    dots: [...document.querySelectorAll("[data-sub-end]")].map(node => {
      const rect = node.getBoundingClientRect();
      const cx = rect.x + rect.width / 2;
      const cy = rect.y + rect.height / 2;
      const id = node.getAttribute("data-sub-for");
      const target = circles.find(circle => circle.id === id) || null;
      const inside = circles.filter(circle => circle.id !== id && Math.hypot(cx - circle.cx, cy - circle.cy) < circle.r - 0.4);
      const highlight = !!target && highlights.some(ring => Math.hypot(ring.cx - target.cx, ring.cy - target.cy) < target.r + 12);
      return {
        id,
        inside: inside.length,
        highlight,
        rim: target ? Math.abs(Math.hypot(cx - target.cx, cy - target.cy) - target.r) : null,
      };
    }),
  };
}

async function settleRotation(page) {
  await page.bringToFront();
  for (let attempt = 0; attempt < 4; attempt += 1) {
    await page.evaluate(() => {
      window.dispatchEvent(new Event("orientationchange"));
    });
    try {
      await page.waitForFunction(() => {
        const node = document.querySelector("[data-sub-lines]");
        return node && getComputedStyle(node).visibility === "visible" && !!node.querySelector("polyline");
      }, { timeout: 1000 });
      return;
    } catch {
      /* A measure already queued for this frame can swallow the hide. Kick again. */
    }
  }
  assert.fail("sub lines stayed hidden after rotation");
}

function assertEndDots(report, label) {
  if (!report.dots.length) return;
  assert.equal(report.endsVisibility, "visible", `${label} end dots are hidden`);
  report.dots.forEach(dot => {
    assert.ok(dot.rim !== null && dot.rim < 3, `${label} ${dot.id} is ${dot.rim}px off its target`);
    assert.ok(dot.inside === 0 || dot.highlight, `${label} ${dot.id} sits inside ${dot.inside} neighbour(s) without a target highlight`);
  });
}

for (const shape of SHAPES) {
  test(`11v11 ${shape} numbers and names are unchanged when sub lines hide`, async () => {
    const page = await browser.newPage({ viewport: { width: 320, height: 640 }, deviceScaleFactor: 1 });
    const errors = [];
    page.on("pageerror", error => errors.push(String(error)));
    try {
      await page.goto(`${base}/src/lib/harness/coverage.html?shape=${encodeURIComponent(shape)}`, { waitUntil: "networkidle" });
      await page.locator("[data-pitch-svg]").waitFor();
      await page.waitForFunction(() => {
        const marked = document.querySelector("[data-jersey]");
        if (marked) return true;
        return [...document.querySelectorAll("[data-sub-to] div")].some(el => /^\d+$/.test((el.textContent || "").trim()));
      });
      await page.waitForFunction(() => {
        if (document.querySelector("[data-sub-lines] polyline")) return true;
        return [...document.querySelectorAll("svg")].some(svg => (
          !svg.hasAttribute("data-pitch-svg")
          && svg.querySelector("polyline")
          && getComputedStyle(svg).pointerEvents === "none"
        ));
      });
      await page.locator("[data-pitch-svg]").evaluate(node => node.scrollIntoView({ block: "start" }));
      await page.waitForTimeout(50);
      const fieldWidth = await page.locator("[data-pitch-svg]").evaluate(node => node.getBoundingClientRect().width);
      assert.ok(Math.abs(fieldWidth - 196) < 2, `${shape} field is ${fieldWidth}px`);
      assert.equal(await page.getByTestId("phase-start").getAttribute("aria-checked"), "true");
      const boxes = await page.evaluate(collectScript);
      const numbers = boxes.filter(box => box.kind === "number");
      const jerseys = boxes.filter(box => box.kind === "jersey");
      const names = boxes.filter(box => box.kind === "name");
      assert.equal(numbers.length, 11, `${shape} numbers ${numbers.length}`);
      assert.equal(jerseys.length, 11, `${shape} jerseys ${jerseys.length}`);
      assert.ok(names.length >= 11, `${shape} names ${names.length}`);
      boxes.forEach(box => {
        assert.ok(box.w > 0 && box.h > 0, `${shape} empty ${box.kind}`);
        assert.ok(box.y >= 0 && box.y + box.h <= 640, `${shape} ${box.kind} ${box.who} is off the viewport`);
      });
      const shown = await page.screenshot({ type: "png" });
      await page.evaluate(() => {
        const marked = [...document.querySelectorAll("[data-sub-lines]")];
        const layers = marked.length ? marked : [...document.querySelectorAll("svg")].filter(svg => (
          !svg.hasAttribute("data-pitch-svg")
          && svg.querySelector("polyline")
          && getComputedStyle(svg).pointerEvents === "none"
        ));
        layers.forEach(node => {
          node.style.visibility = "hidden";
        });
      });
      const hidden = await page.screenshot({ type: "png" });
      const diffs = await changedPixels(page, shown.toString("base64"), hidden.toString("base64"), boxes);
      const hard = diffs.filter(row => row.kind !== "name");
      const glyphs = diffs.filter(row => row.kind === "name");
      const over = glyphs.filter(row => row.glyphs > 0 && row.ratio > GLYPH_CAP);
      if (hard.length || over.length) {
        const dir = tmpdir();
        await writeFile(join(dir, `coverage-${shape}-shown.png`), shown);
        await writeFile(join(dir, `coverage-${shape}-hidden.png`), hidden);
      }
      assert.equal(errors.length, 0, errors.join("\n"));
      assert.deepEqual(hard, [], `${shape} pixels changed inside a number or a jersey`);
      assert.equal(glyphs.length, names.length, `${shape} measured ${glyphs.length} names`);
      const glyphPixels = glyphs.reduce((sum, row) => sum + row.glyphs, 0);
      assert.ok(glyphPixels >= 80, `${shape} only saw ${glyphPixels} name-glyph pixels`);
      over.forEach(row => {
        assert.ok(row.ratio <= GLYPH_CAP, `${shape} ${row.who} glyph coverage ${(row.ratio * 100).toFixed(2)}%`);
      });
      assertEndDots(await page.evaluate(endDotScript), `${shape} hidden`);
      if (shape === "4-5-1" || shape === "5-3-2") {
        const seam = await page.evaluate(endDotScript);
        assert.ok(seam.dots.length > 0, `${shape} draws an end dot`);
      }
      await settleRotation(page);
      assertEndDots(await page.evaluate(endDotScript), `${shape} after rotation`);
    } finally {
      await page.close();
    }
  });
}

for (const width of [320, 390]) {
  for (const shape of SHAPES) {
    test(`11v11 ${shape} end dots stay out of neighbouring circles at ${width}`, async () => {
      const page = await browser.newPage({ viewport: { width, height: 640 }, deviceScaleFactor: 1 });
      try {
        await page.goto(`${base}/src/lib/harness/coverage.html?shape=${encodeURIComponent(shape)}`, { waitUntil: "networkidle" });
        await page.locator("[data-pitch-svg]").waitFor();
        await page.waitForFunction(() => !!document.querySelector("[data-sub-lines] polyline"));
        await page.locator("[data-pitch-svg]").evaluate(node => node.scrollIntoView({ block: "start" }));
        const fieldWidth = await page.locator("[data-pitch-svg]").evaluate(node => node.getBoundingClientRect().width);
        const expected = width === 320 ? 196 : 266;
        assert.ok(Math.abs(fieldWidth - expected) < 3, `${shape} field is ${fieldWidth}px at ${width}`);
        assertEndDots(await page.evaluate(endDotScript), `${shape} ${width}`);
        await page.evaluate(() => {
          document.querySelectorAll("[data-sub-lines]").forEach(node => {
            node.style.visibility = "hidden";
          });
        });
        assertEndDots(await page.evaluate(endDotScript), `${shape} ${width} hidden`);
        await settleRotation(page);
        assertEndDots(await page.evaluate(endDotScript), `${shape} ${width} after rotation`);
      } finally {
        await page.close();
      }
    });
  }
}

test("a scroll plus a same-size resize keeps sub lines visible on every frame", async () => {
  const page = await browser.newPage({ viewport: { width: 320, height: 640 }, deviceScaleFactor: 1 });
  try {
    await page.goto(`${base}/src/lib/harness/coverage.html?shape=4-5-1`, { waitUntil: "networkidle" });
    await page.locator("[data-sub-lines]").waitFor();
    await page.waitForFunction(() => {
      const node = document.querySelector("[data-sub-lines]");
      return node && getComputedStyle(node).visibility === "visible" && !!node.querySelector("polyline");
    });
    const moved = await page.evaluate(() => {
      const field = document.querySelector("[data-pitch-svg]");
      const before = field.getBoundingClientRect().top;
      const scrollers = [document.scrollingElement, document.documentElement, document.body];
      let node = field.parentElement;
      while (node) {
        scrollers.push(node);
        node = node.parentElement;
      }
      for (let i = 0; i < scrollers.length; i += 1) {
        const scroller = scrollers[i];
        if (!scroller) continue;
        const previous = scroller.scrollTop;
        scroller.scrollTop = previous + 160;
        const after = field.getBoundingClientRect().top;
        if (Math.abs(after - before) > 8) return { before, after, tag: scroller.tagName || "" };
        scroller.scrollTop = previous;
      }
      window.scrollTo(0, 160);
      return { before, after: field.getBoundingClientRect().top, tag: "window" };
    });
    assert.ok(Math.abs(moved.after - moved.before) > 8, `field did not scroll (${moved.before} -> ${moved.after})`);
    await page.evaluate(() => {
      window.__frames = [];
      const tick = () => {
        const node = document.querySelector("[data-sub-lines]");
        window.__frames.push(node ? getComputedStyle(node).visibility : "missing");
        window.__raf = requestAnimationFrame(tick);
      };
      tick();
    });
    await page.evaluate(() => {
      window.dispatchEvent(new Event("resize"));
    });
    await page.waitForFunction(() => window.__frames.length >= 8);
    const frames = await page.evaluate(() => window.__frames.slice(0, 10));
    assert.ok(frames.length >= 8, `sampled ${frames.length} frames`);
    assert.deepEqual(frames.filter(frame => frame !== "visible"), []);
  } finally {
    await page.close();
  }
});
