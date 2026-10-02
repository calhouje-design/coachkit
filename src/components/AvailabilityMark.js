import { Fragment, createElement } from "react";
import { showDoneForToday, toggleRosterInjured, toggleRosterOut } from "../lib/playerStatus.js";

const muted = "#7a7570";

/** Shown on the game roster only while the player is still out or injured. */
export function AvailabilityMark({ player }) {
  if (!showDoneForToday(player)) return null;
  return createElement("span", {
    "data-testid": "done-for-today",
    style: {
      fontSize: 9,
      fontWeight: 800,
      color: muted,
      background: "rgba(255,255,255,0.08)",
      padding: "2px 6px",
      borderRadius: 3,
    },
  }, "Done for today");
}

function buttonStyle(active, color) {
  return {
    padding: "5px 10px",
    borderRadius: 6,
    border: `1px solid ${active ? color : "rgba(255,255,255,0.15)"}`,
    cursor: "pointer",
    fontSize: 11,
    fontWeight: 700,
    fontFamily: "inherit",
    background: active ? `${color}40` : "rgba(255,255,255,0.08)",
    color: active ? color : muted,
  };
}

/** Roster-tab Inj and Out. Both clear a stale done-for-today mark. */
export function RosterAvailabilityButtons({ player, onUpdate }) {
  return createElement(Fragment, null,
    createElement("button", {
      type: "button",
      "data-testid": "roster-inj",
      onClick: () => onUpdate(toggleRosterInjured(player)),
      style: {
        ...buttonStyle(!!player.injured, "#e74c3c"),
        background: player.injured ? "rgba(231,76,60,0.25)" : "rgba(255,255,255,0.08)",
      },
    }, player.injured ? "Return" : "Inj"),
    createElement("button", {
      type: "button",
      "data-testid": "roster-out",
      onClick: () => onUpdate(toggleRosterOut(player)),
      style: {
        ...buttonStyle(!!player.out, "#e67e22"),
        background: player.out ? "rgba(230,126,34,0.25)" : "rgba(255,255,255,0.08)",
      },
    }, player.out ? "Active" : "Out"),
  );
}
