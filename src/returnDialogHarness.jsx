import { useState } from "react";
import { createRoot } from "react-dom/client";
import { ReturnDialog } from "./components/ReturnDialog.jsx";

const players = {
  a: {
    id: "p7",
    name: "Remi Stone",
    number: "7",
    out: true,
    injured: false,
    injuredInQuarter: 1,
  },
  b: {
    id: "p8",
    name: "Jude Garcia",
    number: "8",
    out: true,
    injured: false,
    injuredInQuarter: 1,
  },
};

function Harness() {
  const [quarter, setQuarter] = useState(2);
  const [log, setLog] = useState([]);
  const [open, setOpen] = useState(true);
  const [who, setWho] = useState("a");
  const [toast, setToast] = useState(null);
  const player = players[who];
  const openReturn = (next) => {
    setToast(null);
    setWho(next);
    setOpen(true);
  };
  return (
    <div style={{ minHeight: "100vh", background: "#0a0d0f", color: "#e8e4dc", fontFamily: "Georgia, serif" }}>
      <header
        id="ck-app-header"
        data-testid="app-header"
        style={{
          position: "sticky",
          top: 0,
          zIndex: 100,
          height: 52,
          background: "#111810",
          display: "flex",
          alignItems: "center",
          padding: "0 16px",
          fontWeight: 800,
        }}
      >
        CoachKit
      </header>
      <div data-testid="viewing" style={{ padding: 16 }}>Viewing Q{quarter}</div>
      <button type="button" data-testid="reopen" onClick={() => openReturn(who)}>Open</button>
      <button type="button" data-testid="open-b" onClick={() => openReturn("b")}>Return Jude</button>
      <pre data-testid="log">{log.join("\n")}</pre>
      {toast && (
        <div
          role="status"
          data-testid="return-toast"
          style={{
            position: "fixed",
            left: "50%",
            bottom: 24,
            transform: "translateX(-50%)",
            zIndex: 150,
            maxWidth: 360,
            width: "calc(100% - 32px)",
            background: "#141a12",
            color: "#e8e4dc",
            border: "1px solid #e8a020",
            borderRadius: 12,
            padding: "12px 14px",
            fontSize: 14,
            fontWeight: 700,
            textAlign: "center",
            boxShadow: "0 8px 24px rgba(0,0,0,0.45)",
          }}
        >{toast}</div>
      )}
      <ReturnDialog
        open={open}
        player={player}
        selectedQuarter={quarter}
        totalQuarters={4}
        subMode
        hasSheet
        periodAbbrev="Q"
        finished={[1]}
        outSince={1}
        liveQuarters={{ 3: false, 2: false, 4: false }}
        onCancel={() => {
          setLog(prev => [...prev, "cancel"]);
          setOpen(false);
        }}
        onConfirm={(choice) => {
          setLog(prev => [...prev, JSON.stringify({ ...choice, playerId: player.id })]);
          setOpen(false);
          setToast(`${player.name.split(" ")[0]} back for Q${choice.quarter}.`);
        }}
        onSwitchQuarter={(next) => setQuarter(next)}
      />
    </div>
  );
}

createRoot(document.getElementById("root")).render(<Harness />);
