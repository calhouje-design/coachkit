import { useState } from "react";
import { createRoot } from "react-dom/client";
import { TabGame } from "../../App.jsx";
import { scheduleHalfRotation } from "../gameDay.js";
import { FORMATION_TEMPLATES } from "../formations.js";
import { resolveSetup } from "../leagueRules.js";

const shape = new URLSearchParams(window.location.search).get("shape") || "4-4-2";
const formation = FORMATION_TEMPLATES["11v11"].find(entry => entry.name === shape);
if (!formation) throw new Error(`unknown shape ${shape}`);

const names = [
  "Christopher Montgomery", "Alexander Richardson", "Benjamin Harrington",
  "Nathaniel Pemberton", "Sebastian Callahan", "Maximilian Holloway",
  "Christopher Ellington", "Alexander Pembroke", "Benjamin Sutterfield",
  "Nathaniel Broderick", "Sebastian Langford", "Maximilian Cartwright",
  "Christopher Delaney", "Alexander Forsythe", "Benjamin Aldridge",
  "Nathaniel Kingsley",
];
const positions = ["GK", "LB", "CB", "RB", "LM", "CM", "RM", "LF", "RF", "CF"];
const players = names.map((name, index) => ({
  id: `p${index + 1}`,
  name,
  number: String(index + 1),
  positions,
  injured: false,
  out: false,
  ratings: {},
}));

const planned = scheduleHalfRotation(players, formation.slots, {
  minHalves: 4,
  totalQuarters: 4,
  seed: 1,
  rate: () => 1,
});

const setup = resolveSetup({
  league: "U13",
  format: "11v11",
  settings: { org: "custom", custom: { playersOnField: 11, gk: true, periods: 4 } },
});

function Harness() {
  const [lineups, setLineups] = useState(planned.lineups);
  const [roster, setRoster] = useState(players);
  const [gameDay, setGameDay] = useState({
    formation: shape,
    homeScore: 0,
    awayScore: 0,
    opponent: "Rockets",
    minuteBank: {},
    appearanceCredit: {},
    subSegments: planned.segments || {},
    pairPlan: {},
    subQueue: [],
    realPeriodEvents: {},
    afterSubs: {},
    startSnapshots: {},
  });
  return (
    <div style={{ minHeight: "100vh", background: "#0a0d0f", color: "#e8e4dc", padding: "20px 16px", fontFamily: "Georgia, serif" }}>
      <TabGame
        format="11v11"
        league="U13"
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
