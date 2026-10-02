import "./domSetup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { dismissSaveOverlay, SAVE_IMAGE_HINT, saveImage } from "./saveImage.js";

const FILENAME = "CoachKit_Field_Q1-Q4.png";
const TITLE = "CoachKit field";
const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function pngBlob() {
  return new Blob([Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3])], { type: "image/png" });
}

let tail = Promise.resolve();

function serial(name, fn) {
  test(name, () => {
    const run = tail.then(fn);
    tail = run.then(() => {}, () => {});
    return run;
  });
}

function stubNavigator({ canShare, share }) {
  const nav = globalThis.navigator;
  const previous = { canShare: nav.canShare, share: nav.share };
  nav.canShare = canShare;
  nav.share = share;
  return () => {
    nav.canShare = previous.canShare;
    nav.share = previous.share;
  };
}

function anchorProto() {
  return document.createElement("a").constructor.prototype;
}

serial("canShare true shares a PNG File in the same turn and does not fall back", async () => {
  dismissSaveOverlay();
  const seen = [];
  const clicks = [];
  const proto = anchorProto();
  const originalClick = proto.click;
  proto.click = function click() { clicks.push(this.href); };
  let shareCalled = false;
  const restore = stubNavigator({
    canShare(data) {
      seen.push(data);
      return true;
    },
    share(data) {
      shareCalled = true;
      seen.push(data);
      return Promise.resolve();
    },
  });
  try {
    const pending = saveImage({ blob: pngBlob(), filename: FILENAME, title: TITLE });
    assert.equal(shareCalled, true);
    const result = await pending;
    assert.equal(result.method, "share");
    assert.equal(seen[0].files.length, 1);
    assert.equal(seen[0].files[0] instanceof File, true);
    assert.equal(seen[0].files[0].name, FILENAME);
    assert.equal(seen[0].files[0].type, "image/png");
    assert.equal(seen[1].files[0], seen[0].files[0]);
    assert.equal(seen[1].title, TITLE);
    assert.equal(clicks.length, 0);
    assert.equal(document.querySelector("[data-testid='save-image-overlay']"), null);
  } finally {
    proto.click = originalClick;
    restore();
    dismissSaveOverlay();
  }
});

serial("AbortError is a quiet no-op with no download and no overlay", async () => {
  dismissSaveOverlay();
  const clicks = [];
  let objectUrls = 0;
  const proto = anchorProto();
  const originalClick = proto.click;
  const originalCreate = URL.createObjectURL;
  proto.click = function click() { clicks.push(this.href); };
  URL.createObjectURL = () => {
    objectUrls += 1;
    return "blob:http://localhost/should-not-run";
  };
  const restore = stubNavigator({
    canShare() { return true; },
    share() {
      const error = new Error("cancelled");
      error.name = "AbortError";
      return Promise.reject(error);
    },
  });
  try {
    const result = await saveImage({ blob: pngBlob(), filename: FILENAME, title: TITLE });
    assert.equal(result.reason, "abort");
    assert.equal(result.ok, false);
    assert.equal(clicks.length, 0);
    assert.equal(objectUrls, 0);
    assert.equal(document.querySelector("[data-testid='save-image-overlay']"), null);
    assert.equal(document.body.textContent.includes(SAVE_IMAGE_HINT), false);
  } finally {
    proto.click = originalClick;
    URL.createObjectURL = originalCreate;
    restore();
    dismissSaveOverlay();
  }
});

serial("without canShare the download anchor uses a blob URL", async () => {
  dismissSaveOverlay();
  const clicks = [];
  const proto = anchorProto();
  const originalClick = proto.click;
  proto.click = function click() { clicks.push({ href: this.href, download: this.download }); };
  const restore = stubNavigator({
    canShare() { return false; },
    share() { throw new Error("share should not run"); },
  });
  try {
    const result = await saveImage({ blob: pngBlob(), filename: FILENAME, title: TITLE });
    assert.equal(result.method, "download");
    assert.equal(clicks.length, 1);
    assert.equal(clicks[0].href.startsWith("blob:"), true, clicks[0].href);
    assert.equal(clicks[0].href.startsWith("data:"), false, clicks[0].href);
    assert.equal(clicks[0].download, FILENAME);
    assert.equal(document.querySelector("[data-testid='save-image-overlay']"), null);
  } finally {
    proto.click = originalClick;
    restore();
    dismissSaveOverlay();
  }
});

serial("an unsupported download attribute shows the long-press overlay", async () => {
  await expectOverlay(() => {
    const proto = anchorProto();
    const desc = Object.getOwnPropertyDescriptor(proto, "download");
    Object.defineProperty(proto, "download", {
      configurable: true,
      enumerable: true,
      get() { return undefined; },
      set() {},
    });
    return () => {
      if (desc) Object.defineProperty(proto, "download", desc);
      else delete proto.download;
    };
  });
});

serial("a throwing download shows the long-press overlay", async () => {
  await expectOverlay(() => {
    const proto = anchorProto();
    const originalClick = proto.click;
    proto.click = function click() { throw new Error("download blocked"); };
    return () => { proto.click = originalClick; };
  });
});

async function expectOverlay(install) {
  dismissSaveOverlay();
  const opened = [];
  const originalOpen = window.open;
  window.open = (...args) => { opened.push(args); return null; };
  const restoreNav = stubNavigator({
    canShare: undefined,
    share() { throw new Error("share should not run"); },
  });
  const restoreDom = install();
  try {
    const result = await saveImage({ blob: pngBlob(), filename: FILENAME, title: TITLE });
    assert.equal(result.method, "overlay");
    const root = document.querySelector("[data-testid='save-image-overlay']");
    assert.ok(root);
    assert.equal(root.querySelector("[data-testid='save-image-hint']").textContent, SAVE_IMAGE_HINT);
    const img = root.querySelector("[data-testid='save-image-preview']");
    const src = img.getAttribute("src") || "";
    assert.equal(src.startsWith("blob:"), true, src);
    assert.equal(src.startsWith("data:"), false, src);
    assert.equal(opened.length, 0);
    root.querySelector("button").click();
    assert.equal(document.querySelector("[data-testid='save-image-overlay']"), null);
  } finally {
    window.open = originalOpen;
    restoreDom();
    restoreNav();
    dismissSaveOverlay();
  }
}

async function sourceFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await sourceFiles(full));
    else if (/\.(js|jsx)$/.test(entry.name) && !/\.test\./.test(entry.name)) files.push(full);
  }
  return files;
}

test("image saves never assign a data URL or call toDataURL", async () => {
  const files = await sourceFiles(SRC);
  assert.ok(files.some((file) => file.endsWith(`${path.sep}saveImage.js`)));
  for (const file of files) {
    const text = await readFile(file, "utf8");
    assert.doesNotMatch(text, /href\s*=\s*["'`]data:/, file);
    assert.doesNotMatch(text, /toDataURL\s*\(/, file);
  }
});
