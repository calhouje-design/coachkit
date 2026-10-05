import { useState } from "react";
import { createRoot } from "react-dom/client";
import { TabGame } from "../../App.jsx";
import {
  backHalfStripNotice,
  noteSubSegment,
  planAvailability,
  returnToGame,
  scheduleHalfRotation,
  vacatedSpotHolder,
} from "../gameDay.js";
import { resolveSetup } from "../leagueRules.js";

const slots = ["GK", "LD", "RD", "LM", "RM", "CF"];
const positions = ["GK", "LD", "RD", "LM", "RM", "CM", "CF"];
const params = new URLSearchParams(window.location.search);
const injury = params.get("case") === "m2";
const showNotice = params.get("case") === "notice";

const names = ["John Smith", "Wes Johnson", "Jaxon Williams", "Remi Brown", "Sean Jones", "Henry Davis", "Jude Garcia", "Trey Miller", "Maddox Anderson"];

const players = names.map((name, index) => ({
  id: `p${index + 1}`,
  name,
  number: String(index + 1),
  positions,
  injured: false,
  out: false,
  ratings: {},
}));

function subReturn() {
  const opened = scheduleHalfRotation(players, slots, { minHalves: 4, totalQuarters: 4, seed: 2 });
  const wes = players.find(player => player.name.startsWith("Wes"));
  const absent = players.map(player => (
    player.id === wes.id
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
    absentId: wes.id,
    quarter: 1,
    minHalves: 4,
    subMode: true,
    totalQuarters: 4,
  });
  return returnToGame({
    players: absent,
    playerId: wes.id,
    quarter: 2,
    half: "back",
    lineups: planned.lineups,
    segments: planned.segments,
    slots,
    subMode: true,
    minHalves: 4,
    totalQuarters: 4,
  });
}

function injuryReturn() {
  const john = players[0];
  const wes = players[1];
  const starters = [
    { pos: "GK", player: players[5] },
    { pos: "LD", player: wes },
    { pos: "RD", player: players[2] },
    { pos: "LM", player: players[3] },
    { pos: "RM", player: players[4] },
    { pos: "CF", player: players[6] },
  ];
  const bench = [john, players[7], players[8]];
  const lineups = {};
  for (let quarter = 1; quarter <= 4; quarter += 1) {
    lineups[quarter] = {
      starters: starters.map(slot => ({ ...slot })),
      bench: [...bench],
    };
  }
  const absent = players.map(player => (
    player.id === wes.id
      ? { ...player, injured: true, out: false, midGameInjury: true, injuredInQuarter: 2, returnQuarter: null }
      : player
  ));
  const gone = planAvailability({
    autoRegen: true,
    kind: "absent",
    players: absent,
    absentId: wes.id,
    quarter: 2,
    lineups,
    segments: {},
    slots,
    subMode: false,
    minHalves: 4,
    totalQuarters: 4,
    livePeriod: true,
  });
  const replacedBy = vacatedSpotHolder(lineups[2], gone.lineups[2], wes.id);
  const injured = absent.map(player => (
    player.id === wes.id ? { ...player, replacedBy } : player
  ));
  const marked = noteSubSegment(gone.segments, wes.id, 2, "left");
  return returnToGame({
    players: injured,
    playerId: wes.id,
    quarter: 2,
    half: "back",
    lineups: gone.lineups,
    segments: marked,
    slots,
    subMode: false,
    minHalves: 4,
    totalQuarters: 4,
    livePeriod: true,
  });
}

const back = injury ? injuryReturn() : subReturn();
const setup = resolveSetup({
  league: "U8",
  format: "6v6",
  settings: { org: "say-east", subMode: !injury, periods: 4 },
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
      <TabGame
        format="6v6"
        league="U8"
        players={roster}
        setPlayers={setRoster}
        addPlayer={() => {}}
        removePlayer={() => {}}
        lineupsByQuarter={lineups}
        setLineupsByQuarter={setLineups}
        setGames={() => {}}
        subMode={!injury}
        autoRegen
        initialNotice={showNotice ? backHalfStripNotice(players[1], 3, "Q") : null}
        gameDay={gameDay}
        setGameDay={setGameDay}
        setup={setup}
      />
    </div>
  );
}

createRoot(document.getElementById("root")).render(<Harness />);
