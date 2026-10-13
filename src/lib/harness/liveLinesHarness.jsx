import { useState } from "react";
import { createRoot } from "react-dom/client";
import { TabGame } from "../../App.jsx";
import { scheduleHalfRotation } from "../gameDay.js";
import { FORMATION_TEMPLATES } from "../formations.js";
import { resolveSetup } from "../leagueRules.js";

const params = new URLSearchParams(window.location.search);
const format = params.get("format") || "8v8";
const seed = Number(params.get("seed") || 1);
const shapeName = params.get("shape") || "";
const shape = FORMATION_TEMPLATES[format].find(item => item.name === shapeName) || FORMATION_TEMPLATES[format][0];
const extra = Number(params.get("extra") || (format === "11v11" ? 5 : 4));
const FIRST = ["Ann", "Bea", "Cal", "Dee", "Eve", "Fay", "Gia", "Hal", "Ivy", "Jon", "Kai", "Lou", "Max", "Noa", "Rex", "Sam"];
const LAST = ["Stone", "Rivers", "Ng", "Poe", "Ray", "Fields", "Banks", "Wells", "Ford", "Lake", "Cross", "Sun", "Kay", "Lee", "Ortiz", "Park"];
const positions = ["GK", "LD", "CD", "RD", "LB", "CB", "RB", "LM", "CM", "RM", "LF", "CF", "RF"];

const players = Array.from({ length: shape.slots.length + extra }, (_, index) => ({
  id: `p${index + 1}`,
  name: `${FIRST[index]} ${LAST[index]}`,
  number: String(index + 1),
  positions,
  injured: false,
  out: false,
  ratings: {},
}));

const opened = scheduleHalfRotation(players, shape.slots, { minHalves: 4, totalQuarters: 4, seed });
const bank = Object.fromEntries((params.get("bank") || "").split(",").filter(Boolean).map((value, index) => [`p${index + 1}`, Number(value)]));
const league = format === "11v11" ? "U13" : "U10";
const setup = resolveSetup({
  league,
  format,
  settings: { org: "us-soccer", subMode: true, periods: 4 },
});

function Harness() {
  const [lineups, setLineups] = useState(opened.lineups);
  const [roster, setRoster] = useState(players);
  const [gameDay, setGameDay] = useState({
    formation: shape.name,
    homeScore: 0,
    awayScore: 0,
    opponent: "THEM",
    minuteBank: bank,
    appearanceCredit: {},
    subSegments: opened.segments || {},
    pairPlan: {},
    subQueue: [],
    realPeriodEvents: {},
    afterSubs: {},
    startSnapshots: {},
  });
  return (
    <div style={{ width: "100%", maxWidth: 390, minHeight: "100vh", background: "#0a0d0f", color: "#e8e4dc" }}>
      <TabGame
        format={format}
        league={setup.league || league}
        players={roster}
        setPlayers={setRoster}
        addPlayer={() => {}}
        removePlayer={() => {}}
        lineupsByQuarter={lineups}
        setLineupsByQuarter={setLineups}
        setGames={() => {}}
        subMode
        autoRegen
        gameDay={gameDay}
        setGameDay={setGameDay}
        setup={setup}
      />
    </div>
  );
}

createRoot(document.getElementById("root")).render(<Harness />);
