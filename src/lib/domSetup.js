import { JSDOM } from "jsdom";

const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost" });
const { window } = dom;

globalThis.window = window;
globalThis.document = window.document;
globalThis.HTMLElement = window.HTMLElement;
globalThis.Node = window.Node;
globalThis.Element = window.Element;
globalThis.getComputedStyle = window.getComputedStyle.bind(window);
globalThis.MutationObserver = window.MutationObserver;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const observers = [];
globalThis.ResizeObserver = class ResizeObserver {
  constructor(callback) {
    this.callback = callback;
    this.disconnected = false;
    observers.push(this);
  }
  observe(target) { this.target = target; }
  unobserve() {}
  disconnect() { this.disconnected = true; }
};
globalThis.__resizeObservers = observers;

window.HTMLElement.prototype.getBoundingClientRect = function getBoundingClientRect() {
  let x = 0;
  let y = 0;
  let el = this;
  while (el && el !== window.document.documentElement) {
    const left = parseFloat(el.style?.left);
    const top = parseFloat(el.style?.top);
    if (Number.isFinite(left)) x += left;
    if (Number.isFinite(top)) y += top;
    el = el.parentElement;
  }
  const width = parseFloat(this.style?.width) || 0;
  const height = parseFloat(this.style?.height) || 0;
  return {
    x, y, left: x, top: y, width, height, right: x + width, bottom: y + height,
    toJSON() { return { x, y, width, height }; },
  };
};
