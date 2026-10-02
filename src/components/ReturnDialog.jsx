import { useEffect, useId, useRef, useState } from "react";
import {
  availabilityCopy,
  mismatchCopy,
  pregameCopy,
  quarterChoices,
  returnHeading,
} from "../lib/returnDialog.js";

const C = {
  bg: "#141a12",
  border: "rgba(255,255,255,0.14)",
  gold: "#e8a020",
  text: "#e8e4dc",
  muted: "#7a7570",
  warn: "#e8a020",
};

function focusableIn(sheet) {
  if (!sheet) return [];
  return [...sheet.querySelectorAll(
    "button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href]",
  )];
}

function hideBackground(sheet) {
  const changed = [];
  let node = sheet;
  while (node && node.parentElement && node !== document.body && node !== document.documentElement) {
    for (const child of node.parentElement.children) {
      if (child === node) continue;
      changed.push({
        el: child,
        inert: child.inert,
        ariaHidden: child.getAttribute("aria-hidden"),
      });
      child.inert = true;
      child.setAttribute("aria-hidden", "true");
    }
    node = node.parentElement;
  }
  return () => {
    changed.forEach(({ el, inert, ariaHidden }) => {
      el.inert = inert;
      if (ariaHidden == null) el.removeAttribute("aria-hidden");
      else el.setAttribute("aria-hidden", ariaHidden);
    });
  };
}

function useDialogKeys(open, onCancel, sheetRef) {
  const cancelRef = useRef(onCancel);
  cancelRef.current = onCancel;
  useEffect(() => {
    if (!open) return undefined;
    const sheet = sheetRef.current;
    if (!sheet) return undefined;
    const previous = document.activeElement;
    const restoreBackground = hideBackground(sheet);
    const items = focusableIn(sheet);
    (items[0] || sheet).focus();
    const onKey = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        cancelRef.current?.();
        return;
      }
      if (event.key !== "Tab") return;
      const list = focusableIn(sheetRef.current);
      event.preventDefault();
      event.stopPropagation();
      if (!list.length) {
        sheetRef.current?.focus();
        return;
      }
      const index = list.indexOf(document.activeElement);
      if (index < 0) {
        list[0].focus();
        return;
      }
      const next = event.shiftKey
        ? (index - 1 + list.length) % list.length
        : (index + 1) % list.length;
      list[next].focus();
    };
    const onFocusIn = (event) => {
      const root = sheetRef.current;
      if (!root || root.contains(event.target)) return;
      const list = focusableIn(root);
      (list[0] || root).focus();
    };
    document.addEventListener("keydown", onKey, true);
    document.addEventListener("focusin", onFocusIn, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      document.removeEventListener("focusin", onFocusIn, true);
      restoreBackground();
      if (previous && typeof previous.focus === "function") previous.focus();
    };
  }, [open, sheetRef]);
}

