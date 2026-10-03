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
    assert.equal(document.activeElement, root.querySelector("button"));
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
  const app = await readFile(path.join(SRC, "App.jsx"), "utf8");
  assert.match(app, /saveImage\(\{ blob: file, filename, title \}\)\.catch\(\(\) => \{\}\)/);
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
