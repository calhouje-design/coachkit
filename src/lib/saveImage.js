export const SAVE_IMAGE_HINT = "Press and hold the image, then tap Save to Photos (or Add to Photos).";

const REVOKE_DELAY_MS = 45000;
const SHARE_LOCK_MS = 30000;
export const SHARE_BUSY_MESSAGE = "Still sharing… try again in a moment";
export const SAVE_ERROR_DISMISS_MS = 4000;
const SAVE_ERROR_MESSAGE = "Couldn't save the image. Try again.";

let overlay = null;
let shareInFlight = false;
let shareGeneration = 0;
let shareTimer = null;
let shareWatchers = false;
let busyNote = null;
let busyTimer = null;
let errorNote = null;
let errorTimer = null;

function isShareCancel(error) {
  const name = error?.name;
  return name === "AbortError" || name === "InvalidStateError";
}

function resetShareFlight() {
  shareGeneration += 1;
  shareInFlight = false;
  if (shareTimer) {
    clearTimeout(shareTimer);
    shareTimer = null;
  }
}

function releaseShare(generation) {
  if (generation !== shareGeneration) return;
  shareInFlight = false;
  if (shareTimer) {
    clearTimeout(shareTimer);
    shareTimer = null;
  }
}

function ensureShareWatchers() {
  if (shareWatchers || typeof document === "undefined") return;
  shareWatchers = true;
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") resetShareFlight();
  });
  window.addEventListener("pageshow", () => {
    resetShareFlight();
  });
}

function armShareWatch() {
  const generation = ++shareGeneration;
  shareInFlight = true;
  if (shareTimer) clearTimeout(shareTimer);
  shareTimer = setTimeout(() => {
    if (generation !== shareGeneration) return;
    resetShareFlight();
  }, SHARE_LOCK_MS);
  shareTimer.unref?.();
  ensureShareWatchers();
  return generation;
}

function showShareBusy() {
  if (!busyNote?.isConnected) {
    const note = document.createElement("div");
    note.dataset.testid = "save-image-busy";
    note.setAttribute("role", "status");
    note.textContent = SHARE_BUSY_MESSAGE;
    note.style.cssText = [
      "position:fixed",
      "left:16px",
      "right:16px",
      "bottom:24px",
      "z-index:10060",
      "background:#141a12",
      "color:#e8e4dc",
      "border:1px solid rgba(255,255,255,0.12)",
      "border-radius:10px",
      "padding:12px 14px",
      "font:700 14px Georgia,serif",
      "text-align:center",
    ].join(";");
    document.body.appendChild(note);
    busyNote = note;
  }
  if (busyTimer) clearTimeout(busyTimer);
  busyTimer = setTimeout(() => {
    busyNote?.remove();
    busyNote = null;
    busyTimer = null;
  }, 2400);
  busyTimer.unref?.();
}

function dismissSaveError() {
  if (errorTimer) clearTimeout(errorTimer);
  errorTimer = null;
  errorNote?.remove();
  errorNote = null;
}

function showSaveError() {
  dismissSaveError();
  const note = document.createElement("div");
  note.dataset.testid = "save-image-error";
  note.setAttribute("role", "alert");
  note.textContent = SAVE_ERROR_MESSAGE;
  note.style.cssText = [
    "position:fixed",
    "left:calc(50% - 130px)",
    "bottom:24px",
    "width:260px",
    "height:64px",
    "box-sizing:border-box",
    "z-index:10060",
    "pointer-events:auto",
    "background:#141a12",
    "color:#e8e4dc",
    "border:1px solid rgba(255,255,255,0.12)",
    "border-radius:10px",
    "padding:10px 12px",
    "font:700 14px Georgia,serif",
    "line-height:1.3",
    "text-align:center",
    "cursor:pointer",
  ].join(";");
  note.addEventListener("click", (event) => {
    event.stopPropagation();
    dismissSaveError();
  });
  document.body.appendChild(note);
  errorNote = note;
  const shown = note;
  errorTimer = setTimeout(() => {
    if (errorNote !== shown) return;
    dismissSaveError();
  }, SAVE_ERROR_DISMISS_MS);
  errorTimer.unref?.();
}

