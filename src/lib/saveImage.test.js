import "./domSetup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dismissSaveOverlay, resetSaveImageState, SAVE_ERROR_DISMISS_MS, SAVE_IMAGE_HINT, saveImage, SHARE_BUSY_MESSAGE } from "./saveImage.js";
import { defineSerial, link, SERIAL_TEST_TIMEOUT_MS } from "./testSerial.js";

const execFileAsync = promisify(execFile);

const FILENAME = "CoachKit_Field_Q1-Q4.png";
const TITLE = "CoachKit field";
const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function pngBlob() {
  return new Blob([Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3])], { type: "image/png" });
}

const serial = defineSerial(test, { cleanup: resetSaveImageState });

const VIEWPORT = { width: 390, height: 844 };

function parseOffset(value, size) {
  if (value == null) return null;
  const trimmed = String(value).trim();
  if (trimmed === "" || trimmed === "auto") return null;
  const px = /^(-?\d+(?:\.\d+)?)px$/.exec(trimmed);
  if (px) return Number(px[1]);
  const calc = /^calc\(50% - (-?\d+(?:\.\d+)?)px\)$/.exec(trimmed);
  if (calc) return size / 2 - Number(calc[1]);
  return null;
}

function hitBox(el, viewport = VIEWPORT) {
  if (!(el instanceof HTMLElement)) return null;
  if (el.style.pointerEvents === "none") return null;
  const left = parseOffset(el.style.left, viewport.width);
  const right = parseOffset(el.style.right, viewport.width);
  const top = parseOffset(el.style.top, viewport.height);
  const bottom = parseOffset(el.style.bottom, viewport.height);
  const width = parseOffset(el.style.width, viewport.width);
  const height = parseOffset(el.style.height, viewport.height);
  if (el.style.position === "fixed" && left != null && right != null && width == null) {
    const boxHeight = height ?? 44;
    const y = top != null ? top : viewport.height - (bottom ?? 0) - boxHeight;
    return { left, top: y, width: viewport.width - left - right, height: boxHeight };
  }
  if (width == null || height == null) return null;
  const x = left != null ? left : (right != null ? viewport.width - right - width : 0);
  const y = top != null ? top : (bottom != null ? viewport.height - bottom - height : 0);
  return { left: x, top: y, width, height };
}

function elementAt(x, y, viewport = VIEWPORT) {
  let found = null;
  let z = -Infinity;
  for (const el of document.body.querySelectorAll("*")) {
    const box = hitBox(el, viewport);
    if (!box) continue;
    if (x < box.left || x >= box.left + box.width || y < box.top || y >= box.top + box.height) continue;
    const rank = Number.parseInt(el.style.zIndex, 10);
    const next = Number.isFinite(rank) ? rank : 0;
    if (next >= z) {
      z = next;
      found = el;
    }
  }
  return found;
}

