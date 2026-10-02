export const SAVE_IMAGE_HINT = "Press and hold the image, then tap Save to Photos.";

const REVOKE_DELAY_MS = 1000;

let overlay = null;

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
  return new File([blob], name, { type: "image/png" });
}

function canShareFile(file) {
  try {
    return typeof navigator !== "undefined"
      && typeof navigator.canShare === "function"
      && navigator.canShare({ files: [file] });
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
  URL.revokeObjectURL(overlay.url);
  overlay.root.remove();
  overlay = null;
}

function showHoldOverlay(blob) {
  dismissSaveOverlay();
  const url = URL.createObjectURL(blob);
  const root = document.createElement("div");
  root.dataset.testid = "save-image-overlay";
  root.setAttribute("role", "dialog");
  root.setAttribute("aria-modal", "true");
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
  close.addEventListener("click", () => dismissSaveOverlay());
  panel.append(hint, img, close);
  root.append(panel);
  document.body.appendChild(root);
  overlay = { root, url };
}

function fallback(file, filename) {
  try {
    objectUrlDownload(file, filename);
    return { ok: true, method: "download" };
  } catch {
    showHoldOverlay(file);
    return { ok: true, method: "overlay" };
  }
}

function deliver(blob, filename, title) {
  const file = asPngFile(blob, filename);
  const shareTitle = title || filename || file.name;
  if (canShareFile(file)) {
    let pending;
    try {
      pending = navigator.share({ files: [file], title: shareTitle });
    } catch (error) {
      if (error?.name === "AbortError") return Promise.resolve({ ok: false, reason: "abort" });
      return Promise.resolve(fallback(file, file.name));
    }
    return Promise.resolve(pending).then(
      () => ({ ok: true, method: "share" }),
      (error) => {
        if (error?.name === "AbortError") return { ok: false, reason: "abort" };
        return fallback(file, file.name);
      },
    );
  }
  return Promise.resolve(fallback(file, file.name));
}

/**
 * Save a PNG. Web Share runs in this turn when `blob` is already encoded,
 * so a tap can still open the iOS sheet. Pass a canvas only from a prepare step.
 */
export function saveImage({ blob, canvas, filename = "CoachKit.png", title } = {}) {
  if (blob) return deliver(blob, filename, title);
  if (canvas) return canvasToPngBlob(canvas).then((next) => deliver(next, filename, title));
  return Promise.resolve({ ok: false, reason: "missing" });
}
