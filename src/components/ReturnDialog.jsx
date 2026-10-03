import { useEffect, useId, useRef, useState } from "react";
import {
  availabilityCopy,
  pregameCopy,
  initialReturnSelection,
  quarterChoices,
  quarterClockSec,
  returnHeading,
  returnMismatch,
  returnOptionAvailability,
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
  clocks = {},
  viewingClock = 0,
  running = false,
  periodSeconds = 0,
  halfApplied = null,
  donorAvailable = null,
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
  const optionFor = (choice) => {
    if (!choice) return { whole: false, back: false, noDonor: false };
    const live = typeof quarterLive === "function"
      ? !!quarterLive(choice.quarter)
      : !!liveQuarters[choice.quarter];
    const options = returnOptionAvailability({
      disabled: choice.disabled,
      live,
      clock: quarterClockSec(choice.quarter, {
        clocks,
        viewingQuarter: selectedQuarter,
        viewingClock,
        running,
      }),
      periodSeconds,
      halfApplied: typeof halfApplied === "function" ? !!halfApplied(choice.quarter) : false,
      subMode,
    });
    const donor = typeof donorAvailable === "function" ? !!donorAvailable(choice.quarter) : true;
    return {
      whole: !!options.whole,
      back: !!options.back && donor,
      noDonor: !!options.back && !donor,
    };
  };
  const described = choices.map(choice => {
    const options = optionFor(choice);
    return {
      quarter: choice.quarter,
      disabled: choice.disabled,
      whole: options.whole,
      back: options.back,
      viewed: choice.quarter === defaultQuarter,
    };
  });
  const initialPick = initialReturnSelection(described);
  const [quarter, setQuarter] = useState(initialPick.quarter);
  const [half, setHalf] = useState(initialPick.half);
  const [available, setAvailable] = useState(null);
  useDialogKeys(open, onCancel, sheetRef);

  if (!open || !player) return null;
  const heading = returnHeading(player, periodAbbrev);
  const chosen = choices.find(choice => choice.quarter === quarter) || null;
  const chosenOptions = optionFor(chosen);
  const halfOpen = half === "back" ? chosenOptions.back : chosenOptions.whole;
  const quarterOk = !!chosen && halfOpen;
  const live = quarterOk && (typeof quarterLive === "function" ? !!quarterLive(quarter) : !!liveQuarters[quarter]);
  const copy = quarterOk
    ? availabilityCopy({ quarter, subMode, totalQuarters, periodAbbrev, live, name: player.name, half })
    : null;
  const mismatch = hasSheet && quarterOk
    ? returnMismatch({ selectedQuarter, chosenQuarter: quarter, periodAbbrev })
    : null;
  const canReturn = hasSheet ? quarterOk && available != null : true;

  const confirm = () => {
    if (!canReturn) return;
    if (!hasSheet) {
      onConfirm?.({ type: "mark-available" });
      return;
    }
    onConfirm?.({ type: "confirm", quarter, available, half });
  };

  const pickHalf = (nextQuarter, nextHalf) => {
    setQuarter(nextQuarter);
    setHalf(nextHalf);
    setAvailable(null);
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
            <div role="radiogroup" aria-label="Returning for which quarter?" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {choices.map(choice => {
                const options = optionFor(choice);
                return (
                  <div
                    key={choice.quarter}
                    data-testid={`return-quarter-row-${choice.quarter}`}
                    style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, minWidth: 0 }}
                  >
                    <HalfChoice
                      quarter={choice.quarter}
                      half="whole"
                      label={`${periodAbbrev}${choice.quarter}`}
                      checked={quarter === choice.quarter && half === "whole"}
                      disabled={!options.whole}
                      onPick={pickHalf}
                    />
                    <HalfChoice
                      quarter={choice.quarter}
                      half="back"
                      label={`${periodAbbrev}${choice.quarter} · 2nd half`}
                      checked={quarter === choice.quarter && half === "back"}
                      disabled={!options.back}
                      onPick={pickHalf}
                    />
                    {options.noDonor && (
                      <div
                        data-testid={`return-no-donor-${choice.quarter}`}
                        style={{ gridColumn: "1 / -1", fontSize: 11, color: C.muted, lineHeight: 1.3 }}
                      >
                        No one to swap at the half
                      </div>
                    )}
                  </div>
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

function HalfChoice({ quarter, half, label, checked, disabled, onPick }) {
  return (
    <label
      data-testid={`return-${half}-${quarter}`}
      style={{
        position: "relative",
        minWidth: 0,
        minHeight: 44,
        padding: "6px 8px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: 10,
        boxSizing: "border-box",
        cursor: disabled ? "default" : "pointer",
        opacity: disabled ? 0.4 : 1,
        fontWeight: 800,
        fontSize: 13,
        lineHeight: 1.15,
        textAlign: "center",
        overflow: "hidden",
        border: checked ? `2px solid ${C.gold}` : `1px solid ${C.border}`,
        background: checked ? "rgba(232,160,32,0.16)" : "transparent",
        color: checked ? C.gold : C.text,
      }}
    >
      <input
        type="radio"
        name="return-quarter"
        value={half === "whole" ? String(quarter) : `${quarter}-back`}
        checked={checked}
        disabled={disabled}
        onChange={() => onPick(quarter, half)}
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          margin: 0,
          opacity: 0,
          cursor: disabled ? "default" : "pointer",
        }}
      />
      <span style={{ minWidth: 0 }}>{label}</span>
    </label>
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