async function showErrorNote() {
  const originalCreate = URL.createObjectURL;
  URL.createObjectURL = () => { throw new Error("no blob url"); };
  const restore = stubNavigator({
    canShare() { return false; },
    share() { throw new Error("share should not run"); },
  });
  try {
    return await saveImage({ blob: pngBlob(), filename: FILENAME, title: TITLE });
  } finally {
    URL.createObjectURL = originalCreate;
    restore();
  }
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
    assert.equal(seen[0], seen[1]);
    assert.deepEqual(Object.keys(seen[0]), ["files"]);
    assert.equal(seen[0].title, undefined);
    assert.equal(seen[0].text, undefined);
    assert.equal(seen[0].url, undefined);
    assert.equal(seen[0].files.length, 1);
    assert.equal(seen[0].files[0] instanceof File, true);
    assert.equal(seen[0].files[0].name, FILENAME);
    assert.equal(seen[0].files[0].type, "image/png");
    assert.equal(typeof seen[0].files[0].lastModified, "number");
    assert.ok(seen[0].files[0].lastModified > 0);
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
    assert.equal(
      root.querySelector("[data-testid='save-image-hint']").textContent,
      "Press and hold the image, then tap Save to Photos (or Add to Photos).",
    );
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

function namedError(name, message) {
  const error = new Error(message);
  error.name = name;
  return error;
}

serial("a second tap while share is pending does not share or download", async () => {
  dismissSaveOverlay();
  let calls = 0;
  let release;
  const clicks = [];
  const proto = anchorProto();
  const originalClick = proto.click;
  proto.click = function click() { clicks.push(this.href); };
  const restore = stubNavigator({
    canShare() { return true; },
    share() {
      calls += 1;
      return new Promise((resolve) => { release = resolve; });
    },
  });
  try {
    const first = saveImage({ blob: pngBlob(), filename: FILENAME, title: TITLE });
    const second = await saveImage({ blob: pngBlob(), filename: FILENAME, title: TITLE });
    assert.equal(calls, 1);
    assert.equal(second.ok, false);
    assert.equal(second.reason, "pending");
    assert.equal(clicks.length, 0);
    release();
    assert.equal((await first).method, "share");
  } finally {
    proto.click = originalClick;
    restore();
    dismissSaveOverlay();
  }
});

serial("InvalidStateError is a cancel for both a sync throw and an async rejection", async () => {
  for (const mode of ["sync", "async"]) {
    dismissSaveOverlay();
    const clicks = [];
    const proto = anchorProto();
    const originalClick = proto.click;
    proto.click = function click() { clicks.push(this.href); };
    const restore = stubNavigator({
      canShare() { return true; },
      share() {
        const error = namedError("InvalidStateError", "share already open");
        if (mode === "sync") throw error;
        return Promise.reject(error);
      },
    });
    try {
      const result = await saveImage({ blob: pngBlob(), filename: FILENAME, title: TITLE });
      assert.equal(result.ok, false, mode);
      assert.equal(result.reason, "abort", mode);
      assert.equal(clicks.length, 0, mode);
      assert.equal(document.querySelector("[data-testid='save-image-overlay']"), null, mode);
    } finally {
      proto.click = originalClick;
      restore();
      dismissSaveOverlay();
    }
  }
});

serial("an async share rejection other than cancel shows the overlay and does not download", async () => {
  dismissSaveOverlay();
  const clicks = [];
  const proto = anchorProto();
  const originalClick = proto.click;
  proto.click = function click() { clicks.push(this.href); };
  const restore = stubNavigator({
    canShare() { return true; },
    share() { return Promise.reject(namedError("NotAllowedError", "blocked")); },
  });
  try {
    const result = await saveImage({ blob: pngBlob(), filename: FILENAME, title: TITLE });
    assert.equal(result.method, "overlay");
    assert.equal(clicks.length, 0);
    assert.ok(document.querySelector("[data-testid='save-image-overlay']"));
  } finally {
    proto.click = originalClick;
    restore();
    dismissSaveOverlay();
  }
});

serial("a sync share error other than cancel still uses the download fallback", async () => {
  dismissSaveOverlay();
  const clicks = [];
  const proto = anchorProto();
  const originalClick = proto.click;
  proto.click = function click() { clicks.push(this.download); };
  const restore = stubNavigator({
    canShare() { return true; },
    share() { throw namedError("NotAllowedError", "blocked"); },
  });
  try {
    const result = await saveImage({ blob: pngBlob(), filename: FILENAME, title: TITLE });
    assert.equal(result.method, "download");
    assert.deepEqual(clicks, [FILENAME]);
  } finally {
    proto.click = originalClick;
    restore();
    dismissSaveOverlay();
  }
});

serial("the download blob URL is revoked after 30 to 60 seconds", async () => {
  dismissSaveOverlay();
  const originalTimeout = globalThis.setTimeout;
  const originalCreate = URL.createObjectURL;
  const originalRevoke = URL.revokeObjectURL;
  const urls = [];
  const revoked = [];
  let scheduled = null;
  URL.createObjectURL = () => {
    const url = `blob:http://localhost/save-${urls.length}`;
    urls.push(url);
    return url;
  };
  URL.revokeObjectURL = (url) => { revoked.push(url); };
  globalThis.setTimeout = (fn, ms) => {
    scheduled = { fn, ms };
    return { unref() {} };
  };
  const proto = anchorProto();
  const originalClick = proto.click;
  proto.click = function click() {};
  const restore = stubNavigator({
    canShare() { return false; },
    share() { throw new Error("share should not run"); },
  });
  try {
    const result = await saveImage({ blob: pngBlob(), filename: FILENAME, title: TITLE });
    assert.equal(result.method, "download");
    assert.equal(urls.length, 1);
    assert.equal(revoked.length, 0);
    assert.ok(scheduled.ms >= 30000 && scheduled.ms <= 60000, `delay ${scheduled.ms}`);
    scheduled.fn();
    assert.deepEqual(revoked, urls);
  } finally {
    globalThis.setTimeout = originalTimeout;
    URL.createObjectURL = originalCreate;
    URL.revokeObjectURL = originalRevoke;
    proto.click = originalClick;
    restore();
    dismissSaveOverlay();
  }
});

serial("the overlay hint says to save or add the photo", async () => {
  dismissSaveOverlay();
  const proto = anchorProto();
  const desc = Object.getOwnPropertyDescriptor(proto, "download");
  Object.defineProperty(proto, "download", {
    configurable: true,
    enumerable: true,
    get() { return undefined; },
    set() {},
  });
  const restore = stubNavigator({
    canShare: undefined,
    share() { throw new Error("share should not run"); },
  });
  try {
    const result = await saveImage({ blob: pngBlob(), filename: FILENAME });
    assert.equal(result.method, "overlay");
    assert.equal(
      document.querySelector("[data-testid='save-image-hint']").textContent,
      "Press and hold the image, then tap Save to Photos (or Add to Photos).",
    );
  } finally {
    if (desc) Object.defineProperty(proto, "download", desc);
    else delete proto.download;
    restore();
    dismissSaveOverlay();
  }
});

serial("the overlay is labelled, traps the background, and restores focus when it closes", async () => {
  dismissSaveOverlay();
  const host = document.createElement("div");
  const opener = document.createElement("button");
  opener.textContent = "Save field image";
  host.append(opener);
  document.body.append(host);
  opener.focus();
  const proto = anchorProto();
  const desc = Object.getOwnPropertyDescriptor(proto, "download");
  Object.defineProperty(proto, "download", {
    configurable: true,
    enumerable: true,
    get() { return undefined; },
    set() {},
  });
  const originalRevoke = URL.revokeObjectURL;
  const revoked = [];
  URL.revokeObjectURL = (url) => {
    revoked.push(url);
    return originalRevoke.call(URL, url);
  };
  const restore = stubNavigator({
    canShare: undefined,
    share() { throw new Error("share should not run"); },
  });
  try {
    const result = await saveImage({ blob: pngBlob(), filename: FILENAME, title: TITLE });
    assert.equal(result.method, "overlay");
    const root = document.querySelector("[data-testid='save-image-overlay']");
    const hint = document.getElementById("save-image-hint");
    assert.equal(root.getAttribute("aria-labelledby"), hint.id);
    assert.equal(hint.textContent, SAVE_IMAGE_HINT);
    const close = root.querySelector("button");
    assert.equal(document.activeElement, close);
    const tab = new window.KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true });
    document.dispatchEvent(tab);
    assert.equal(tab.defaultPrevented, true);
    assert.equal(document.activeElement, close);
    const shiftTab = new window.KeyboardEvent("keydown", { key: "Tab", shiftKey: true, bubbles: true, cancelable: true });
    document.dispatchEvent(shiftTab);
    assert.equal(shiftTab.defaultPrevented, true);
    assert.equal(document.activeElement, close);
    const outside = document.createElement("button");
    outside.textContent = "Outside";
    document.body.append(outside);
    outside.focus();
    const pulled = new window.KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true });
    document.dispatchEvent(pulled);
    assert.equal(pulled.defaultPrevented, true);
    assert.equal(document.activeElement, close);
    outside.remove();
    assert.equal(host.inert, true);
    assert.equal(root.hasAttribute("inert"), false);
    const src = root.querySelector("[data-testid='save-image-preview']").getAttribute("src");
    hint.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    assert.equal(document.querySelector("[data-testid='save-image-overlay']"), root);
    root.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    assert.equal(document.querySelector("[data-testid='save-image-overlay']"), null);
    assert.equal(host.inert, false);
    assert.equal(document.activeElement, opener);
    assert.ok(revoked.includes(src), revoked.join(","));

    opener.focus();
    await saveImage({ blob: pngBlob(), filename: FILENAME, title: TITLE });
    const again = document.querySelector("[data-testid='save-image-overlay']");
    const againSrc = again.querySelector("[data-testid='save-image-preview']").getAttribute("src");
    const before = revoked.length;
    document.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
    assert.equal(document.querySelector("[data-testid='save-image-overlay']"), null);
    assert.equal(host.inert, false);
    assert.equal(document.activeElement, opener);
    assert.ok(revoked.slice(before).includes(againSrc));
  } finally {
    if (desc) Object.defineProperty(proto, "download", desc);
    else delete proto.download;
    URL.revokeObjectURL = originalRevoke;
    restore();
    host.remove();
    dismissSaveOverlay();
  }
});