export function ReturnDialog({
  open,
  player,
  selectedQuarter = 1,
  totalQuarters = 4,
  subMode = true,
  hasSheet = true,
  periodAbbrev = "Q",
  finished = [],
  outSince = null,
  liveQuarters = {},
  quarterLive = null,
  onCancel,
  onConfirm,
  onSwitchQuarter,
}) {
  const sheetRef = useRef(null);
  const titleId = useId();
  const { choices, defaultQuarter } = quarterChoices({
    totalQuarters,
    selectedQuarter,
    outSince: outSince ?? player?.injuredInQuarter,
    finished,
  });
  const [quarter, setQuarter] = useState(defaultQuarter);
  const [available, setAvailable] = useState(null);
  useDialogKeys(open, onCancel, sheetRef);

  if (!open || !player) return null;
  const heading = returnHeading(player, periodAbbrev);
  const chosen = choices.find(choice => choice.quarter === quarter) || null;
  const quarterOk = !!chosen && !chosen.disabled;
  const live = quarterOk && (typeof quarterLive === "function" ? !!quarterLive(quarter) : !!liveQuarters[quarter]);
  const copy = quarterOk
    ? availabilityCopy({ quarter, subMode, totalQuarters, periodAbbrev, live, name: player.name })
    : null;
  const mismatch = hasSheet && quarterOk && quarter !== Number(selectedQuarter)
    ? mismatchCopy({ selectedQuarter, chosenQuarter: quarter, periodAbbrev })
    : null;
  const canReturn = hasSheet ? quarterOk && available != null : true;

  const confirm = () => {
    if (!canReturn) return;
    if (!hasSheet) {
      onConfirm?.({ type: "mark-available" });
      return;
    }
    onConfirm?.({ type: "confirm", quarter, available });
  };

  return (
    <div
      data-testid="return-backdrop"
      onClick={onCancel}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 200,
        background: "rgba(0,0,0,0.55)",
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
      }}
    >
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        data-testid="return-sheet"
        onClick={event => event.stopPropagation()}
        style={{
          width: "min(390px, 100%)",
          maxHeight: "92vh",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          background: C.bg,
          color: C.text,
          borderRadius: "16px 16px 0 0",
          border: `1px solid ${C.border}`,
          borderBottom: "none",
          boxSizing: "border-box",
          fontFamily: "inherit",
          outline: "none",
        }}
      >
        <div style={{ overflow: "auto", padding: "16px 16px 8px", flex: "1 1 auto" }}>
        <div id={titleId} style={{ fontSize: 18, fontWeight: 800 }}>{heading.title}</div>
        <div style={{ fontSize: 13, color: C.muted, marginTop: 2, marginBottom: 14 }}>{heading.since}</div>

        {!hasSheet && (
          <div style={{ fontSize: 16, fontWeight: 700, lineHeight: 1.4, marginBottom: 16 }}>
            {pregameCopy(player)}
          </div>
        )}

        {hasSheet && (
          <>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>
              Returning for which quarter?
            </div>
            <div role="radiogroup" aria-label="Returning for which quarter?" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {choices.map(choice => {
                const checked = quarter === choice.quarter;
                return (
                  <label
                    key={choice.quarter}
                    style={{
                      minWidth: 44,
                      minHeight: 44,
                      padding: "0 10px",
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 6,
                      borderRadius: 10,
                      boxSizing: "border-box",
                      cursor: choice.disabled ? "default" : "pointer",
                      opacity: choice.disabled ? 0.4 : 1,
                      fontWeight: 800,
                      border: checked ? `2px solid ${C.gold}` : `1px solid ${C.border}`,
                      background: checked ? "rgba(232,160,32,0.16)" : "transparent",
                      color: checked ? C.gold : C.text,
                    }}
                  >
                    <input
                      type="radio"
                      name="return-quarter"
                      value={choice.quarter}
                      checked={checked}
                      disabled={choice.disabled}
                      onChange={() => {
                        setQuarter(choice.quarter);
                        setAvailable(null);
                      }}
                    />
                    {periodAbbrev}{choice.quarter}
                  </label>
                );
              })}
            </div>
            <div style={{ minHeight: 16, fontSize: 11, color: C.muted, margin: "4px 0 10px" }}>
              {choices.some(choice => choice.finished) ? "(done)" : ""}
            </div>

            {mismatch && (
              <div
                data-testid="return-mismatch"
                style={{
                  marginBottom: 12,
                  padding: "10px 12px",
                  borderRadius: 10,
                  background: "rgba(232,160,32,0.1)",
                  border: "1px solid rgba(232,160,32,0.4)",
                }}
              >
                <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>
                  ⚠ {mismatch.text}
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button
                    type="button"
                    onClick={() => onSwitchQuarter?.(quarter)}
                    style={chipButton(true)}
                  >
                    {mismatch.switchLabel}
                  </button>
                  <button type="button" data-testid="return-keep" style={chipButton(false)}>
                    {mismatch.keepLabel}
                  </button>
                </div>
              </div>
            )}

            {copy && (
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>{copy.question}</div>
                {copy.helper && (
                  <div data-testid="return-helper" style={{ fontSize: 13, color: C.muted, marginTop: -4, marginBottom: 8, lineHeight: 1.4 }}>
                    {copy.helper}
                  </div>
                )}
                <div role="radiogroup" aria-label={copy.question} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {[["yes", true, copy.yes], ["no", false, copy.no]].map(([key, value, label]) => (
                    <label
                      key={key}
                      style={{
                        minHeight: 44,
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        padding: "0 12px",
                        borderRadius: 10,
                        boxSizing: "border-box",
                        cursor: "pointer",
                        border: available === value ? `2px solid ${C.gold}` : `1px solid ${C.border}`,
                        background: available === value ? "rgba(232,160,32,0.12)" : "transparent",
                        fontSize: 14,
                        fontWeight: 700,
                      }}
                    >
                      <input
                        type="radio"
                        name="return-available"
                        value={key}
                        checked={available === value}
                        onChange={() => setAvailable(value)}
                      />
                      {label}
                    </label>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        </div>
        <div
          data-testid="return-actions"
          style={{
            position: "sticky",
            bottom: 0,
            flexShrink: 0,
            display: "flex",
            justifyContent: "flex-end",
            gap: 8,
            padding: "12px 16px calc(12px + env(safe-area-inset-bottom))",
            background: C.bg,
            borderTop: `1px solid ${C.border}`,
          }}
        >
          <button type="button" onClick={onCancel} style={actionButton(false)}>Cancel</button>
          <button
            type="button"
            data-testid="return-confirm"
            disabled={!canReturn}
            onClick={confirm}
            style={actionButton(true, !canReturn)}
          >
            {hasSheet ? "Return" : "Confirm"}
          </button>
        </div>
      </div>
    </div>
  );
}

function chipButton(primary) {
  return {
    minHeight: 44,
    minWidth: 44,
    padding: "0 12px",
    borderRadius: 10,
    cursor: "pointer",
    fontFamily: "inherit",
    fontWeight: 800,
    fontSize: 14,
    border: primary ? "1px solid rgba(232,160,32,0.7)" : "1px solid rgba(255,255,255,0.16)",
    background: primary ? "rgba(232,160,32,0.18)" : "transparent",
    color: primary ? "#e8a020" : "#e8e4dc",
  };
}

function actionButton(primary, disabled) {
  return {
    minHeight: 44,
    minWidth: 44,
    padding: "0 16px",
    borderRadius: 10,
    cursor: disabled ? "default" : "pointer",
    fontFamily: "inherit",
    fontWeight: 800,
    fontSize: 15,
    opacity: disabled ? 0.45 : 1,
    border: primary ? "none" : "1px solid rgba(255,255,255,0.16)",
    background: primary ? "#e8a020" : "transparent",
    color: primary ? "#0a0d0f" : "#e8e4dc",
  };
}
