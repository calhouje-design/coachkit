import test from "node:test";
import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import { createServer } from "vite";
import { chromium } from "playwright";
import { labelWidth } from "./fieldLayout.js";

const VIEWPORTS = [320, 360, 390, 430];
const EXPECTED = { 320: 196, 360: 236, 390: 266, 430: 306 };

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

test("real field labels are measured at phone field widths", async () => {
  const page = await browser.newPage();
  try {
    for (const viewport of VIEWPORTS) {
      await page.setViewportSize({ width: viewport, height: 900 });
      await page.goto(`${base}/field-label.html`, { waitUntil: "domcontentloaded" });
      const report = await page.evaluate(async (shot) => {
        const { layoutFieldPlayers, labelProbeCss, LABEL_WIDTH_GUARD } = await import("/src/lib/fieldLayout.js");
        const { FORMATION_TEMPLATES } = await import("/src/lib/formations.js");
        document.body.innerHTML = "";
        document.body.style.margin = "0";
        document.body.style.background = "#0a0d0f";
        document.body.style.fontFamily = "'Palatino Linotype','Book Antiqua',Palatino,Georgia,serif";
        const pageEl = document.createElement("div");
        pageEl.style.cssText = "width:100%;box-sizing:border-box;padding:0 16px;";
        const row = document.createElement("div");
        row.id = "pitch-row";
        row.style.cssText = "display:flex;gap:6px;align-items:stretch;";
        const bench = document.createElement("div");
        bench.textContent = "BENCH";
        bench.style.cssText = "width:76px;flex-shrink:0;box-sizing:content-box;padding:8px 4px;border:1px dashed rgba(255,255,255,0.22);color:#fff;font-size:9px;";
        const field = document.createElement("div");
        field.id = "field";
        field.style.cssText = "position:relative;flex:1 1 auto;min-width:0;";
        const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        svg.setAttribute("viewBox", "0 0 320 480");
        svg.style.cssText = "width:100%;display:block;";
        const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
        rect.setAttribute("x", "5");
        rect.setAttribute("y", "5");
        rect.setAttribute("width", "310");
        rect.setAttribute("height", "470");
        rect.setAttribute("rx", "8");
        rect.setAttribute("fill", "#1e4d1a");
        svg.appendChild(rect);
        field.appendChild(svg);
        row.append(bench, field);
        pageEl.appendChild(row);
        document.body.appendChild(pageEl);
        const fieldWidth = field.clientWidth;
        const fieldHeight = Math.round(svg.clientHeight || fieldWidth * 1.5);
        const fontFamily = getComputedStyle(document.body).fontFamily;
        const probe = document.createElement("span");
        probe.style.cssText = labelProbeCss(fontFamily);
        field.appendChild(probe);
        const cache = new Map();
        let probes = 0;
        const measureLabel = (text) => {
          const key = String(text ?? "");
          if (cache.has(key)) return cache.get(key);
          probe.textContent = key;
          const measured = probe.getBoundingClientRect().width;
          if (!(measured > 0)) throw new Error(`probe returned 0 for ${key}`);
          probes += 1;
          const width = Math.ceil(measured - 1e-9);
          cache.set(key, width);
          return width;
        };
        const paint = (positions, names, ontoField) => {
          const starters = positions.map((pos, i) => ({
            pos,
            player: { id: `p${i}`, name: names[i], number: String(i + 1) },
          }));
          const layout = layoutFieldPlayers(starters, { fieldWidth, fieldHeight, measureLabel });
          const host = document.createElement("div");
          host.dataset.sheet = "1";
          host.style.cssText = ontoField
            ? "position:absolute;inset:0;pointer-events:none;"
            : `position:relative;width:${fieldWidth}px;height:${fieldHeight}px;margin-top:8px;`;
          if (ontoField) field.appendChild(host);
          else document.body.appendChild(host);
          layout.forEach((spot, index) => {
            const mark = document.createElement("div");
            mark.style.cssText = `position:absolute;left:${spot.x}px;top:${spot.y - 23}px;width:46px;transform:translateX(-50%);text-align:center;`;
            const circle = document.createElement("div");
            circle.className = "circle";
            circle.style.cssText = "width:46px;height:46px;border-radius:50%;box-sizing:border-box;background:linear-gradient(135deg,#f4b942,#d99820);border:2px solid rgba(255,255,255,0.8);display:flex;flex-direction:column;align-items:center;justify-content:center;color:#1a1a1a;";
            circle.innerHTML = `<div style="font-size:9px;font-weight:800;line-height:1">${starters[index].player.number}</div><div style="font-size:8px;font-weight:800;line-height:1.1;margin-top:1px">${spot.pos}</div>`;
            mark.appendChild(circle);
            if (spot.labelBox) {
              const label = document.createElement("div");
              label.className = "name";
              label.title = spot.fullName;
              label.setAttribute("aria-label", spot.fullName);
              label.textContent = spot.label;
              const left = spot.labelBox.x - (spot.x - 23);
              label.style.cssText = [
                "position:absolute",
                `left:${left}px`,
                "top:48px",
                `width:${spot.labelBox.width}px`,
                `max-width:${spot.labelBox.width}px`,
                "box-sizing:border-box",
                "overflow:hidden",
                "text-overflow:ellipsis",
                "white-space:nowrap",
                "font-size:9px",
                "font-weight:800",
                "line-height:1.2",
                "letter-spacing:0.02em",
                "padding:1px 4px",
                "color:#fff",
                "background:rgba(10,13,15,0.78)",
                `font-family:${fontFamily}`,
              ].join(";");
              mark.appendChild(label);
            }
            host.appendChild(mark);
          });
          const circles = [...host.querySelectorAll(".circle")].map(el => el.getBoundingClientRect());
          let circleHits = 0;
          for (let a = 0; a < circles.length; a++) {
            for (let b = a + 1; b < circles.length; b++) {
              const left = circles[a];
              const right = circles[b];
              const hit = left.left < right.right - 0.5
                && left.right > right.left + 0.5
                && left.top < right.bottom - 0.5
                && left.bottom > right.top + 0.5;
              if (hit) circleHits += 1;
            }
          }
          const labels = [...host.querySelectorAll(".name")].map(el => ({
            title: el.getAttribute("title"),
            text: el.textContent,
            scroll: el.scrollWidth,
            client: el.clientWidth,
          }));
          return {
            circleHits,
            labels,
            spots: layout.map(spot => ({
              fullName: spot.fullName,
              label: spot.label,
              dy: spot.dy,
              line: spot.line,
              lineCount: spot.lineCount,
            })),
          };
        };
        const normal = ["Sam Keeper", "Blake Pete", "Jaxon Wells", "Wes Duda", "Trey Lazear", "Remi Brown", "Sean Jones", "Henry Davis"];
        const attack = paint(["GK", "LD", "CD", "CD", "RD", "LM", "RM", "CF"], normal, true);
        const shape = FORMATION_TEMPLATES["11v11"].find(item => item.name === "4-5-1");
        const eleven = [
          "Sam Keeper", "Blake Pete", "Jaxon Wells", "Wes Duda", "Trey Lazear",
          "Remi Brown", "Sean Jones", "Henry Davis", "Jude Garcia", "John Smith", "Max Cole",
        ];
        const wide = paint(shape.slots, eleven, false);
        wide && document.querySelectorAll("body > [data-sheet]").forEach(el => el.remove());
        return {
          fieldWidth,
          fieldHeight,
          guard: LABEL_WIDTH_GUARD,
          probes,
          jaxon: measureLabel("Jaxon Wells"),
          attack,
          wide,
        };
      }, viewport === 390 || viewport === 320);
      assert.equal(report.guard, 0, "flat width guard");
      assert.ok(report.probes > 0, "labels were measured in the page");
      assert.ok(report.jaxon > 0, "probe width");
      assert.ok(Math.abs(report.fieldWidth - EXPECTED[viewport]) <= 2, `${viewport} field ${report.fieldWidth}`);
      assert.equal(report.attack.circleHits, 0, `${viewport} 4-2-1 circles`);
      report.attack.labels.forEach(row => {
        if (row.text !== row.title) return;
        assert.ok(row.scroll <= row.client + 0.5, `${viewport} ${row.title} clips ${row.scroll}>${row.client}`);
      });
      if (viewport === 390) {
        report.attack.labels.forEach(row => assert.equal(row.text, row.title, row.title));
        assert.notEqual(report.jaxon, 0);
      }
      if (report.fieldWidth >= 46 * 5) {
        assert.equal(report.wide.circleHits, 0, `${viewport} 4-5-1 circles`);
      }
      if (viewport === 430) {
        const mids = report.wide.spots.filter(spot => spot.line === "mid");
        assert.equal(mids.length, 5);
        assert.deepEqual(mids.map(spot => spot.dy), [0, 0, 0, 0, 0]);
      }
      report.wide.labels.forEach(row => {
        if (row.text !== row.title) return;
        assert.ok(row.scroll <= row.client + 0.5, `${viewport} ${row.title} clips`);
      });
      if (viewport === 390 || viewport === 320) {
        await page.locator("#pitch-row").screenshot({ path: `/tmp/coachkit-field-${viewport}.png` });
      }
      assert.ok(labelWidth("Jaxon Wells") > 0);
    }
  } finally {
    await page.close();
  }
});