serial("a share failure that cannot show the overlay still settles the promise", async () => {
  dismissSaveOverlay();
  const originalCreate = URL.createObjectURL;
  URL.createObjectURL = () => { throw new Error("no blob url"); };
  const unhandled = [];
  const onUnhandled = (reason) => { unhandled.push(reason); };
  process.on("unhandledRejection", onUnhandled);
  const restore = stubNavigator({
    canShare() { return true; },
    share() { return Promise.reject(namedError("NotAllowedError", "blocked")); },
  });
  try {
    const result = await saveImage({ blob: pngBlob(), filename: FILENAME, title: TITLE });
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(result.ok, false);
    assert.equal(result.reason, "error");
    assert.equal(unhandled.length, 0);
    assert.equal(document.querySelector("[data-testid='save-image-overlay']"), null);
  } finally {
    process.off("unhandledRejection", onUnhandled);
    URL.createObjectURL = originalCreate;
    restore();
    dismissSaveOverlay();
  }
});

function hungNavigator() {
  let calls = 0;
  const restore = stubNavigator({
    canShare() { return true; },
    share() {
      calls += 1;
      return new Promise(() => {});
    },
  });
  return { calls: () => calls, restore };
}

serial("three taps during a hung share show the busy message and only share once", async () => {
  const hung = hungNavigator();
  try {
    saveImage({ blob: pngBlob(), filename: FILENAME, title: TITLE });
    const second = await saveImage({ blob: pngBlob(), filename: FILENAME, title: TITLE });
    const third = await saveImage({ blob: pngBlob(), filename: FILENAME, title: TITLE });
    assert.equal(hung.calls(), 1);
    assert.equal(second.reason, "pending");
    assert.equal(third.reason, "pending");
    assert.equal(document.querySelector("[data-testid='save-image-busy']").textContent, SHARE_BUSY_MESSAGE);
  } finally {
    hung.restore();
  }
});

