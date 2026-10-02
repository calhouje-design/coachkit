import { useState } from "react";
import { createRoot } from "react-dom/client";
import { TabGame } from "../../App.jsx";
import { scheduleHalfRotation } from "../gameDay.js";
import { resolveSetup } from "../leagueRules.js";

const slots = ["GK", "LD", "RD", "LM", "RM", "CF"];
const players = ["Ann", "Bea", "Cal", "Dee", "Eve", "Fay", "Gia", "Hal"].map((name, index) => ({
  id: `p${index + 1}`,
  name: `${name} Stone`,
  number: String(index + 1),
  positions: ["GK", "CM", "CF"],
  injured: false,
  out: false,
  ratings: {},
}));

const planned = scheduleHalfRotation(players, slots, {
  minHalves: 4,
  totalQuarters: 4,
  rate: () => 1,
});

const setup = resolveSetup({
  league: "U10",
  format: "6v6",
  settings: { org: "us-soccer", subMode: true, periods: 4 },
});

function Harness() {
  const [lineups, setLineups] = useState(planned.lineups);
  const [roster, setRoster] = useState(players);
  const [gameDay, setGameDay] = useState({
    formation: "2-2-1",
    homeScore: 1,
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
    <div style={{ minHeight: "100vh", background: "#0a0d0f", color: "#e8e4dc", fontFamily: "Georgia, serif" }}>
      <TabGame
        format="6v6"
        league="U10"
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
