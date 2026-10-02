import test from "node:test";
import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import { layoutFieldPlayers } from "./fieldLayout.js";

const CHROME = "/usr/bin/google-chrome";
const WIDTHS = [360, 390, 430];
const SHAPE = ["GK", "LD", "CD", "CD", "RD", "LM", "RM", "CF"];
const NORMAL = ["Sam Keeper", "Blake Pete", "Owen Clark", "Wes Johnson", "Trey Lazear", "Remi Brown", "Sean Jones", "Henry Davis"];
const LONG = ["Maddox Anderson", "Jaxon Wells", "Christopher Stone", "Wes Duda", "Trey Lazear", "Remi Brown", "Sean Jones", "Henry Davis"];

function starters(names) {
  return SHAPE.map((pos, i) => ({
    pos,
    player: { id: `p${i}`, name: names[i], number: String(i + 1) },
  }));
}

function pageHtml(layout) {
  const labels = layout.filter(spot => spot.labelBox).map(spot => (
    `<div class="name" title="${spot.fullName}" style="width:${spot.labelBox.width}px">${spot.label}</div>`
  )).join("");
  return `<!doctype html><html><head><style>
    .name { box-sizing: border-box; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
      font-family: Georgia, serif; font-size: 9px; font-weight: 800; line-height: 1.2;
      letter-spacing: 0.02em; padding: 1px 4px; }
  </style></head><body>${labels}</body></html>`;
}

async function openBrowser() {
  try {
    await access(CHROME);
    const puppeteer = await import("puppeteer-core");
    return puppeteer.default.launch({
      executablePath: CHROME,
      headless: "new",
      args: ["--no-sandbox", "--disable-gpu"],
    });
  } catch {
    return null;
  }
}

test("4-2-1 name labels are not clipped at 360, 390, and 430", async (t) => {
  const browser = await openBrowser();
  if (!browser) {
    t.skip("Chrome or puppeteer-core is not available");
    return;
  }
  try {
    const page = await browser.newPage();
    for (const fieldWidth of WIDTHS) {
      for (const [kind, names] of [["normal", NORMAL], ["long", LONG]]) {
        const layout = layoutFieldPlayers(starters(names), {
          fieldWidth,
          fieldHeight: fieldWidth * 1.5,
        });
        await page.setContent(pageHtml(layout), { waitUntil: "domcontentloaded" });
        const rows = await page.evaluate(() => [...document.querySelectorAll(".name")].map(el => ({
          title: el.getAttribute("title"),
          text: el.textContent,
          scroll: el.scrollWidth,
          client: el.clientWidth,
        })));
        rows.forEach(row => {
          if (row.text !== row.title) return;
          assert.ok(
            row.scroll <= row.client + 0.5,
            `${kind} ${fieldWidth} ${row.title} overflows ${row.scroll} > ${row.client}`,
          );
        });
        if (kind === "normal" && fieldWidth === 390) {
          rows.forEach(row => assert.equal(row.text, row.title, row.title));
        }
      }
    }
    await page.close();
  } finally {
    await browser.close();
  }
});