serial("a visibility event or pageshow clears a hung share so the next tap shares", async () => {
  const hung = hungNavigator();
  const previousVisibility = Object.getOwnPropertyDescriptor(document, "visibilityState");
  const previousHidden = Object.getOwnPropertyDescriptor(document, "hidden");
  try {
    saveImage({ blob: pngBlob(), filename: FILENAME, title: TITLE });
    await saveImage({ blob: pngBlob(), filename: FILENAME, title: TITLE });
    await saveImage({ blob: pngBlob(), filename: FILENAME, title: TITLE });
    assert.equal(hung.calls(), 1);
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
    Object.defineProperty(document, "hidden", { configurable: true, get: () => false });
    document.dispatchEvent(new window.Event("visibilitychange"));
    saveImage({ blob: pngBlob(), filename: FILENAME, title: TITLE });
    assert.equal(hung.calls(), 2);
    await saveImage({ blob: pngBlob(), filename: FILENAME, title: TITLE });
    window.dispatchEvent(new window.Event("pageshow"));
    saveImage({ blob: pngBlob(), filename: FILENAME, title: TITLE });
    assert.equal(hung.calls(), 3);
  } finally {
    if (previousVisibility) Object.defineProperty(document, "visibilityState", previousVisibility);
    else delete document.visibilityState;
    if (previousHidden) Object.defineProperty(document, "hidden", previousHidden);
    else delete document.hidden;
    hung.restore();
  }
});

