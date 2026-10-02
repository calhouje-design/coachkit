import { useState } from "react";
import { createRoot } from "react-dom/client";
import { TabGame, TabSeason } from "../../App.jsx";
import { scheduleHalfRotation, shareFieldSheet, sharePlayTimeSheet } from "../gameDay.js";
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

const logPlayers = players.slice(0, 6);
const logStarters = logPlayers.map((player, index) => ({ pos: slots[index], player }));
const logLineups = {
  1: { starters: logStarters, bench: [] },
  2: { starters: logStarters, bench: [] },
};
const logField = shareFieldSheet({
  lineups: logLineups,
  pairPlan: {},
  subMode: false,
  quarters: [1, 2],
  periodAbbrev: "H",
});
const logPlay = sharePlayTimeSheet({
  players: logPlayers,
  lineups: logLineups,
  segments: {},
  credit: {},
  minQ: 1,
  quarters: [1, 2],
  periodAbbrev: "H",
});
const loggedGame = {
  id: "g-log",
  date: "2026-09-27",
  opponent: "Comets",
  homeScore: 2,
  oppScore: 1,
  notes: "",
  strategy: {
    formation: "2-2-1",
    subMode: false,
    periodType: "halves",
    periods: 2,
    league: "U10",
    format: "6v6",
    sheets: { field: logField, playTime: logPlay },
  },
};

function Harness() {
  const [lineups, setLineups] = useState(planned.lineups);
  const [roster, setRoster] = useState(players);
  const [games, setGames] = useState([loggedGame]);
  const [playerStats, setPlayerStats] = useState({});
  const [practiceDates, setPracticeDates] = useState([]);
  const [practiceAttendance, setPracticeAttendance] = useState({});
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
        setGames={setGames}
        subMode
        autoRegen
        gameDay={gameDay}
        setGameDay={setGameDay}
        setup={setup}
      />
      <div data-testid="season-log">
        <TabSeason
          players={logPlayers}
          playerStats={playerStats}
          setPlayerStats={setPlayerStats}
          games={games}
          setGames={setGames}
          practiceDates={practiceDates}
          setPracticeDates={setPracticeDates}
          practiceAttendance={practiceAttendance}
          setPracticeAttendance={setPracticeAttendance}
        />
      </div>
    </div>
  );
}

createRoot(document.getElementById("root")).render(<Harness />);
