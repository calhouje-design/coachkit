import { useState } from "react";
import { createRoot } from "react-dom/client";
import { TabGame } from "../../App.jsx";
import { planAvailability, returnToGame, scheduleHalfRotation, scheduleWholeGame } from "../gameDay.js";
import { resolveSetup } from "../leagueRules.js";

const slots = ["GK", "LD", "RD", "LM", "RM", "CF"];
const players = ["Ann", "Bea", "Cal", "Dee", "Eve", "Fay", "Gia", "Hal", "Ian"].map((name, index) => ({
  id: `p${index + 1}`,
  name: `${name} Stone`,
  number: String(index + 1),
  positions: ["GK", "LD", "RD", "LM", "RM", "CM", "CF"],
  injured: false,
  out: false,
  ratings: {},
}));

const fullMode = new URLSearchParams(window.location.search).get("mode") === "full";
const opened = fullMode
  ? { lineups: scheduleWholeGame({
    players,
    format: "6v6",
    slotOverride: slots,
    totalPeriods: 4,
    minFraction: 0.5,
    seed: 3,
  }), segments: {} }
  : scheduleHalfRotation(players, slots, {
    minHalves: 4,
    totalQuarters: 4,
    seed: 3,
  });
const absentId = opened.lineups[1].bench[0].id;
const absent = players.map(player => (
  player.id === absentId
    ? { ...player, out: true, injured: false, injuredInQuarter: 1, returnQuarter: null }
    : player
));
const planned = planAvailability({
  autoRegen: true,
  kind: "absent",
  players: absent,
  slots,
  lineups: opened.lineups,
  segments: opened.segments,
  absentId,
  quarter: 1,
  minHalves: 4,
  subMode: !fullMode,
  totalQuarters: 4,
});
const back = returnToGame({
  autoRegen: true,
  players: absent,
  playerId: absentId,
  quarter: 1,
  lineups: planned.lineups,
  segments: planned.segments,
  slots,
  subMode: !fullMode,
  minHalves: 4,
  totalQuarters: 4,
  half: "back",
});

const setup = resolveSetup({
  league: "U10",
  format: "6v6",
  settings: { org: "us-soccer", subMode: !fullMode, periods: 4 },
});

function Harness() {
  const [lineups, setLineups] = useState(back.lineups);
  const [roster, setRoster] = useState(back.players);
  const [gameDay, setGameDay] = useState({
    formation: "2-2-1",
    homeScore: 0,
    awayScore: 0,
    opponent: "Rockets",
    minuteBank: {},
    appearanceCredit: {},
    subSegments: back.segments || {},
    pairPlan: {},
    subQueue: [],
    realPeriodEvents: {},
    afterSubs: {},
    startSnapshots: {},
  });
  return (
    <div style={{ minHeight: "100vh", background: "#0a0d0f", color: "#e8e4dc", fontFamily: "Georgia, serif" }}>
      <div data-testid="returner-id" data-player-id={absentId} />
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
        subMode={!fullMode}
        autoRegen
        gameDay={gameDay}
        setGameDay={setGameDay}
        setup={setup}
      />
    </div>
  );
}

createRoot(document.getElementById("root")).render(<Harness />);