serial("the 30s safety timer clears a hung share so the next tap shares", async () => {
  const originalTimeout = globalThis.setTimeout;
  const locks = [];
  globalThis.setTimeout = (fn, ms, ...args) => {
    if (ms === 30000) {
      locks.push(fn);
      return 0;
    }
    return originalTimeout(fn, ms, ...args);
  };
  const hung = hungNavigator();
  try {
    saveImage({ blob: pngBlob(), filename: FILENAME, title: TITLE });
    await saveImage({ blob: pngBlob(), filename: FILENAME, title: TITLE });
    await saveImage({ blob: pngBlob(), filename: FILENAME, title: TITLE });
    assert.equal(hung.calls(), 1);
    assert.equal(locks.length, 1);
    locks[0]();
    saveImage({ blob: pngBlob(), filename: FILENAME, title: TITLE });
    assert.equal(hung.calls(), 2);
  } finally {
    globalThis.setTimeout = originalTimeout;
    hung.restore();
  }
});

serial("the save error note clears after about 4 seconds", async () => {
  assert.ok(SAVE_ERROR_DISMISS_MS >= 3500 && SAVE_ERROR_DISMISS_MS <= 4500);
  const originalTimeout = globalThis.setTimeout;
  const dismissals = [];
  globalThis.setTimeout = (fn, ms, ...args) => {
    if (ms === SAVE_ERROR_DISMISS_MS) {
      dismissals.push(fn);
      return 0;
    }
    return originalTimeout(fn, ms, ...args);
  };
  try {
    const result = await showErrorNote();
    assert.equal(result.reason, "error");
    const note = document.querySelector("[data-testid='save-image-error']");
    assert.ok(note);
    assert.match(note.textContent, /Couldn't save the image/);
    assert.equal(dismissals.length, 1);
    dismissals[0]();
    assert.equal(document.querySelector("[data-testid='save-image-error']"), null);
  } finally {
    globalThis.setTimeout = originalTimeout;
  }
});

serial("a tap on the save error note dismisses it", async () => {
  await showErrorNote();
  const note = document.querySelector("[data-testid='save-image-error']");
  const box = hitBox(note);
  assert.ok(box);
  const hit = elementAt(box.left + box.width / 2, box.top + box.height / 2);
  assert.equal(hit, note);
  hit.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));
  assert.equal(document.querySelector("[data-testid='save-image-error']"), null);
});

