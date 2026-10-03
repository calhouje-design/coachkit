import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { GameSettings, TabGame, TabSeason } from "../../App.jsx";
import BuildStamp from "../../components/BuildStamp.jsx";
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

const params = new URLSearchParams(typeof window === "undefined" ? "" : window.location.search);
const periodCount = params.get("periods") === "halves" ? 2 : 4;
const planned = scheduleHalfRotation(players, slots, {
  minHalves: periodCount === 2 ? 2 : 4,
  totalQuarters: periodCount,
  rate: () => 1,
});

const setup = resolveSetup({
  league: "U10",
  format: "6v6",
  settings: { org: "us-soccer", subMode: true, periods: periodCount },
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
const splitLog = params.get("log") === "split";
const splitField = splitLog ? {
  ...logField,
  quarters: logField.quarters.map((panel, index) => {
    if (index !== 0) return { ...panel, label: "Q2", quarter: 2 };
    const starters = panel.starters.map((slot, slotIndex) => {
      if (slotIndex === 1) return { ...panel.starters[2], idx: slot.idx };
      if (slotIndex === 2) return { ...panel.starters[1], idx: slot.idx };
      return slot;
    });
    return {
      ...panel,
      label: "Q1",
      quarter: 1,
      after: { ...panel, label: "Q1", quarter: 1, starters, pairs: [] },
    };
  }),
} : logField;
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
    sheets: { field: splitField, playTime: logPlay },
  },
};

function loggedGames() {
  const count = Math.max(1, Number(new URLSearchParams(window.location.search).get("games")) || 1);
  return Array.from({ length: count }, (_, index) => ({
    ...loggedGame,
    id: index === 0 ? loggedGame.id : `g-log-${index}`,
    opponent: index === 0 ? loggedGame.opponent : `Comets ${index + 1}`,
    date: index === 0 ? loggedGame.date : `2026-08-${String((index % 27) + 1).padStart(2, "0")}`,
  }));
}

function Harness() {
  const subMode = new URLSearchParams(window.location.search).get("sub") !== "0";
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [lineups, setLineups] = useState(planned.lineups);
  const [roster, setRoster] = useState(players);
  const [games, setGames] = useState(loggedGames);
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
  useEffect(() => {
    window.__coachkitSameContentRender = () => {
      setRoster((current) => current.map((player) => ({ ...player })));
    };
    window.__coachkitChangeScore = () => {
      setGameDay((current) => ({ ...current, homeScore: Number(current.homeScore || 0) + 1 }));
    };
    return () => {
      delete window.__coachkitSameContentRender;
      delete window.__coachkitChangeScore;
    };
  }, []);
  return (
    <div style={{ minHeight: "100vh", background: "#0a0d0f", color: "#e8e4dc", fontFamily: "Georgia, serif" }}>
      <button type="button" aria-label="Settings" onClick={() => setSettingsOpen(true)} style={{ position: "absolute", top: 8, right: 8, zIndex: 5 }}>
        Settings
      </button>
      <GameSettings
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        subMode
        onSubMode={() => {}}
        setup={setup}
        onOrgChange={() => {}}
        onAgeChange={() => {}}
        onFormatChange={() => {}}
        onGkChange={() => {}}
        onPeriodsChange={() => {}}
        onSeasonChange={() => {}}
        autoRegen
        onAutoRegen={() => {}}
        quarterMinutes={null}
        onQuarterMinutes={() => {}}
        fairPlayLabel="Fair-play target"
      />
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
        subMode={subMode}
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
      <BuildStamp />
    </div>
  );
}

createRoot(document.getElementById("root")).render(<Harness />);