export function resetSaveImageState() {
  resetShareFlight();
  dismissSaveOverlay();
  if (busyTimer) clearTimeout(busyTimer);
  busyTimer = null;
  busyNote?.remove();
  busyNote = null;
  dismissSaveError();
}

export function canvasToPngBlob(canvas) {
  return new Promise((resolve, reject) => {
    if (!canvas || typeof canvas.toBlob !== "function") {
      reject(new Error("Canvas cannot encode a PNG."));
      return;
    }
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Canvas PNG was empty."));
    }, "image/png");
  });
}

function asPngFile(blob, filename) {
  const name = filename || "CoachKit.png";
  if (typeof File !== "undefined" && blob instanceof File && blob.type === "image/png" && blob.name === name) {
    return blob;
  }
  return new File([blob], name, { type: "image/png", lastModified: Date.now() });
}

function canSharePayload(payload) {
  try {
    return typeof navigator !== "undefined"
      && typeof navigator.canShare === "function"
      && navigator.canShare(payload);
  } catch {
    return false;
  }
}

function downloadSupported() {
  try {
    const link = document.createElement("a");
    return typeof link.download === "string";
  } catch {
    return false;
  }
}

function objectUrlDownload(blob, filename) {
  if (!downloadSupported()) {
    const error = new Error("download unsupported");
    error.name = "DownloadUnsupported";
    throw error;
  }
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.rel = "noopener";
  document.body.appendChild(link);
  try {
    link.click();
  } catch (error) {
    link.remove();
    URL.revokeObjectURL(url);
    throw error;
  }
  const timer = setTimeout(() => {
    link.remove();
    URL.revokeObjectURL(url);
  }, REVOKE_DELAY_MS);
  timer.unref?.();
}

export function dismissSaveOverlay() {
  if (!overlay) return;
  const { root, url, returnFocus, inerted, onKey } = overlay;
  overlay = null;
  URL.revokeObjectURL(url);
  if (onKey) document.removeEventListener("keydown", onKey);
  for (const node of inerted) {
    if (node.isConnected) node.inert = false;
  }
  root.remove();
  if (returnFocus?.isConnected) returnFocus.focus();
}