serial("a Game Day control under the old error strip still receives taps", async () => {
  const button = document.createElement("button");
  button.type = "button";
  button.dataset.testid = "game-day-bench";
  button.textContent = "Bench";
  button.style.cssText = "position:fixed;left:16px;bottom:24px;width:36px;height:44px;z-index:1;";
  let taps = 0;
  button.addEventListener("click", () => { taps += 1; });
  document.body.appendChild(button);
  const point = { x: 28, y: VIEWPORT.height - 24 - 12 };
  const stretched = document.createElement("div");
  stretched.style.cssText = "position:fixed;left:16px;right:16px;bottom:24px;z-index:10060;pointer-events:auto;";
  document.body.appendChild(stretched);
  try {
    assert.equal(elementAt(point.x, point.y), stretched);
    stretched.remove();
    await showErrorNote();
    const note = document.querySelector("[data-testid='save-image-error']");
    assert.ok(note?.isConnected);
    const hit = elementAt(point.x, point.y);
    assert.equal(hit, button);
    hit.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));
    assert.equal(taps, 1);
    assert.ok(note.isConnected);
  } finally {
    stretched.remove();
    button.remove();
  }
});

serial("a share that finishes after the lock resets does not show an overlay or change the lock", async () => {
  const pendingShares = [];
  let calls = 0;
  const restore = stubNavigator({
    canShare() { return true; },
    share() {
      calls += 1;
      return new Promise((resolve, reject) => {
        pendingShares.push({ resolve, reject });
      });
    },
  });
  const originalTimeout = globalThis.setTimeout;
  const locks = [];
  globalThis.setTimeout = (fn, ms, ...args) => {
    if (ms === 30000) {
      locks.push(fn);
      return 0;
    }
    return originalTimeout(fn, ms, ...args);
  };
  const unhandled = [];
  const onUnhandled = (reason) => { unhandled.push(reason); };
  process.on("unhandledRejection", onUnhandled);
  try {
    const first = saveImage({ blob: pngBlob(), filename: FILENAME, title: TITLE });
    assert.equal(calls, 1);
    assert.equal(locks.length, 1);
    locks[0]();
    const second = saveImage({ blob: pngBlob(), filename: FILENAME, title: TITLE });
    assert.equal(calls, 2);
    const blocked = new Error("blocked");
    blocked.name = "NotAllowedError";
    pendingShares[0].reject(blocked);
    const staleReject = await first;
    assert.equal(staleReject.reason, "stale");
    assert.equal(document.querySelector("[data-testid='save-image-overlay']"), null);
    assert.equal(document.querySelector("[data-testid='save-image-error']"), null);
    assert.equal(document.querySelector("[data-testid='save-image-busy']"), null);
    const third = await saveImage({ blob: pngBlob(), filename: FILENAME, title: TITLE });
    assert.equal(third.reason, "pending");
    assert.equal(calls, 2);
    assert.equal(locks.length, 2);
    locks[1]();
    pendingShares[1].resolve();
    const staleResolve = await second;
    assert.equal(staleResolve.reason, "stale");
    assert.equal(document.querySelector("[data-testid='save-image-overlay']"), null);
    assert.equal(document.querySelector("[data-testid='save-image-error']"), null);
    saveImage({ blob: pngBlob(), filename: FILENAME, title: TITLE });
    assert.equal(calls, 3);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(unhandled.length, 0);
  } finally {
    process.off("unhandledRejection", onUnhandled);
    globalThis.setTimeout = originalTimeout;
    restore();
    dismissSaveOverlay();
  }
});

