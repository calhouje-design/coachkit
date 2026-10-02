import { useRef } from "react";

const GOLD = "#e8a020";

/**
 * Start | After subs. A radiogroup so arrow keys move the choice.
 * Swipe is a separate gesture on the field; this is the button equivalent.
 */
export function PhaseToggle({ phase = "start", onChange }) {
  const startRef = useRef(null);
  const afterRef = useRef(null);
  const choose = (next) => {
    if (next === phase) return;
    onChange?.(next);
    const node = next === "after" ? afterRef.current : startRef.current;
    node?.focus();
  };
  const onKeyDown = (event) => {
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      event.preventDefault();
      choose("after");
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      event.preventDefault();
      choose("start");
    }
  };
  const button = (id, label, ref) => {
    const selected = phase === id;
    return (
      <button
        key={id}
        ref={ref}
        type="button"
        role="radio"
        aria-checked={selected}
        tabIndex={selected ? 0 : -1}
        data-testid={`phase-${id}`}
        onClick={() => choose(id)}
        style={{
          flex: "1 1 0",
          minHeight: 44,
          minWidth: 0,
          padding: "8px 10px",
          border: "none",
          borderRadius: 8,
          cursor: "pointer",
          fontFamily: "inherit",
          fontSize: 14,
          fontWeight: 800,
          letterSpacing: "0.01em",
          background: selected ? `linear-gradient(180deg,#f2c14b,${GOLD})` : "transparent",
          color: selected ? "#0a0d0f" : "#e8e4dc",
        }}
      >
        {label}
      </button>
    );
  };
  return (
    <div
      role="radiogroup"
      aria-label="Lineup phase"
      data-testid="phase-toggle"
      onKeyDown={onKeyDown}
      style={{
        display: "flex",
        gap: 4,
        padding: 4,
        marginBottom: 8,
        borderRadius: 12,
        border: "1px solid rgba(232,160,32,0.45)",
        background: "rgba(0,0,0,0.28)",
      }}
    >
      {button("start", "Start", startRef)}
      {button("after", "After subs", afterRef)}
    </div>
  );
}

/** Horizontal swipe. A drag that starts on a player or control is left alone. */
export function usePhaseSwipe(enabled, onSwipe) {
  const start = useRef(null);
  const remember = (event) => {
    const origin = start.current;
    if (!origin || origin.id !== event.pointerId) return;
    origin.lastX = event.clientX;
    origin.lastY = event.clientY;
  };
  const onPointerDown = (event) => {
    if (!enabled) return;
    if (event.target?.closest?.("[data-drop],button,a,input,textarea,select")) return;
    start.current = {
      x: event.clientX,
      y: event.clientY,
      lastX: event.clientX,
      lastY: event.clientY,
      id: event.pointerId,
    };
    try {
      event.currentTarget.setPointerCapture?.(event.pointerId);
    } catch {
      /* capture can fail if the pointer is already gone */
    }
  };
  const finish = (event) => {
    const origin = start.current;
    if (!origin || origin.id !== event.pointerId) return;
    start.current = null;
    if (!enabled) return;
    const endX = Number.isFinite(event.clientX) ? event.clientX : origin.lastX;
    const endY = Number.isFinite(event.clientY) ? event.clientY : origin.lastY;
    const dx = (endX === origin.x && endY === origin.y ? origin.lastX : endX) - origin.x;
    const dy = (endX === origin.x && endY === origin.y ? origin.lastY : endY) - origin.y;
    if (Math.abs(dx) < 48 || Math.abs(dx) < Math.abs(dy) * 1.2) return;
    onSwipe?.(dx < 0 ? "after" : "start");
  };
  return {
    onPointerDown,
    onPointerMove: remember,
    onPointerUp: finish,
    onPointerCancel: finish,
  };
}