function showHoldOverlay(blob) {
  const returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  dismissSaveOverlay();
  const url = URL.createObjectURL(blob);
  const root = document.createElement("div");
  root.dataset.testid = "save-image-overlay";
  root.setAttribute("role", "dialog");
  root.setAttribute("aria-modal", "true");
  root.setAttribute("aria-labelledby", "save-image-hint");
  root.style.cssText = [
    "position:fixed",
    "inset:0",
    "z-index:10050",
    "background:rgba(0,0,0,0.88)",
    "display:flex",
    "align-items:center",
    "justify-content:center",
    "padding:16px",
    "box-sizing:border-box",
  ].join(";");
  const panel = document.createElement("div");
  panel.style.cssText = [
    "background:#141a12",
    "color:#e8e4dc",
    "border-radius:16px",
    "max-width:420px",
    "width:100%",
    "max-height:92vh",
    "overflow:auto",
    "padding:16px",
    "border:1px solid rgba(255,255,255,0.08)",
    "box-sizing:border-box",
    "font-family:Georgia,serif",
  ].join(";");
  const hint = document.createElement("p");
  hint.id = "save-image-hint";
  hint.dataset.testid = "save-image-hint";
  hint.textContent = SAVE_IMAGE_HINT;
  hint.style.cssText = "margin:0 0 12px;font-size:15px;line-height:1.45;font-weight:700;";
  const img = document.createElement("img");
  img.dataset.testid = "save-image-preview";
  img.alt = "Lineup image";
  img.src = url;
  img.style.cssText = "width:100%;height:auto;display:block;border-radius:8px;background:#0c1409;-webkit-touch-callout:default;";
  const close = document.createElement("button");
  close.type = "button";
  close.textContent = "Close";
  close.style.cssText = "margin-top:12px;width:100%;min-height:44px;border:none;border-radius:7px;background:#fff;color:#1a1a1a;font-weight:700;font-size:14px;cursor:pointer;";
  close.addEventListener("click", (event) => {
    event.stopPropagation();
    dismissSaveOverlay();
  });
  panel.append(hint, img, close);
  root.append(panel);
  root.addEventListener("click", (event) => {
    event.stopPropagation();
    if (event.target === root) dismissSaveOverlay();
  });
  const onKey = (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      dismissSaveOverlay();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = [...root.querySelectorAll("button, a[href], input, select, textarea, [tabindex]")]
      .filter((el) => !el.disabled && el.tabIndex !== -1);
    if (focusable.length === 0) {
      event.preventDefault();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement;
    if (event.shiftKey) {
      if (active === first || !root.contains(active)) {
        event.preventDefault();
        last.focus();
      }
    } else if (active === last || !root.contains(active)) {
      event.preventDefault();
      first.focus();
    }
  };
  const inerted = [];
  for (const child of document.body.children) {
    if (child.inert) continue;
    child.inert = true;
    inerted.push(child);
  }
  document.body.appendChild(root);
  document.addEventListener("keydown", onKey);
  overlay = { root, url, returnFocus, inerted, onKey };
  close.focus();
}

function fallback(file, filename) {
  try {
    objectUrlDownload(file, filename);
    return { ok: true, method: "download" };
  } catch {
    return settleOverlay(file);
  }
}

function settleOverlay(file) {
  try {
    showHoldOverlay(file);
    return { ok: true, method: "overlay" };
  } catch {
    showSaveError();
    return { ok: false, reason: "error" };
  }
}

function deliver(blob, filename) {
  const file = asPngFile(blob, filename);
  const payload = { files: [file] };
  if (!canSharePayload(payload)) return Promise.resolve(fallback(file, file.name));
  let pending;
  const generation = armShareWatch();
  try {
    pending = navigator.share(payload);
  } catch (error) {
    releaseShare(generation);
    if (isShareCancel(error)) return Promise.resolve({ ok: false, reason: "abort" });
    return Promise.resolve(fallback(file, file.name));
  }
  return Promise.resolve(pending).then(
    () => {
      if (generation !== shareGeneration) return { ok: false, reason: "stale" };
      return { ok: true, method: "share" };
    },
    (error) => {
      if (generation !== shareGeneration) return { ok: false, reason: "stale" };
      return isShareCancel(error) ? { ok: false, reason: "abort" } : settleOverlay(file);
    },
  ).finally(() => {
    releaseShare(generation);
  });
}

/**
 * Save a PNG. Web Share runs in this turn when `blob` is already encoded,
 * so a tap can still open the iOS sheet. Pass a canvas only from a prepare step.
 */
export function showHoldToSave(blob) {
  if (!blob) return;
  try {
    showHoldOverlay(blob);
  } catch {
    showSaveError();
  }
}

export function saveImage({ blob, canvas, filename = "CoachKit.png" } = {}) {
  if (shareInFlight) {
    showShareBusy();
    return Promise.resolve({ ok: false, reason: "pending" });
  }
  try {
    const settled = (promise) => Promise.resolve(promise).catch(() => {
      showSaveError();
      return { ok: false, reason: "error" };
    });
    if (blob) return settled(deliver(blob, filename));
    if (canvas) return canvasToPngBlob(canvas).then((next) => deliver(next, filename)).catch(() => {
      showSaveError();
      return { ok: false, reason: "error" };
    });
    return Promise.resolve({ ok: false, reason: "missing" });
  } catch {
    resetShareFlight();
    showSaveError();
    return Promise.resolve({ ok: false, reason: "error" });
  }
}