serial("a thrown blob fallback shows an error and does not reject", async () => {
  const originalCreate = URL.createObjectURL;
  URL.createObjectURL = () => { throw new Error("no blob url"); };
  const unhandled = [];
  const onUnhandled = (reason) => { unhandled.push(reason); };
  process.on("unhandledRejection", onUnhandled);
  const restore = stubNavigator({
    canShare() { return false; },
    share() { throw new Error("share should not run"); },
  });
  try {
    const result = await saveImage({ blob: pngBlob(), filename: FILENAME, title: TITLE });
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(result.ok, false);
    assert.equal(result.reason, "error");
    const note = document.querySelector("[data-testid='save-image-error']");
    assert.ok(note);
    assert.match(note.textContent, /Couldn't save the image/);
    assert.equal(document.querySelector("[data-testid='save-image-overlay']"), null);
    assert.equal(unhandled.length, 0);
  } finally {
    process.off("unhandledRejection", onUnhandled);
    URL.createObjectURL = originalCreate;
    restore();
  }
});

test("a hanging serial test fails on its own and the rest still run", async () => {
  assert.ok(SERIAL_TEST_TIMEOUT_MS >= 9000 && SERIAL_TEST_TIMEOUT_MS <= 11000);
  const dir = await mkdtemp(path.join(tmpdir(), "save-image-serial-"));
  const file = path.join(dir, "hang.test.js");
  const helper = pathToFileURL(path.join(path.dirname(fileURLToPath(import.meta.url)), "testSerial.js")).href;
  await writeFile(file, [
    'import test from "node:test";',
    `import { defineSerial } from ${JSON.stringify(helper)};`,
    "const serial = defineSerial(test, { timeoutMs: 5000, taskTimeoutMs: 200, cleanup() {} });",
    'serial("hangs", () => new Promise(() => {}));',
    'serial("after the hang", () => {});',
    "",
  ].join("\n"));
  let output = "";
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  try {
    const result = await execFileAsync(process.execPath, ["--test", "--test-reporter", "tap", file], { timeout: 8000, env });
    output = `${result.stdout}\n${result.stderr}`;
  } catch (error) {
    output = `${error.stdout ?? ""}\n${error.stderr ?? ""}`;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
  assert.match(output, /# tests 2\b/);
  assert.match(output, /# pass 1\b/);
  assert.match(output, /# fail 1\b/);
  assert.match(output, /# cancelled 0\b/);
  assert.match(output, /not ok \d+ - hangs/);
  assert.match(output, /ok \d+ - after the hang/);
});

test("a failing case does not cancel the case after it", async () => {
  let ran = false;
  let localTail = Promise.resolve();
  const first = link(() => localTail, (next) => { localTail = next; }, async () => {
    throw new Error("boom");
  });
  const second = link(() => localTail, (next) => { localTail = next; }, async () => {
    ran = true;
  });
  const stalled = new Promise((_, reject) => {
    setTimeout(() => reject(new Error("next case was cancelled")), 500);
  });
  await assert.rejects(first, /boom/);
  await Promise.race([second, stalled]);
  assert.equal(ran, true);
});

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

function dataUrlSaveViolations(text) {
  const hits = [];
  if (/\.toDataURL\s*\(/.test(text) || /\[["']toDataURL["']\]\s*\(/.test(text)) hits.push("toDataURL");
  if (/["'`]data:/.test(text)) hits.push("data-literal");
  return hits;
}

test("image saves never assign a data URL or call toDataURL", async () => {
  const files = await sourceFiles(SRC);
  assert.ok(files.some((file) => file.endsWith(`${path.sep}saveImage.js`)));
  for (const file of files) {
    const text = await readFile(file, "utf8");
    assert.deepEqual(dataUrlSaveViolations(text), [], file);
  }
  const evasions = [
    "el.setAttribute('href','data:image/png;base64,abc')",
    "el.setAttribute(\"href\", \"data:image/png,xx\")",
    "const href = \"data:image/png;base64,abc\"; link.href = href;",
    "const href = 'data:text/plain,hi'; link.setAttribute('href', href);",
    "window.open('data:text/html,hi')",
    "window.open(`data:image/png;base64,abc`)",
    "canvas['toDataURL']()",
    "canvas[\"toDataURL\"]()",
    "canvas.toDataURL()",
  ];
  for (const sample of evasions) {
    assert.ok(dataUrlSaveViolations(sample).length > 0, sample);
  }
  const safe = [
    "const url = URL.createObjectURL(blob); link.href = url;",
    "link.setAttribute('href', url);",
    "data: player,",
    "root.setAttribute('role', 'dialog');",
  ].join("\n");
  assert.deepEqual(dataUrlSaveViolations(safe), []);
});
